import { useState, useRef, useEffect } from 'react';

const CODEC_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return CODEC_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function mimeToExtension(mimeType) {
  if (!mimeType) return 'webm';
  if (mimeType.startsWith('audio/mp4')) return 'mp4';
  if (mimeType.startsWith('audio/ogg')) return 'ogg';
  return 'webm';
}

/**
 * useMicRecorder — cross-platform microphone recording hook.
 *
 * Returns { micState, start, stop, reset }
 *
 * micState shape:
 *   status: 'idle' | 'requesting' | 'recording' | 'stopping' | 'error'
 *   errorCode: 'permission-denied' | 'no-microphone' | 'in-use' | 'interrupted' | 'browser-unsupported' | 'unknown' | null
 *   errorMessage: string
 *   isInterrupted: boolean   (mic muted by incoming call)
 *   permissionState: 'granted' | 'denied' | 'prompt' | null
 *
 * stop() → Promise<{ blob, mimeType, extension, durationMs }>
 */
export function useMicRecorder() {
  const [micState, setMicState] = useState({
    status: 'idle',
    errorCode: null,
    errorMessage: '',
    isInterrupted: false,
    permissionState: null,
  });

  const recorderRef    = useRef(null);
  const chunksRef      = useRef([]);
  const streamRef      = useRef(null);
  const startTimeRef   = useRef(null);
  const resolveStopRef = useRef(null);
  const mimeTypeRef    = useRef('');

  // Query permission state on mount; keep it live
  useEffect(() => {
    if (!navigator.permissions) return;
    navigator.permissions.query({ name: 'microphone' })
      .then(ps => {
        patch({ permissionState: ps.state });
        ps.onchange = () => patch({ permissionState: ps.state });
      })
      .catch(() => {});
  }, []);

  function patch(updates) {
    setMicState(s => ({ ...s, ...updates }));
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      patch({ status: 'error', errorCode: 'browser-unsupported', errorMessage: 'Your browser does not support audio recording.' });
      return;
    }

    patch({ status: 'requesting', errorCode: null, errorMessage: '', isInterrupted: false });

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const code =
        (err.name === 'NotAllowedError'  || err.name === 'PermissionDeniedError') ? 'permission-denied' :
        (err.name === 'NotFoundError'    || err.name === 'DevicesNotFoundError')  ? 'no-microphone' :
        (err.name === 'NotReadableError' || err.name === 'TrackStartError')       ? 'in-use' :
        'unknown';
      const msg =
        code === 'permission-denied' ? 'Microphone permission was denied.' :
        code === 'no-microphone'     ? 'No microphone found on this device.' :
        code === 'in-use'            ? 'Microphone is in use by another app.' :
        (err.message || 'Could not access the microphone.');
      patch({ status: 'error', errorCode: code, errorMessage: msg });
      return;
    }

    streamRef.current = stream;

    // Interruption detection (incoming call, permission withdrawn)
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.onmute = () => patch({
        isInterrupted: true,
        errorCode: 'interrupted',
        errorMessage: 'Microphone paused — was there an incoming call?',
      });
      track.onunmute = () => patch({ isInterrupted: false, errorCode: null, errorMessage: '' });
      track.onended = () => {
        patch({
          status: 'error',
          errorCode: 'interrupted',
          errorMessage: 'Recording interrupted — the microphone was taken by another app.',
        });
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          try { recorderRef.current.stop(); } catch (_) {}
        }
      };
    }

    // Codec probe with Android constructor fallback
    const mimeType = pickMimeType();
    mimeTypeRef.current = mimeType;
    chunksRef.current = [];

    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      // Android: isTypeSupported() returned true but constructor threw — retry bare
      try {
        recorder = new MediaRecorder(stream);
        mimeTypeRef.current = recorder.mimeType || '';
      } catch (err2) {
        patch({ status: 'error', errorCode: 'browser-unsupported', errorMessage: 'Recorder failed to start: ' + err2.message });
        stream.getTracks().forEach(t => t.stop());
        return;
      }
    }

    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const actualMime = recorder.mimeType || mimeTypeRef.current || 'audio/webm';
      const extension  = mimeToExtension(actualMime);
      const blob       = new Blob(chunksRef.current, { type: actualMime });
      const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      patch({ status: 'idle' });
      resolveStopRef.current?.({ blob, mimeType: actualMime, extension, durationMs });
      resolveStopRef.current = null;
    };

    recorderRef.current = recorder;
    startTimeRef.current = Date.now();
    recorder.start(100); // 100ms timeslice — prevents data loss on short recordings
    patch({ status: 'recording' });
  }

  function stop() {
    return new Promise(resolve => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        resolveStopRef.current = resolve;
        patch({ status: 'stopping' });
        recorderRef.current.stop();
      } else {
        // Already stopped (e.g. by track.onended)
        const actualMime = mimeTypeRef.current || 'audio/webm';
        const blob       = new Blob(chunksRef.current, { type: actualMime });
        const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
        patch({ status: 'idle' });
        resolve({ blob, mimeType: actualMime, extension: mimeToExtension(actualMime), durationMs });
      }
    });
  }

  function reset() {
    patch({ status: 'idle', errorCode: null, errorMessage: '', isInterrupted: false });
  }

  return { micState, start, stop, reset };
}
