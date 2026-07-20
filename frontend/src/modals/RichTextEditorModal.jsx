import { useRef, useEffect, useState } from 'react';
import { X, Bold, Italic, Underline, List, ListOrdered, Loader2, Mic, MicOff, Trash2, AlertTriangle, Sparkles } from 'lucide-react';
import { useLiveTranscriptionSocket } from '../hooks/useLiveTranscriptionSocket.js';
import API from '../services/api';

const TOOLBAR_BUTTONS = [
  { cmd: 'bold',                icon: Bold,         label: 'Bold'          },
  { cmd: 'italic',              icon: Italic,        label: 'Italic'        },
  { cmd: 'underline',           icon: Underline,     label: 'Underline'     },
  { divider: true },
  { cmd: 'insertUnorderedList', icon: List,          label: 'Bullet list'   },
  { cmd: 'insertOrderedList',   icon: ListOrdered,   label: 'Numbered list' },
];

function escapeHtml(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const TEXT_SIZES = [
  { label: 'Small',  cmd: 'fontSize', arg: '2' },
  { label: 'Normal', cmd: 'fontSize', arg: '3' },
  { label: 'Large',  cmd: 'fontSize', arg: '5' },
  { label: 'Huge',   cmd: 'fontSize', arg: '7' },
];

/**
 * RichTextEditorModal
 *
 * Props:
 *  isOpen          — boolean
 *  onClose         — fn
 *  type            — 'note' | 'advice'   (drives title + placeholder)
 *  initialContent  — string (HTML)        edit mode: pre-populates editor
 *  onSave(content) — async fn             caller handles the API call
 */
export default function RichTextEditorModal({ isOpen, onClose, type, initialContent, onSave, onDelete }) {
  const editorRef       = useRef(null);
  const savedRangeRef   = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef        = useRef(null);
  const baseHtmlRef      = useRef('');   // editor HTML snapshot taken when recording starts
  const dictationSecondsRef = useRef(0); // accumulated dictation seconds, billed on AI Format

  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [isEmpty, setIsEmpty]     = useState(true);
  const [activeFormats, setActiveFormats] = useState({});

  // Live voice dictation over the WS relay (same transport as the AI report flow).
  const [recording, setRecording]       = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [summarizing, setSummarizing]   = useState(false);
  const [dictateError, setDictateError] = useState('');
  const liveSocket = useLiveTranscriptionSocket();

  // Populate / clear editor when modal opens
  useEffect(() => {
    if (!isOpen || !editorRef.current) return;
    editorRef.current.innerHTML = initialContent || '';
    dictationSecondsRef.current = 0;
    baseHtmlRef.current = '';
    const text = editorRef.current.innerText?.trim() || '';
    setIsEmpty(text.length === 0);
    const range = document.createRange();
    const sel   = window.getSelection();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    editorRef.current.focus();
  }, [isOpen, initialContent]);

  // Stream the live transcript into the editor as segments arrive. While
  // recording we render baseHtml (whatever was there when Stop→Record started)
  // followed by the growing transcript, and keep the caret at the end.
  useEffect(() => {
    if (!recording || !editorRef.current) return;
    const live = liveSocket.liveTranscript || '';
    const base = baseHtmlRef.current || '';
    const liveHtml = live
      ? `${base ? '<br>' : ''}<span data-live-transcript="1">${escapeHtml(live)}</span>`
      : '';
    editorRef.current.innerHTML = base + liveHtml;
    // Caret to end so the user sees text accumulate.
    const range = document.createRange();
    const sel   = window.getSelection();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    handleInput();
  }, [liveSocket.liveTranscript, recording]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Selection helpers ---
  function saveSelection() {
    const sel = window.getSelection();
    if (sel?.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const sel = window.getSelection();
    if (savedRangeRef.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  }

  function execCmd(cmd, arg = null) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg);
    updateActiveFormats();
  }

  function updateActiveFormats() {
    setActiveFormats({
      bold:      document.queryCommandState('bold'),
      italic:    document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    });
  }

  function handleInput() {
    const text = editorRef.current?.innerText?.trim() || '';
    setIsEmpty(text.length === 0);
    updateActiveFormats();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  }

  function handleSizeChange(e) {
    const size = TEXT_SIZES.find(s => s.label === e.target.value);
    if (!size) return;
    restoreSelection();
    execCmd(size.cmd, size.arg);
    e.target.value = '';
  }

  // --- Voice dictation (live WS transcription) ---
  function pickMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg', ''];
    return candidates.find(t => !t || MediaRecorder.isTypeSupported(t)) || '';
  }

  function stopTracks() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }

  async function startDictation() {
    setDictateError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error('mediaDevices unavailable'), { name: 'NotSupportedError' });
      }
      saveSelection(); // capture cursor before mic UI changes focus
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      liveSocket.disconnect(); // clear any stale connection from a previous take

      const mimeType = pickMimeType();
      let recorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      recorder.ondataavailable = e => {
        if (e.data.size > 0) liveSocket.sendChunk(e.data); // buffered until socket is 'ready'
      };
      mediaRecorderRef.current = recorder;
      // Snapshot existing editor content so the streaming transcript appends to
      // it instead of overwriting it. Drop a lone empty <br>/whitespace.
      const currentHtml = editorRef.current?.innerHTML || '';
      baseHtmlRef.current = editorRef.current?.innerText?.trim() ? currentHtml : '';
      recorder.start(100);
      setRecording(true);

      // Open the live socket; first chunk (EBML header) is resent on 'ready' by the hook.
      liveSocket.connect().catch(err => {
        setDictateError(err?.message || 'Could not connect to live transcription. Please try again.');
      });
    } catch (err) {
      stopTracks();
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
        setDictateError('Microphone access is blocked. Allow microphone for this site, reload, and try again.');
      } else if (name === 'NotFoundError') {
        setDictateError('No microphone found.');
      } else if (name === 'NotSupportedError') {
        setDictateError('Voice dictation is not supported in this browser.');
      } else {
        setDictateError('Could not start the microphone. Please try again.');
      }
    }
  }

  // Replace the whole editor with beautified HTML and place the cursor at the end.
  function replaceEditorHtml(html) {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = html || '';
    editorRef.current.focus();
    const range = document.createRange();
    const sel   = window.getSelection();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    saveSelection();
    handleInput();
  }

  // Rewrite the current editor text into clean clinical bullet points via the LLM
  // (note = clinician-facing, advice = patient-facing). Billed per accumulated
  // second of dictation, matching the AI report flow. On error the prior content
  // is restored so the dictation is never lost.
  async function summarizeEditor() {
    const text = editorRef.current?.innerText?.trim() || '';
    if (!text) return;
    setSummarizing(true);
    const priorHtml = editorRef.current?.innerHTML || '';
    try {
      const { data } = await API.post('/report/beautify', {
        type,
        transcript_text: text,
        audio_duration_seconds: dictationSecondsRef.current,
      });
      if (data?.html?.trim()) {
        replaceEditorHtml(data.html);
        dictationSecondsRef.current = 0; // charged once for this content
      } else {
        setDictateError('Summarize returned nothing — your text is unchanged.');
      }
    } catch (err) {
      if (err?.response?.status === 402) {
        setDictateError(err.response.data?.message || 'Out of AI credits. Contact your administrator.');
      } else {
        setDictateError('Could not summarize the dictation — your raw transcript is kept below.');
      }
      if (editorRef.current) editorRef.current.innerHTML = priorHtml;
    } finally {
      setSummarizing(false);
    }
  }

  // Stop = finalize the streamed transcript into the box, then automatically
  // summarize it (one button: Dictate → Stop → Summarizing… → Dictate).
  async function stopDictation() {
    setRecording(false);
    setTranscribing(true);
    try {
      try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
      stopTracks();
      const result = await liveSocket.stop();
      const transcript = (result?.transcript || '').trim();
      dictationSecondsRef.current += Math.max(0, Math.round(Number(result?.duration_seconds) || 0));
      // Settle the streamed text into the box as ordinary content first.
      const base = baseHtmlRef.current || '';
      const finalHtml = transcript
        ? base + `${base ? '<br>' : ''}${escapeHtml(transcript)}`
        : base;
      replaceEditorHtml(finalHtml);
    } catch (err) {
      setDictateError(err?.message || 'Transcription failed — please try again.');
      liveSocket.disconnect();
      setTranscribing(false);
      return;
    }
    liveSocket.disconnect();
    setTranscribing(false);

    // Auto-summarize if there's anything to work with.
    if (editorRef.current?.innerText?.trim()) {
      await summarizeEditor();
    }
  }

  function handleMicClick() {
    if (transcribing || summarizing) return; // busy finalizing/summarizing — ignore taps
    if (recording) return stopDictation();
    return startDictation();
  }

  // Clean up the mic/socket if the modal closes mid-recording.
  useEffect(() => {
    if (isOpen) return;
    try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
    stopTracks();
    liveSocket.disconnect();
    setRecording(false);
    setTranscribing(false);
    setSummarizing(false);
    setDictateError('');
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete() {
    if (!onDelete) return;
    if (!confirm(`Delete this ${type === 'note' ? 'consultation note' : 'advice'}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      console.error('Failed to delete:', err);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave() {
    const content = editorRef.current?.innerHTML?.trim();
    if (!content || editorRef.current?.innerText?.trim() === '') return;
    setSaving(true);
    try {
      await onSave(content);
      onClose();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  const isEdit = !!initialContent;
  const title  = isEdit
    ? (type === 'note' ? 'Edit Consultation Note' : 'Edit Advice')
    : (type === 'note' ? 'New Consultation Note'  : 'New Advice');

  // Mic button appearance
  const micBtnClass = dictateError
    ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
    : recording
    ? 'bg-red-500 text-white animate-pulse'
    : (transcribing || summarizing)
    ? 'bg-slate-200 text-slate-500'
    : 'bg-slate-100 text-slate-600 hover:bg-slate-200';

  const micBtnContent = summarizing
    ? <><Sparkles size={14} className="animate-pulse" /> Summarizing…</>
    : transcribing
    ? <><Loader2 size={14} className="animate-spin" /> Finalizing…</>
    : recording
    ? <><MicOff size={14} /> Stop</>
    : dictateError
    ? <><AlertTriangle size={14} /> Mic error</>
    : <><Mic size={14} /> Dictate</>;

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-lg text-slate-800">{title}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-0.5 px-4 py-2 border-b border-slate-100 bg-slate-50 flex-wrap">

            <select
              defaultValue=""
              onChange={handleSizeChange}
              onMouseDown={saveSelection}
              className="h-8 px-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-md mr-1
                         hover:border-slate-300 focus:outline-none focus:border-[#137fec] cursor-pointer"
            >
              <option value="" disabled>Text size</option>
              {TEXT_SIZES.map(s => (
                <option key={s.label} value={s.label}>{s.label}</option>
              ))}
            </select>

            <div className="w-px h-5 bg-slate-200 mx-1" />

            {TOOLBAR_BUTTONS.map((item, i) => {
              if (item.divider) return <div key={i} className="w-px h-5 bg-slate-200 mx-1" />;
              const Icon     = item.icon;
              const isActive = activeFormats[item.cmd];
              return (
                <button
                  key={item.cmd}
                  onMouseDown={(e) => { e.preventDefault(); execCmd(item.cmd); }}
                  title={item.label}
                  className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
                    isActive ? 'bg-[#137fec] text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Icon size={15} />
                </button>
              );
            })}

            <div className="w-px h-5 bg-slate-200 mx-1" />

            {/* Dictate button */}
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={handleMicClick}
              disabled={transcribing || summarizing}
              title={recording ? 'Stop recording' : 'Dictate (speech to text)'}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 ${micBtnClass}`}
            >
              {micBtnContent}
            </button>
          </div>

          {/* Dictate status strip — shown while recording, summarizing, or on error */}
          {(recording || summarizing || dictateError) && (
            <div className={`px-4 py-2 text-xs flex items-center gap-2 ${
              recording ? 'bg-red-50 text-red-700'
              : summarizing ? 'bg-blue-50 text-blue-700'
              : 'bg-orange-50 text-orange-700'
            }`}>
              {recording && <span className="size-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />}
              {summarizing && <Loader2 size={13} className="animate-spin flex-shrink-0" />}
              {recording ? 'Recording… speak now, tap Stop when done.'
                : summarizing ? 'AI is formatting your text into clear points…'
                : dictateError}
              {dictateError && (
                <button
                  onClick={() => setDictateError('')}
                  className="ml-auto underline font-semibold flex-shrink-0"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}

          {/* Editor */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-[220px]">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onKeyUp={() => { saveSelection(); updateActiveFormats(); }}
              onMouseUp={() => { saveSelection(); updateActiveFormats(); }}
              className="outline-none text-slate-700 text-sm leading-relaxed min-h-[200px]
                [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1
                [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1
                [&_li]:my-0.5
                [&_b]:font-semibold [&_strong]:font-semibold"
              data-placeholder={type === 'note'
                ? 'Write consultation notes here — findings, diagnosis, observations...'
                : 'Write patient advice here — post-op care, dietary restrictions, follow-up instructions...'}
            />
            {isEmpty && (
              <style>{`[contenteditable]:empty:before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; display: block; }`}</style>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50">
            <div className="flex items-center gap-3">
              {isEdit && onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              )}
              <p className="text-xs text-slate-400">Ctrl + Enter to save</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || isEmpty}
                className="px-6 py-2 text-sm font-semibold text-white bg-[#137fec] rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
