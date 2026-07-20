import { useRef, useState, useEffect, useCallback } from 'react';
import { useLiveTranscriptionSocket } from './useLiveTranscriptionSocket';

// Microphone → MediaRecorder → live WS transcription, as one reusable hook.
//
// Extracted from ClinicalReportModal so assessment dictation inherits the same
// hard-won handling rather than re-deriving it: the mic going mute mid-call, the
// device being unplugged, credits running out before the socket is ready, and the
// WebM/EBML header chunk the relay needs resent on reconnect.
//
// The caller owns what happens with the transcript; this hook only produces it.
//
//   const dictation = useDictation();
//   await dictation.start();                     // throws with a human-readable message
//   dictation.pause() / dictation.resume();
//   const { transcript, durationSeconds } = await dictation.stop();
//   dictation.cancel();                          // abandon; nothing is finalized
//
// State: 'idle' | 'recording' | 'paused' | 'finalizing'

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg', ''];
  return candidates.find(t => !t || MediaRecorder.isTypeSupported(t)) || '';
}

// Turn a getUserMedia DOMException into something a dentist can act on.
function micErrorMessage(err) {
  const name = err?.name || '';
  const inIframe = window.self !== window.top;

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return inIframe
      ? 'Microphone is blocked because this app is embedded. Open it in its own browser tab and try again.'
      : 'Microphone access is blocked for this site. Click the 🔒 icon in the address bar → set Microphone to "Allow" → reload and try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone found. Please connect one and try again.';
  if (name === 'NotReadableError') return 'Microphone is in use by another app. Close it and try again.';
  if (name === 'NotSupportedError') return 'Microphone access requires a secure (HTTPS) connection.';
  return `Could not access the microphone: ${err?.message || 'unknown error'}.`;
}

export function useDictation({ onCreditsExhausted } = {}) {
  const socket = useLiveTranscriptionSocket();

  const recorderRef  = useRef(null);
  const streamRef    = useRef(null);

  const [state, setState]     = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [warning, setWarning] = useState(''); // non-fatal: mic muted, device lost

  // Elapsed-time counter. Pausing freezes it — the count is what we bill on, so it
  // must track audio actually captured, not wall-clock time with the panel open.
  useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => { try { t.stop(); } catch { /* noop */ } });
    streamRef.current = null;
  }, []);

  // Release the mic if the component unmounts mid-recording — otherwise the browser
  // keeps showing its "recording" indicator and the device stays locked.
  useEffect(() => () => {
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    releaseMic();
    socket.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    setWarning('');
    setSeconds(0);

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access requires a secure (HTTPS) connection.');
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      throw new Error(micErrorMessage(err));
    }
    streamRef.current = stream;

    // A phone call or a yanked USB mic must not silently produce an empty transcript.
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.onmute   = () => setWarning('Microphone paused — an incoming call? Recording is on hold.');
      track.onunmute = () => setWarning('');
      track.onended  = () => {
        setWarning('Microphone disconnected — processing what was captured.');
        try { recorderRef.current?.stop(); } catch { /* noop */ }
      };
    }

    socket.disconnect(); // clear any stale connection from a previous take

    const mimeType = pickMimeType();
    let recorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }

    recorder.ondataavailable = e => {
      if (e.data.size > 0) socket.sendChunk(e.data); // buffered by the hook until 'ready'
    };
    recorderRef.current = recorder;
    recorder.start(100); // 100ms chunks → the transcript appears as they speak
    setState('recording');

    // Don't await: the socket buffers pre-'ready' chunks (and resends the EBML header
    // on reconnect), so recording can begin before the relay handshake completes.
    socket.connect().catch(err => {
      if (err?.code === 'insufficient_credits') {
        try { recorderRef.current?.stop(); } catch { /* noop */ }
        releaseMic();
        setState('idle');
        onCreditsExhausted?.();
        setWarning('Out of AI credits. Please contact your administrator.');
      } else {
        setWarning(err?.message || 'Live transcription unavailable. Please try again.');
      }
    });
  }, [socket, releaseMic, onCreditsExhausted]);

  const pause = useCallback(() => {
    if (recorderRef.current?.state !== 'recording') return;
    try { recorderRef.current.requestData(); } catch { /* not all browsers */ }
    recorderRef.current.pause();
    setState('paused');
  }, []);

  const resume = useCallback(() => {
    if (recorderRef.current?.state !== 'paused') return;
    recorderRef.current.resume();
    setState('recording');
  }, []);

  // Flush the recorder's final buffered audio, then await the relay's finalized
  // transcript. Resolves with what was actually captured.
  const stop = useCallback(async () => {
    setState('finalizing');
    try { recorderRef.current?.requestData(); } catch { /* not all browsers */ }
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    releaseMic();

    try {
      const { transcript, duration_seconds } = await socket.stop();
      setState('idle');
      return { transcript: (transcript || '').trim(), durationSeconds: duration_seconds || seconds };
    } catch (err) {
      setState('idle');
      throw err;
    }
  }, [socket, releaseMic, seconds]);

  // Abandon — nothing is finalized, no transcript is produced.
  const cancel = useCallback(() => {
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    releaseMic();
    socket.disconnect();
    setState('idle');
    setSeconds(0);
    setWarning('');
  }, [socket, releaseMic]);

  return {
    state,                                 // idle | recording | paused | finalizing
    seconds,
    warning,
    liveTranscript: socket.liveTranscript, // ticks in as they speak
    isActive: state === 'recording' || state === 'paused' || state === 'finalizing',
    start, pause, resume, stop, cancel,
  };
}
