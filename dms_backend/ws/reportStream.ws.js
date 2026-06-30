/**
 * Live dictation transcription relay — WebSocket.
 *
 * Browser  --(binary webm/opus chunks over our WS)-->  this relay
 *                                                          |  ffmpeg: webm/opus -> pcm_s16le 16k mono
 *                                                          v
 *                                                   sarvamai SDK socket  <-->  Sarvam STTT (wss)
 *                                                          |
 * Browser  <--(JSON: live segments, then final transcript)-- relay
 *
 * Purely a transcription accelerator: it never creates a ReportJob and never bills.
 * The frontend calls POST /api/report/transcribe with the final transcript +
 * audio_duration_seconds once this socket reports `{type:'final', ...}` — that's
 * where the job is created (see report.controller.js). This is the ONLY audio
 * transcription path — there is no batch fallback.
 */
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import jwt from 'jsonwebtoken';
import { SarvamAIClient } from 'sarvamai';
import ffmpegPath from 'ffmpeg-static';

import { resolveTenantContext } from '../config/resolveTenantContext.js';

const WS_PATHS = ['/api/report/stream', '/backendapi/report/stream'];
const FLUSH_GRACE_MS = 1500;        // wait for trailing segments after flush() before closing
const MAX_SESSION_MS = 20 * 60_000; // hard cap on a single dictation session

// Origin allow-list. Empty = allow any (dev). In prod set WS_ALLOWED_ORIGINS
// (comma-separated) to the frontend origin(s).
const ALLOWED_ORIGINS = (process.env.WS_ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

export function attachReportStreamSocket(server) {
  // perMessageDeflate disabled deliberately: the audio payload is already
  // opus-compressed, and WS compression extensions are a known source of
  // corrupted binary frames when proxied through tunnels/CDNs (e.g. Cloudflare).
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://internal');
    } catch {
      socket.destroy();
      return;
    }

    if (!WS_PATHS.includes(url.pathname)) {
      // Not our endpoint — don't silently eat the upgrade.
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    // Browsers always send Origin on WS handshakes; non-browser clients (curl,
    // test scripts) typically don't — only reject when an Origin is present and
    // not allowed (and only when an allow-list is configured).
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
      console.warn('[reportStream] Rejected upgrade — disallowed origin:', origin);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, url).catch((err) => {
        console.error('[reportStream] Unhandled connection error:', err);
        try { ws.close(4500, 'internal_error'); } catch { /* noop */ }
      });
    });
  });

  console.log('[reportStream] Live dictation WS relay attached');
}

async function handleConnection(ws, url) {
  // ── 1. Auth — JWT comes as ?token= since the WebSocket constructor can't set headers ──
  const token = url.searchParams.get('token');
  if (!token) { ws.close(4401, 'missing_token'); return; }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { clockTolerance: 30 });
  } catch {
    ws.close(4401, 'invalid_token');
    return;
  }

  // ── 2. Tenant resolution (same logic the Express middleware uses) ──
  let tenantConfig;
  try {
    ({ tenantConfig } = await resolveTenantContext(decoded.tenantId));
  } catch (err) {
    console.warn('[reportStream] Tenant resolution failed:', err.message);
    const code = err.statusCode === 403 ? 4403 : err.statusCode === 404 ? 4404 : 4500;
    ws.close(code, 'tenant_error');
    return;
  }

  if (!tenantConfig.sarvamApiKey) {
    ws.close(4422, 'no_sarvam_key');
    return;
  }

  console.log('[reportStream] Connection accepted for tenant:', decoded.tenantId);

  // ── 3. Spin up the ffmpeg transcoder + Sarvam STTT socket for this session ──
  const ffmpeg = spawn(ffmpegPath, [
    '-loglevel', 'error',
    '-i', 'pipe:0',
    '-f', 's16le',
    '-ar', '16000',
    '-ac', '1',
    'pipe:1',
  ]);
  ffmpeg.on('error', (err) => console.error('[reportStream] ffmpeg spawn error:', err.message));
  ffmpeg.stderr.on('data', (chunk) => console.warn('[reportStream] ffmpeg:', chunk.toString().trim()));

  const sarvamClient = new SarvamAIClient({ apiSubscriptionKey: tenantConfig.sarvamApiKey });
  const sarvamSocket = await sarvamClient.speechToTextTranslateStreaming.connect({
    model: 'saaras:v2.5',
    input_audio_codec: 'pcm_s16le',
    sample_rate: 16000,
    high_vad_sensitivity: 'true',
    vad_signals: 'true',
  });

  let fullTranscript = '';
  let finalizing = false;
  let closed = false;
  const startedAt = Date.now();
  let audioChunkCount = 0;
  let audioByteTotal = 0;

  const safeSend = (payload) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
  };

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearTimeout(maxDurationTimer);
    try { if (!ffmpeg.killed) ffmpeg.kill(); } catch { /* noop */ }
    try { sarvamSocket.close(); } catch { /* noop */ }
  };

  const finalize = async (reason = 'stop') => {
    if (finalizing) return;
    finalizing = true;
    console.log('[reportStream] Finalizing session:', reason, '— received', audioChunkCount, 'chunks /', audioByteTotal, 'bytes total; transcriptLen=', fullTranscript.trim().length);

    try { ffmpeg.stdin.end(); } catch { /* noop */ }
    try { sarvamSocket.flush(); } catch (err) { console.warn('[reportStream] flush() failed:', err.message); }

    await new Promise((r) => setTimeout(r, FLUSH_GRACE_MS));

    safeSend({
      type: 'final',
      transcript: fullTranscript.trim(),
      duration_seconds: Math.round((Date.now() - startedAt) / 1000),
    });
    cleanup();
    try { ws.close(1000); } catch { /* noop */ }
  };

  const maxDurationTimer = setTimeout(() => finalize('max_duration_exceeded'), MAX_SESSION_MS);

  // ── 4. Wait for Sarvam to open before accepting audio. The SDK's own
  //      ReconnectingWebSocket (maxRetries: 30) handles transient drops. ──
  try {
    await sarvamSocket.waitForOpen();
  } catch (err) {
    console.error('[reportStream] Sarvam socket failed to open:', err.message || err);
    safeSend({ type: 'error', message: 'Could not connect to transcription service' });
    cleanup();
    ws.close(4502, 'sarvam_connect_failed');
    return;
  }

  safeSend({ type: 'ready' });

  // ── 5. Wire the pipes ──
  ffmpeg.stdout.on('data', (pcmChunk) => {
    try {
      // `encoding` here is unrelated to `input_audio_codec` set at connect() time.
      // Its only accepted value is the literal 'audio/wav' (Sarvam rejects anything
      // else outright, which silently closes the session on every chunk). Matches
      // the SDK default; kept explicit for clarity.
      sarvamSocket.translate({
        audio: pcmChunk.toString('base64'),
        sample_rate: 16000,
        encoding: 'audio/wav',
      });
    } catch (err) {
      console.warn('[reportStream] translate() send failed (socket reconnecting?):', err.message);
    }
  });

  sarvamSocket.on('message', (msg) => {
    if (msg?.type === 'data' && msg.data?.transcript) {
      fullTranscript += (fullTranscript ? ' ' : '') + msg.data.transcript;
    }
    if (msg?.type === 'error') {
      // Sarvam's ErrorData shape is { error, code } — NOT { message }.
      console.error('[reportStream] Sarvam reported an error:', msg.data);
      safeSend({ type: 'error', message: msg.data?.error || 'Sarvam transcription error', code: msg.data?.code });
      return;
    }
    // Forward all messages verbatim — frontend reads msg.data.transcript on 'data'.
    safeSend({ type: msg?.type, data: msg?.data });
  });

  sarvamSocket.on('error', (err) => {
    console.error('[reportStream] Sarvam socket error:', err.message || err);
    if (!finalizing) safeSend({ type: 'error', message: 'Live transcription connection lost' });
  });

  sarvamSocket.on('close', () => {
    if (!finalizing) {
      console.warn('[reportStream] Sarvam socket closed unexpectedly');
      safeSend({ type: 'error', message: 'Live transcription connection lost' });
      cleanup();
      try { ws.close(4502, 'sarvam_closed'); } catch { /* noop */ }
    }
  });

  // ── 6. Browser → ffmpeg stdin ──
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      audioChunkCount += 1;
      audioByteTotal += data.length;
      if (!finalizing && !ffmpeg.stdin.destroyed) ffmpeg.stdin.write(data);
      return;
    }
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'stop') finalize('client_stop');
    } catch {
      // ignore malformed control messages
    }
  });

  ws.on('close', () => {
    if (!finalizing) finalize('socket_closed');
    else cleanup();
  });

  ws.on('error', (err) => {
    console.warn('[reportStream] Browser socket error:', err.message);
  });
}
