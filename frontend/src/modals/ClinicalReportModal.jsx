import { useRef, useState, useEffect } from 'react';
import {
  X, Mic, MicOff, Loader2, CheckCircle, ExternalLink,
  FileText, Minimize2, Maximize2, Sparkles, Save, SendHorizonal,
  ChevronDown, XCircle, Pause, Play, Edit3,
  RefreshCw, Headphones, HelpCircle, Settings2,
} from 'lucide-react';
import { openExternal } from '../utils/openExternal';
import API from '../services/api';
import { useAuth } from '../Context/AuthContext.jsx';
import { useUser } from '../Context/UserContext.jsx';
import { useLiveTranscriptionSocket } from '../hooks/useLiveTranscriptionSocket.js';

// Substitute {{placeholder}} tokens; unknown tokens collapse to ''.
export function applyVars(str, vars) {
  if (typeof str !== 'string') return '';
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));
}

// Build the variable map used for report-delivery templates.
export function reportDeliveryVars(patient, user, selectedTemplate) {
  const patientName = patient ? `${patient.first_name} ${patient.last_name || ''}`.trim() : '';
  return {
    patientName,
    firstName:    patient?.first_name || patientName,
    doctorName:   user?.name || 'Your Doctor',
    clinicName:   user?.clinicName || user?.tenantName || '',
    date:         new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    templateName: selectedTemplate?.name || 'clinical report',
  };
}

// Parse a backend error — may be a JSON-serialized classified error or a plain string.
function parseError(raw) {
  if (!raw) return null;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (obj && obj.source && obj.userMessage) return obj;
  } catch { /* not JSON */ }
  return { source: 'unknown', code: 'unknown', userMessage: raw, detail: raw };
}

const SOURCE_LABEL = { sarvam: 'Sarvam-105B', unknown: 'Error' };
const CODE_COLOR   = {
  auth:       'bg-amber-50 border-amber-200 text-amber-800',
  rate_limit: 'bg-orange-50 border-orange-200 text-orange-800',
  timeout:    'bg-blue-50  border-blue-200  text-blue-800',
  config:     'bg-amber-50 border-amber-200 text-amber-800',
  server:     'bg-red-50   border-red-200   text-red-700',
  empty:      'bg-yellow-50 border-yellow-200 text-yellow-800',
  unknown:    'bg-red-50   border-red-200   text-red-700',
};

function ErrorBadge({ error }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseError(error);
  if (!parsed) return null;
  const colors = CODE_COLOR[parsed.code] || CODE_COLOR.unknown;
  const sourceLabel = SOURCE_LABEL[parsed.source] || 'Error';
  const showDetail  = parsed.detail && parsed.detail !== parsed.userMessage;

  return (
    <div className={`border rounded-lg px-4 py-3 text-sm ${colors}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <XCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{parsed.userMessage}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black/10 uppercase tracking-wide">
            {sourceLabel}
          </span>
          {showDetail && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-[10px] underline opacity-60 hover:opacity-100"
            >
              {expanded ? 'hide' : 'details'}
            </button>
          )}
        </div>
      </div>
      {expanded && showDetail && (
        <pre className="mt-2 text-[10px] opacity-70 whitespace-pre-wrap break-all font-mono border-t border-current/20 pt-2">
          {parsed.detail}
        </pre>
      )}
    </div>
  );
}

function ReportDisplay({ text }) {
  if (!text) return <p className="text-slate-400 italic">Not generated.</p>;
  return (
    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-mono bg-slate-50 rounded-lg p-4 border border-slate-100 overflow-y-auto max-h-[200px] sm:max-h-[280px]">
      {text}
    </div>
  );
}

// ── Audio waveform visualizer ──────────────────────────────────────────────────
function WaveformBar({ analyserRef, active }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    if (!active || !analyserRef.current) return;
    const analyser = analyserRef.current;
    const canvas   = canvasRef.current;
    if (!canvas) return;
    const ctx  = canvas.getContext('2d');
    const data = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const bars = 40;
      const gap  = 2;
      const barW = (W - gap * (bars - 1)) / bars;
      const step = Math.floor(data.length / bars);

      for (let i = 0; i < bars; i++) {
        const val    = data[i * step] / 255;
        const height = Math.max(3, val * H);
        const alpha  = 0.4 + val * 0.6;
        ctx.fillStyle = `rgba(19,127,236,${alpha})`;
        ctx.beginPath();
        ctx.roundRect(i * (barW + gap), (H - height) / 2, barW, height, 2);
        ctx.fill();
      }
    }
    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [active, analyserRef]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={48}
      className={`rounded-lg transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-0'}`}
      style={{ width: '100%', maxWidth: 320, height: 48 }}
    />
  );
}

const DETAIL_LEVELS = [
  { key: 'brief',    label: 'Brief'    },
  { key: 'standard', label: 'Standard' },
  { key: 'detailed', label: 'Detailed' },
];

export default function ClinicalReportModal({ isOpen, onClose, patientId, appointmentId, patient, onSuccess }) {
  const { user } = useAuth();
  const { reloadCredits } = useUser();
  const mediaRecorderRef  = useRef(null);
  const audioChunksRef    = useRef([]);
  const cancelledRef      = useRef(false);
  const analyserRef       = useRef(null);
  const audioCtxRef       = useRef(null);
  const streamRef         = useRef(null);
  const audioPlaybackRef  = useRef(null);
  const playbackUrlRef    = useRef(null);
  const isGeneratingRef   = useRef(false);
  const generateAbortRef  = useRef(null);

  // Live transcription over WebSocket (browser → ffmpeg → Sarvam).
  const liveSocket = useLiveTranscriptionSocket();

  // stages: idle | recording | paused | transcribing | editing | generating | done
  const [stage, setStage]               = useState('idle');
  const [minimized, setMinimized]       = useState(false);
  const [transcript, setTranscript]     = useState('');
  const [editedTranscript, setEditedTranscript] = useState('');
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [reportText, setReportText]     = useState('');
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [driveLinks, setDriveLinks]     = useState({});
  const [templateId, setTemplateId]     = useState('');
  const [error, setError]               = useState('');
  const [textInput, setTextInput]       = useState('');
  const [jobId, setJobId]               = useState(null);
  const [cachedTranscript, setCachedTranscript] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0); // elapsed dictation time
  const jobPollRef = useRef(null);

  // Tick the elapsed-time counter every second while actively recording. Pausing
  // freezes it (interval cleared); the final value equals the dictation length
  // that gets billed as credits.
  useEffect(() => {
    if (stage !== 'recording') return;
    const id = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [stage]);

  // Template state
  const [templates, setTemplates]                   = useState([]);
  const [selectedTemplate, setSelectedTemplate]     = useState(null);
  const [detailLevel, setDetailLevel]               = useState('standard');
  const [saveReport, setSaveReport]                 = useState(true);

  // Playback preview state
  const [playbackUrl, setPlaybackUrl]               = useState(null);
  const [isPlayingBack, setIsPlayingBack]           = useState(false);
  const [playbackProgress, setPlaybackProgress]     = useState(0);
  const [playbackDuration, setPlaybackDuration]     = useState(0);

  // Approve (save-to-Cloud) state
  const [delivering, setDelivering] = useState(false);
  const [deliverResults, setDeliverResults] = useState({});

  // Cancel generation
  const [cancelling, setCancelling] = useState(false);

  // Delivery settings panel (toggled from done stage)
  const [showDeliveryPanel, setShowDeliveryPanel] = useState(false);
  const [deliverySettings, setDeliverySettings]   = useState(null);
  const [deliverySaving, setDeliverySaving]       = useState(false);
  const [deliveryBanner, setDeliveryBanner]       = useState(null);

  // Fetch templates + delivery settings on first open
  useEffect(() => {
    if (isOpen && templates.length === 0) {
      console.log('[ClinicalReportModal] Fetching templates...');
      API.get('/report/templates')
        .then(r => {
          console.log('[ClinicalReportModal] Templates fetched:', r.data);
          setTemplates(r.data);
        })
        .catch(err => {
          console.error('[ClinicalReportModal] Failed to fetch templates:', err.response?.data || err.message);
        });
    }
    if (isOpen && !deliverySettings) {
      console.log('[ClinicalReportModal] Fetching delivery settings...');
      API.get('/report/delivery-settings')
        .then(r => {
          console.log('[ClinicalReportModal] Delivery settings fetched:', r.data);
          setDeliverySettings(r.data);
        })
        .catch(err => {
          console.error('[ClinicalReportModal] Failed to fetch delivery settings:', {
            status: err.response?.status,
            statusText: err.response?.statusText,
            data: err.response?.data,
            message: err.message
          });
        });
    }
  }, [isOpen]);

  // Media session hardware button (Bluetooth mic pause/resume)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (stage === 'recording' || stage === 'paused') {
      navigator.mediaSession.setActionHandler('pause', () => pauseRecording());
      navigator.mediaSession.setActionHandler('play',  () => resumeRecording());
    } else {
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('play',  null);
    }
  }, [stage]);

  // Load delivery settings (for the Branded PDF panel) when the report is done.
  useEffect(() => {
    if (stage !== 'done') return;
    setDeliverResults({});

    API.get('/report/delivery-settings')
      .then(res => {
        setDeliverySettings(res.data || {});
      })
      .catch(err => {
        console.warn('[ClinicalReportModal] Failed to load delivery settings in done stage:', err.response?.status, err.message);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  function fmtTime(secs) {
    const s = Math.floor(secs || 0);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function revokePlaybackUrl() {
    if (playbackUrlRef.current) {
      URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = null;
    }
    setPlaybackUrl(null);
    setIsPlayingBack(false);
    setPlaybackProgress(0);
    setPlaybackDuration(0);
  }

  function resetState() {
    setStage('idle');
    setTranscript('');
    setEditedTranscript('');
    setIsEditingTranscript(false);
    setReportText('');
    setIsEditingReport(false);
    setStreamingText('');
    setDriveLinks({});
    setTemplateId('');
    setError('');
    setMinimized(false);
    setSelectedTemplate(null);
    setDetailLevel('standard');
    setSaveReport(true);
    setTextInput('');
    setJobId(null);
    setCachedTranscript(false);
    setDelivering(false);
    setDeliverResults({});
    setCancelling(false);
    setShowDeliveryPanel(false);
    setDeliveryBanner(null);
    revokePlaybackUrl();
    if (jobPollRef.current) { clearInterval(jobPollRef.current); jobPollRef.current = null; }
    if (generateAbortRef.current) { generateAbortRef.current.abort(); generateAbortRef.current = null; }
    isGeneratingRef.current = false;
  }

  function handleClose() {
    if (stage === 'recording' || stage === 'paused') {
      cancelledRef.current = true;
      try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
    }
    liveSocket.disconnect();   // hard-close the WS without finalizing
    cleanupAudio();
    resetState();
    cancelledRef.current = false;
    onClose();
  }

  function cleanupAudio() {
    if (audioPlaybackRef.current) { audioPlaybackRef.current.pause(); audioPlaybackRef.current.src = ''; }
    revokePlaybackUrl();
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    analyserRef.current = null;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }

  function handleTemplateChange(e) {
    const t = templates.find(tmpl => tmpl.id === e.target.value) || null;
    setSelectedTemplate(t);
  }

  // ── Approve & Send: run each ticked channel, collect per-channel results ────────
  async function handleCancelGeneration() {
    if (generateAbortRef.current) {
      generateAbortRef.current.abort();
      generateAbortRef.current = null;
    }
    isGeneratingRef.current = false;
    setCancelling(true);
    if (jobId) {
      try { await API.patch(`/report/jobs/${jobId}/cancel`); } catch { /* ignore */ }
    }
    setStage('editing');
    setStreamingText('');
    setCancelling(false);
  }

  // Approve = save the report to Connect Cloud (Google Drive). Sharing (email /
  // WhatsApp) is handled elsewhere in the app — not from this modal.
  async function handleApprove() {
    setDelivering(true);
    const results = {};
    const existingLink = driveLinks[templateId] || '';

    try {
      if (existingLink) {
        results.cloud = { status: 'ok', message: 'Already saved to Connect Cloud' };
      } else {
        const { data } = await API.post(`/report/jobs/${jobId}/save-to-drive`, { report_text: reportText });
        setDriveLinks(d => ({ ...d, [data.templateId || templateId]: data.webViewLink }));
        results.cloud = { status: 'ok', message: 'Saved to Connect Cloud' };
      }
    } catch (err) {
      results.cloud = { status: 'fail', message: err.response?.data?.error || err.message };
    }

    setDeliverResults(results);
    setDelivering(false);
  }

  async function handleSaveDeliverySettings() {
    if (!deliverySettings) return;
    setDeliverySaving(true);
    setDeliveryBanner(null);
    try {
      const { _id, __v, createdAt, updatedAt, ...body } = deliverySettings;
      const res = await API.put('/report/delivery-settings', body);
      setDeliverySettings(res.data);
      setDeliveryBanner({ ok: true, msg: 'Delivery settings saved.' });
    } catch (err) {
      setDeliveryBanner({ ok: false, msg: err.response?.data?.error || err.message });
    } finally {
      setDeliverySaving(false);
    }
  }

  // ── Recording ─────────────────────────────────────────────────────────────────
  function pickMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg', ''];
    return candidates.find(t => !t || MediaRecorder.isTypeSupported(t)) || '';
  }

  async function startRecording() {
    console.log('[ClinicalReport] startRecording called. canRecord=', canRecord, 'stage=', stage, 'template=', selectedTemplate?.id);
    setError('');
    setRecordSeconds(0);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error('mediaDevices unavailable'), { name: 'NotSupportedError' });
      }
      console.log('[ClinicalReport] requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[ClinicalReport] microphone granted');
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source  = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;

      const track = stream.getAudioTracks()[0];
      if (track) {
        track.onmute   = () => setError('⚠️ Microphone paused — was there an incoming call? Your recording is on hold. Tap Pause then Resume, or Stop to process what was captured.');
        track.onunmute = () => setError('');
        track.onended  = () => {
          if (mediaRecorderRef.current?.state === 'recording' || mediaRecorderRef.current?.state === 'paused') {
            try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
          }
          setError('Recording interrupted — your microphone was disconnected. Processing audio captured so far…');
        };
      }

      // Clean slate in case a previous take left a stale connection (re-record).
      liveSocket.disconnect();

      audioChunksRef.current = [];
      const mimeType = pickMimeType();
      let recorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      recorder.ondataavailable = e => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data); // kept only for error-recovery playback
          liveSocket.sendChunk(e.data);        // no-op/buffered until the socket is 'ready'
        }
      };
      recorder.onstop = processRecording;
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setStage('recording');

      // Open the live socket. The first MediaRecorder chunk (EBML header) is tracked
      // by the hook and resent on 'ready'; chunks during connect are buffered, so we
      // don't need to await this. If it fails, transcription can't proceed.
      liveSocket.connect().catch(sockErr => {
        console.error('[ClinicalReport] live connect failed:', sockErr.message);
        setError(sockErr?.message || 'Could not connect to live transcription. Please try again.');
        // Out of credits (or any pre-ready failure): stop the recorder we just
        // started and return to idle — transcription can't proceed.
        if (sockErr?.code === 'insufficient_credits') {
          cancelledRef.current = true;
          try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
          setStage('idle');
          setMinimized(false);
          reloadCredits?.(); // refresh the nav pill (likely 0 now)
        }
      });

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: 'Recording — Dental DMS' });
        navigator.mediaSession.playbackState = 'playing';
      }
    } catch (err) {
      console.error('[ClinicalReport] startRecording failed:', err?.name, err?.message, err);
      const name = err?.name || '';
      const inIframe = window.self !== window.top;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
        if (inIframe) {
          setError('Microphone is blocked because this app is embedded. The embedding page must allow it (iframe allow="microphone"). Open the app in its own browser tab and try again.');
        } else {
          setError('Microphone access is blocked for this site. Click the 🔒/camera icon in the address bar → set Microphone to "Allow" → reload and try again.');
        }
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('No microphone found. Please connect a microphone and try again.');
      } else if (name === 'NotReadableError') {
        setError('Microphone is in use by another app. Close it and try again.');
      } else if (name === 'NotSupportedError') {
        setError('Microphone access requires a secure (HTTPS) connection.');
      } else {
        setError(`Could not access the microphone: ${err?.message || 'unknown error'}.`);
      }
    }
  }

  function pauseRecording() {
    if (mediaRecorderRef.current?.state !== 'recording') return;
    try { mediaRecorderRef.current.requestData(); } catch { /* not all browsers */ }
    mediaRecorderRef.current.pause();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    setStage('paused');

    setTimeout(() => {
      const chunks = [...audioChunksRef.current];
      if (chunks.length === 0) return;
      const mime = mediaRecorderRef.current?.mimeType || 'audio/webm';
      revokePlaybackUrl();
      const blob = new Blob(chunks, { type: mime });
      const url  = URL.createObjectURL(blob);
      playbackUrlRef.current = url;
      setPlaybackUrl(url);
    }, 150);
  }

  function resumeRecording() {
    if (audioPlaybackRef.current) {
      audioPlaybackRef.current.pause();
      audioPlaybackRef.current.currentTime = 0;
    }
    setIsPlayingBack(false);
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      setStage('recording');
    }
  }

  function togglePlayback() {
    const audio = audioPlaybackRef.current;
    if (!audio) return;
    if (isPlayingBack) {
      audio.pause();
      setIsPlayingBack(false);
    } else {
      audio.play().catch(() => {});
      setIsPlayingBack(true);
    }
  }

  function seekPlayback(e) {
    const audio = audioPlaybackRef.current;
    if (!audio || !playbackDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * playbackDuration;
    setPlaybackProgress(audio.currentTime);
  }

  function stopRecording() {
    // Flush the recorder's final buffered audio (a last `dataavailable` → sendChunk),
    // then stop. recorder.onstop calls processRecording, which awaits liveSocket.stop()
    // to retrieve the finalized transcript from the relay.
    try { mediaRecorderRef.current?.requestData(); } catch { /* not all browsers */ }
    mediaRecorderRef.current?.stop();
    cleanupAudio();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
  }

  // Build the JSON body for /report/transcribe. Audio is transcribed live over
  // the WS relay, so this endpoint now takes plain JSON (no multipart upload).
  function buildTranscribeBody(overrides = {}) {
    return {
      patient_id:   patientId,
      template_id:  selectedTemplate.id,
      detail_level: detailLevel,
      save_report:  String(saveReport),
      ...(appointmentId ? { appointment_id: appointmentId } : {}),
      ...overrides,
    };
  }

  // ── Consume SSE stream from /api/report/generate ───────────────────────────
  async function consumeGenerateStream(payload, signal) {
    setStage('generating');
    setStreamingText('');

    const token = localStorage.getItem('dms_token');
    const baseURL = API.defaults.baseURL || 'http://localhost:5000/api';
    const response = await fetch(`${baseURL}/report/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      if (response.status === 402) {
        const e = new Error(errData.message || 'Your clinic has run out of AI report credits. Please contact your administrator.');
        e.code = 'insufficient_credits';
        throw e;
      }
      throw new Error(errData.error || `HTTP ${response.status}`);
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';
    let finalData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.token) setStreamingText(prev => prev + parsed.token);
          if (parsed.done)  finalData = parsed;
        } catch (parseErr) {
          if (parseErr.message && !parseErr.message.startsWith('Unexpected')) throw parseErr;
        }
      }
    }
    // A report was generated → credits were debited server-side. Refresh the pill.
    reloadCredits?.();
    return finalData;
  }

  // Live transcription via the WS socket is the only audio path. If it fails, the
  // user re-records — there is no upload-and-poll fallback. Mirrors Vital's flow.
  async function processRecording() {
    if (cancelledRef.current) { liveSocket.disconnect(); return; }

    if (audioChunksRef.current.length === 0) {
      console.warn('[ClinicalReport] No audio chunks captured');
      setError('No audio was recorded. Please try again.');
      setStage('idle');
      setMinimized(false);
      liveSocket.disconnect();
      return;
    }

    // Kept only so the error-recovery screen can play back what was recorded.
    const chunks = [...audioChunksRef.current];
    audioChunksRef.current = [];
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
    revokePlaybackUrl();
    const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
    playbackUrlRef.current = url;
    setPlaybackUrl(url);

    setStage('transcribing');
    setError('');

    try {
      const { transcript: liveTranscript, duration_seconds } = await liveSocket.stop();
      if (!liveTranscript?.trim()) {
        throw new Error('No speech was detected in the recording.');
      }
      if (!patientId || !selectedTemplate?.id) {
        throw new Error('Missing patient or template context.');
      }

      const { data } = await API.post('/report/transcribe', buildTranscribeBody({
        transcript_text:        liveTranscript,
        audio_duration_seconds: String(duration_seconds ?? 0),
      }));

      setJobId(data.jobId);
      setTranscript(liveTranscript);
      setEditedTranscript(liveTranscript);
      setStage('editing');
      reloadCredits?.(); // credits were just debited at transcription
    } catch (err) {
      console.warn('[ClinicalReport] Live transcription failed:', err.message);
      // 402 → out of credits. Prefer the friendly server message; refresh the pill.
      const data = err.response?.data;
      if (err.response?.status === 402) {
        setError(data?.message || 'Your clinic has run out of AI report credits. Please contact your administrator.');
        reloadCredits?.();
      } else {
        setError(data?.error || err.message || 'Live transcription failed. Please try recording again.');
      }
      setStage('idle');
      setMinimized(false);
    } finally {
      liveSocket.disconnect();
    }
  }

  async function runGeneration(jId, transcriptOverride) {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;

    const jIdToUse   = jId || jobId;
    const controller = new AbortController();
    if (generateAbortRef.current) generateAbortRef.current.abort();
    generateAbortRef.current = controller;

    try {
      const finalData = await consumeGenerateStream({
        jobId:        jIdToUse,
        template_id:  selectedTemplate?.id,
        detail_level: detailLevel,
        save_report:  String(saveReport),
        ...(transcriptOverride != null ? { transcript: transcriptOverride } : {}),
      }, controller.signal);

      const reportsMap = finalData?.reports || {};
      const resolvedTemplateId = selectedTemplate?.id || Object.keys(reportsMap)[0] || '';
      const generatedText = (reportsMap[resolvedTemplateId] || Object.values(reportsMap)[0] || streamingText || '').trim();

      if (!generatedText) {
        setError('The AI returned an empty report. Try again, or edit the transcript and regenerate.');
        setStreamingText('');
        setStage('editing');
        setMinimized(false);
        return;
      }

      setReportText(generatedText);
      setStreamingText('');
      setTranscript(finalData?.transcript || transcript);
      setDriveLinks(finalData?.drive_links || {});
      setTemplateId(resolvedTemplateId);
      setIsEditingTranscript(false);
      setStage('done');
      setMinimized(false);

      onSuccess?.();
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Generation failed');
      setStage('editing');
      setMinimized(false);
    } finally {
      isGeneratingRef.current = false;
      if (generateAbortRef.current === controller) generateAbortRef.current = null;
    }
  }

  async function processTextInput() {
    if (!textInput.trim()) return;
    setStage('transcribing');
    setError('');
    try {
      const { data: transcribeData } = await API.post('/report/transcribe', buildTranscribeBody({ transcript_text: textInput.trim() }));
      const newJobId = transcribeData.jobId;
      setJobId(newJobId);
      setTranscript(textInput.trim());
      setEditedTranscript(textInput.trim());
      setStage('editing');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Unknown error');
      setStage('idle');
    }
  }

  if (!isOpen) return null;

  // ── MINIMIZED PILL ──────────────────────────────────────────────────────────
  if (minimized) {
    const pillLabel =
      stage === 'recording'    ? 'Recording…'         :
      stage === 'paused'       ? 'Paused'             :
      stage === 'transcribing' ? 'Transcribing…'      :
      stage === 'editing'      ? 'Review transcript'  :
      stage === 'generating'   ? 'Generating report…' :
      stage === 'done'         ? 'Report ready'       : 'AI Report';

    const pillColor =
      stage === 'recording'    ? 'bg-red-500'   :
      stage === 'paused'       ? 'bg-amber-500' :
      stage === 'transcribing' ? 'bg-[#137fec]' :
      stage === 'generating'   ? 'bg-[#137fec]' :
      stage === 'done'         ? 'bg-green-600' : 'bg-slate-700';

    return (
      <div
        className={`fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-[400] flex items-center gap-3 px-4 py-3 ${pillColor} text-white rounded-full shadow-2xl cursor-pointer select-none`}
        onClick={() => setMinimized(false)}
      >
        {(stage === 'transcribing' || stage === 'generating')
          ? <Loader2 size={16} className="animate-spin" />
          : stage === 'recording'
          ? <span className="size-2 rounded-full bg-white animate-ping inline-block" />
          : stage === 'done'
          ? <CheckCircle size={16} />
          : <Mic size={16} />}
        <span className="text-sm font-semibold">{pillLabel}</span>
        <Maximize2 size={14} className="opacity-70" />
      </div>
    );
  }

  const canRecord = !!selectedTemplate;

  // Delivery outcome flags
  const deliveryAttempted = Object.keys(deliverResults).length > 0;
  const deliverySucceeded = deliveryAttempted && Object.values(deliverResults).every(r => r.status === 'ok');
  const CHANNEL_LABEL = { cloud: 'Saved to Connect Cloud', email: 'Emailed to patient', whatsapp: 'Sent on WhatsApp' };

  // ── FULL MODAL ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4 overflow-hidden">
      <div className="bg-white w-full sm:max-w-3xl shadow-2xl h-[95dvh] sm:h-[92vh] rounded-t-2xl sm:rounded-2xl flex flex-col">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="font-bold text-base sm:text-lg text-slate-800 flex items-center gap-2">
              <span className="size-8 rounded-lg bg-[#137fec]/10 flex items-center justify-center flex-shrink-0">
                <Mic size={16} className="text-[#137fec]" />
              </span>
              AI Clinical Report
            </h3>
            <p className="hidden sm:block text-xs text-slate-400 mt-0.5 ml-10">
              Select a template, then dictate the consultation — the AI generates the document
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setMinimized(true)} title="Minimize"
              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
              <Minimize2 size={18} />
            </button>
            <button onClick={handleClose} title="Close"
              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-scroll px-3 sm:px-6 py-3 sm:py-5 flex flex-col gap-3 sm:gap-5">

          {/* ── IDLE / RECORDING / PAUSED ── */}
          {(stage === 'idle' || stage === 'recording' || stage === 'paused') && (
            <div className="flex flex-col items-center gap-3 sm:gap-5">

              {/* Template selector (idle only) */}
              {stage === 'idle' && (
                <div className="w-full max-w-lg space-y-4">
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText size={14} className="text-slate-500" />
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Document Template <span className="text-red-400 normal-case font-semibold">* required</span>
                      </p>
                    </div>
                    <div className="relative">
                      <select
                        value={selectedTemplate?.id || ''}
                        onChange={handleTemplateChange}
                        className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#137fec] pr-8"
                      >
                        <option value="" disabled>— Select a template —</option>
                        {Array.from(new Set(templates.map(t => t.category))).map(cat => (
                          <optgroup key={cat} label={cat}>
                            {templates.filter(t => t.category === cat).map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    {selectedTemplate && (
                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">{selectedTemplate.description}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('smilo:open-node', { detail: { nodeId: 'ai-report-templates' } }))}
                      className="mt-3 flex items-center gap-1.5 text-xs text-[#137fec] hover:text-blue-700 font-medium transition-colors"
                    >
                      <HelpCircle size={13} />
                      How do I choose the right template?
                    </button>
                  </div>

                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 sm:p-4">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 sm:mb-3">Detail Level</p>
                    <div className="flex gap-2">
                      {DETAIL_LEVELS.map(dl => (
                        <button key={dl.key} onClick={() => setDetailLevel(dl.key)}
                          className={`flex-1 py-3 sm:py-2 rounded-lg text-sm font-medium transition-colors border ${
                            detailLevel === dl.key
                              ? 'bg-[#137fec] text-white border-[#137fec]'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-[#137fec] hover:text-[#137fec]'
                          }`}>
                          {dl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 py-1.5 cursor-pointer">
                      <input type="checkbox" checked={saveReport} onChange={e => setSaveReport(e.target.checked)}
                        className="w-4 h-4 rounded accent-[#137fec] cursor-pointer" />
                      <Save size={14} className="text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">Save to Connect Cloud</span>
                    </label>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Testing — Text Input (skips AI transcription)</p>
                    <textarea value={textInput} onChange={e => setTextInput(e.target.value)}
                      placeholder="Paste or type the consultation transcript here…"
                      rows={3}
                      className="w-full text-sm border border-amber-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white placeholder:text-amber-300"
                    />
                    <button onClick={processTextInput} disabled={!textInput.trim() || !canRecord}
                      className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-amber-500 text-white hover:bg-amber-600">
                      <SendHorizonal size={15} /> Submit Text
                    </button>
                    {!canRecord && (
                      <p className="text-xs text-amber-600 mt-2 text-center">Select a template above to enable submission.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Hidden audio element for preview playback */}
              {playbackUrl && (
                <audio
                  ref={audioPlaybackRef}
                  src={playbackUrl}
                  preload="metadata"
                  onLoadedMetadata={e => setPlaybackDuration(e.target.duration)}
                  onTimeUpdate={e => setPlaybackProgress(e.target.currentTime)}
                  onEnded={() => setIsPlayingBack(false)}
                  onPause={() => setIsPlayingBack(false)}
                  onPlay={() => setIsPlayingBack(true)}
                  style={{ display: 'none' }}
                />
              )}

              {/* Waveform + playback preview */}
              {(stage === 'recording' || stage === 'paused') && (
                <div className="w-full max-w-sm flex flex-col items-center gap-3">
                  {/* Elapsed dictation time — this is what gets billed (1 credit = 1 min) */}
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${stage === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
                    <span className="text-2xl font-bold tabular-nums text-slate-800">{fmtTime(recordSeconds)}</span>
                  </div>

                  <WaveformBar analyserRef={analyserRef} active={stage === 'recording'} />

                  {/* Live transcript preview (rolling last ~7 words) */}
                  {stage === 'recording' && (
                    <div className="w-full bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 min-h-[2.5rem] flex items-center">
                      <p className="text-xs text-blue-800 leading-relaxed">
                        {liveSocket.liveTranscript
                          ? <>…{liveSocket.liveTranscript.split(/\s+/).slice(-7).join(' ')}<span className="inline-block w-1.5 h-3.5 ml-0.5 bg-blue-500 align-middle animate-pulse" /></>
                          : <span className="italic text-blue-400">Listening… speak now</span>}
                      </p>
                    </div>
                  )}

                  {stage === 'paused' && playbackUrl && (
                    <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Headphones size={13} className="text-amber-600 flex-shrink-0" />
                        <p className="text-xs font-semibold text-amber-700">Preview recording</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={togglePlayback}
                          className="size-9 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center flex-shrink-0 transition-colors shadow"
                        >
                          {isPlayingBack ? <Pause size={15} /> : <Play size={15} />}
                        </button>
                        <div className="flex-1 flex flex-col gap-1">
                          <div
                            className="h-2 bg-amber-200 rounded-full cursor-pointer relative overflow-hidden"
                            onClick={seekPlayback}
                          >
                            <div
                              className="h-full bg-amber-500 rounded-full transition-all"
                              style={{ width: playbackDuration ? `${(playbackProgress / playbackDuration) * 100}%` : '0%' }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-amber-600 font-medium">
                            <span>{fmtTime(playbackProgress)}</span>
                            <span>{fmtTime(playbackDuration)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {stage === 'paused' && !playbackUrl && (
                    <p className="text-xs text-amber-600 font-semibold animate-pulse">Recording paused — press Resume to continue</p>
                  )}
                </div>
              )}

              {/* Mic / Pause / Resume buttons */}
              <div className="flex items-center gap-3 sm:gap-4 justify-center">
                <button
                  onClick={stage === 'recording' || stage === 'paused' ? stopRecording : startRecording}
                  disabled={stage === 'idle' && !canRecord}
                  className={`relative size-20 sm:size-24 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${
                    stage === 'recording'
                      ? 'bg-red-500 hover:bg-red-600 shadow-red-300'
                      : stage === 'paused'
                      ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-300'
                      : 'bg-[#137fec] hover:bg-blue-600 shadow-blue-300'
                  }`}
                >
                  {stage === 'recording' && (
                    <>
                      <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-40" />
                      <span className="absolute inset-[-8px] rounded-full border-2 border-red-300 animate-pulse" />
                    </>
                  )}
                  {stage === 'recording' || stage === 'paused'
                    ? <MicOff size={30} className="text-white sm:hidden" />
                    : <Mic    size={30} className="text-white sm:hidden" />}
                  {stage === 'recording' || stage === 'paused'
                    ? <MicOff size={36} className="text-white hidden sm:block" />
                    : <Mic    size={36} className="text-white hidden sm:block" />}
                </button>

                {(stage === 'recording' || stage === 'paused') && (
                  <button
                    onClick={stage === 'recording' ? pauseRecording : resumeRecording}
                    className={`size-14 rounded-full flex items-center justify-center shadow-lg transition-all ${
                      stage === 'paused'
                        ? 'bg-green-500 hover:bg-green-600 text-white'
                        : 'bg-white border-2 border-amber-400 text-amber-500 hover:bg-amber-50'
                    }`}
                    title={stage === 'recording' ? 'Pause recording' : 'Resume recording'}
                  >
                    {stage === 'recording' ? <Pause size={22} /> : <Play size={22} />}
                  </button>
                )}
              </div>

              <div className="text-center">
                {stage === 'idle' ? (
                  <>
                    <p className={`font-semibold text-base ${canRecord ? 'text-slate-700' : 'text-slate-400'}`}>
                      {canRecord ? 'Click to start recording' : 'Select a template to start'}
                    </p>
                    {canRecord && (
                      <p className="text-slate-400 text-sm mt-1">
                        Dictate the patient history, examination findings, diagnosis, and management plan in one go.
                      </p>
                    )}
                  </>
                ) : stage === 'paused' ? (
                  <p className="text-amber-600 font-semibold text-base">
                    Paused — {playbackUrl ? 'listen back above, then ' : ''}tap Resume or Stop (mic button)
                  </p>
                ) : (
                  <>
                    <p className="text-red-600 font-semibold text-base animate-pulse">Recording… speak clearly</p>
                    <p className="text-slate-400 text-sm mt-1">
                      Use Pause to take a break. Click Stop (mic) when fully done.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── TRANSCRIBING ── */}
          {stage === 'transcribing' && (
            <div className="flex flex-col items-center gap-5 py-10">
              <Loader2 size={52} className="text-[#137fec] animate-spin" />
              <div className="text-center">
                <p className="text-slate-700 font-semibold text-base">Transcribing audio…</p>
                <p className="text-slate-400 text-sm mt-1">Connect Transcribe is processing your dictation. This may take a minute.</p>
              </div>
            </div>
          )}

          {/* ── EDITING (transcript review) ── */}
          {stage === 'editing' && (
            <div className="flex flex-col gap-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={15} className="text-green-600" />
                    <p className="text-sm font-semibold text-green-700">
                      Transcript ready{cachedTranscript ? ' (cached from today\'s visit)' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsEditingTranscript(v => !v)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <Edit3 size={11} /> {isEditingTranscript ? 'Done editing' : 'Edit'}
                  </button>
                </div>
                {isEditingTranscript ? (
                  <textarea
                    value={editedTranscript}
                    onChange={e => setEditedTranscript(e.target.value)}
                    rows={6}
                    className="w-full text-sm border border-green-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-green-300 bg-white"
                    placeholder="Edit the transcript if needed, then click Generate…"
                  />
                ) : (
                  <p className="text-sm text-slate-600 leading-relaxed line-clamp-5">{editedTranscript || transcript}</p>
                )}
              </div>

              <button
                onClick={() => runGeneration(jobId, isEditingTranscript ? editedTranscript : undefined)}
                disabled={!(editedTranscript || transcript)}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-40"
              >
                <Sparkles size={16} /> Generate {selectedTemplate?.name || 'Report'}
              </button>
            </div>
          )}

          {/* ── GENERATING (streaming) ── */}
          {stage === 'generating' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3 py-4">
                <div className="flex items-center gap-3">
                  <Loader2 size={28} className="text-[#137fec] animate-spin flex-shrink-0" />
                  <div>
                    <p className="text-slate-700 font-semibold text-sm">Generating {selectedTemplate?.name || 'report'}…</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      Saving to Connect Cloud after generation.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCancelGeneration}
                  disabled={cancelling}
                  title="Cancel and go back to edit the transcript"
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  {cancelling ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={13} />}
                  Cancel
                </button>
              </div>
              {streamingText && (
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-mono bg-slate-50 rounded-lg p-4 border border-slate-100 overflow-y-auto max-h-[30vh] sm:max-h-[300px]">
                  {streamingText}
                  <span className="inline-block w-0.5 h-4 bg-[#137fec] ml-0.5 animate-pulse" />
                </div>
              )}
            </div>
          )}

          {/* ── DONE: success acknowledgement ── */}
          {stage === 'done' && deliverySucceeded && (
            <div className="flex flex-col items-center justify-center text-center py-8 gap-4">
              <div className="size-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle size={36} className="text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">Report delivered</p>
                <p className="text-sm text-slate-500 mt-1">Everything you selected was completed successfully.</p>
              </div>
              <div className="w-full max-w-sm space-y-2">
                {Object.entries(deliverResults).map(([channel, r]) => (
                  <div key={channel} className="flex items-center gap-2 text-sm bg-green-50 text-green-700 px-3 py-2.5 rounded-lg">
                    <CheckCircle size={15} className="flex-shrink-0" />
                    <span className="font-semibold">{CHANNEL_LABEL[channel] || channel}</span>
                  </div>
                ))}
              </div>
              {driveLinks[templateId] && (
                <button onClick={() => openExternal(driveLinks[templateId])}
                  className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 underline underline-offset-2">
                  <ExternalLink size={12} /> Open the saved file
                </button>
              )}
              <button onClick={() => setDeliverResults({})}
                className="mt-1 text-xs font-semibold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50">
                Send to another channel
              </button>
            </div>
          )}

          {/* ── DONE: report + delivery ── */}
          {stage === 'done' && !deliverySucceeded && (
            <>
              {driveLinks[templateId] && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-slate-700">
                    <Save size={14} /> Saved to Connect Cloud
                  </p>
                  <button
                    onClick={() => openExternal(driveLinks[templateId])}
                    className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 underline underline-offset-2"
                  >
                    <ExternalLink size={11} /> {selectedTemplate?.name || 'Report'}
                  </button>
                </div>
              )}

              {/* Report display */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={15} className="text-slate-500 flex-shrink-0" />
                    <p className="text-sm font-semibold text-slate-700 truncate">{selectedTemplate?.name || 'Generated Report'}</p>
                    {selectedTemplate?.type && (
                      <span className="text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full flex-shrink-0">{selectedTemplate.type}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {jobId && (
                      <button
                        onClick={() => { setIsEditingTranscript(false); setEditedTranscript(transcript); setStage('editing'); }}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 transition-colors"
                        title="Go back and regenerate from the transcript"
                      >
                        <RefreshCw size={11} /> Regenerate
                      </button>
                    )}
                    <button
                      onClick={() => setIsEditingReport(v => !v)}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                      <Edit3 size={11} /> {isEditingReport ? 'Done editing' : 'Edit'}
                    </button>
                  </div>
                </div>
                {isEditingReport ? (
                  <textarea
                    autoFocus
                    value={reportText}
                    onChange={e => setReportText(e.target.value)}
                    rows={8}
                    className="w-full text-sm text-slate-700 leading-relaxed font-mono bg-white rounded-lg p-4 border border-[#137fec]/40 focus:outline-none focus:ring-2 focus:ring-[#137fec] resize-y max-h-[280px]"
                    placeholder="Edit the report…"
                  />
                ) : (
                  <div onClick={() => setIsEditingReport(true)} className="cursor-text group relative" title="Click to edit">
                    <ReportDisplay text={reportText} />
                    <span className="absolute top-2 right-2 text-[10px] font-semibold text-slate-400 bg-white/80 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 pointer-events-none">
                      <Edit3 size={10} /> Click to edit
                    </span>
                  </div>
                )}
              </div>

              {/* Delivery Settings toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDeliveryPanel(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg transition-colors ${
                    showDeliveryPanel
                      ? 'bg-slate-100 border-slate-300 text-slate-700'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <Settings2 size={13} /> Report Delivery Settings
                </button>
              </div>

              {/* Delivery Settings panel */}
              {showDeliveryPanel && deliverySettings && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50">
                  <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Settings2 size={14} /> Report Delivery Settings</p>

                  <div>
                    <label className="flex items-center gap-3 cursor-pointer mb-2">
                      <div onClick={() => setDeliverySettings(s => ({ ...s, pdf: { ...s.pdf, enabled: !s.pdf?.enabled } }))}
                        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${deliverySettings.pdf?.enabled ? 'bg-[#137fec]' : 'bg-slate-300'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${deliverySettings.pdf?.enabled ? 'left-4' : 'left-0.5'}`} />
                      </div>
                      <p className="text-sm font-medium text-slate-700">Branded PDF</p>
                    </label>
                    {deliverySettings.pdf?.enabled && (
                      <div className="space-y-2 ml-1">
                        {[
                          ['clinicName','Clinic Name','City Dental Clinic'],
                          ['clinicTagline','Tagline','Your smile, our care'],
                          ['clinicAddress','Address','123 Main St, Mumbai'],
                          ['clinicPhone','Phone','+91 98765 43210'],
                          ['clinicEmail','Email','clinic@example.com'],
                        ].map(([field, lbl, ph]) => (
                          <div key={field}>
                            <label className="text-xs text-slate-500 block mb-0.5">{lbl}</label>
                            <input type="text" placeholder={ph}
                              value={deliverySettings.pdf?.[field] || ''}
                              onChange={e => setDeliverySettings(s => ({ ...s, pdf: { ...s.pdf, [field]: e.target.value } }))}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#137fec] outline-none" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {deliveryBanner && (
                    <div className={`text-sm px-3 py-2 rounded-lg ${deliveryBanner.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {deliveryBanner.msg}
                    </div>
                  )}
                  <button onClick={handleSaveDeliverySettings} disabled={deliverySaving}
                    className="px-5 py-2 bg-[#137fec] hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60">
                    {deliverySaving ? 'Saving…' : 'Save Settings'}
                  </button>
                </div>
              )}

              {/* Approve → save to Connect Cloud */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-50 border-b border-slate-200">
                  <p className="text-sm font-semibold text-slate-700">Approve</p>
                  <p className="text-xs text-slate-400 mt-0.5">Approving saves this report to Connect Cloud. You can share it from the patient's documents afterwards.</p>
                </div>

                <div className="p-3 sm:p-4 space-y-2.5 sm:space-y-3">
                  <div className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                    <Save size={16} className="text-slate-400 mt-0.5 flex-shrink-0 hidden sm:block" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700">Save to Connect Cloud</p>
                      {driveLinks[templateId]
                        ? <button onClick={(e) => { e.preventDefault(); openExternal(driveLinks[templateId]); }}
                            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 underline underline-offset-2 mt-0.5">
                            <ExternalLink size={11} /> Saved — view file
                          </button>
                        : <p className="text-xs text-slate-400 mt-0.5">Stores the report in the patient's Drive folder.</p>}
                    </div>
                  </div>

                  {/* Result */}
                  {deliverResults.cloud && (
                    <div className={`text-sm flex items-center gap-2 px-3 py-2 rounded-lg ${
                      deliverResults.cloud.status === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {deliverResults.cloud.status === 'ok' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      <span className="font-semibold">Cloud:</span> {deliverResults.cloud.message}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {error && <ErrorBadge error={error} />}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between px-3 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-slate-50 gap-2 sm:gap-0">
          <p className="hidden sm:block text-xs text-slate-400 truncate">
            {stage === 'done'
              ? deliverySucceeded
                ? 'Report saved to Connect Cloud'
                : 'Click Approve to save to Connect Cloud'
              : stage === 'editing'
              ? 'Review or edit the transcript, then click Generate'
              : 'You can minimize this window while recording or processing'}
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {stage === 'done' && !deliverySucceeded && (
              <>
                <button onClick={resetState}
                  className="px-4 py-3 sm:py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex-1 sm:flex-none">
                  Record Again
                </button>
                <button
                  onClick={handleApprove}
                  disabled={delivering}
                  className="flex items-center justify-center gap-2 px-5 py-3 sm:py-2 text-sm font-semibold text-white bg-[#137fec] rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-1 sm:flex-none"
                >
                  {delivering ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  {delivering ? 'Saving…' : 'Approve'}
                </button>
              </>
            )}
            {stage === 'done' && deliverySucceeded && (
              <>
                <button onClick={resetState}
                  className="px-4 py-3 sm:py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex-1 sm:flex-none">
                  Record Again
                </button>
                <button onClick={handleClose}
                  className="flex items-center justify-center gap-2 px-5 py-3 sm:py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors flex-1 sm:flex-none">
                  <CheckCircle size={14} /> Done
                </button>
              </>
            )}
            {stage !== 'done' && (
              <button onClick={handleClose}
                className="w-full sm:w-auto px-5 py-3 sm:py-2 text-sm font-medium text-white bg-[#137fec] rounded-xl sm:rounded-lg hover:bg-blue-600 transition-colors">
                Close
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
