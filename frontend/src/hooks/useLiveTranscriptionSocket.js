import { useRef, useState, useCallback } from 'react';
import API from '../services/api';

// Sarvam STTT messages are finalized segments (never an interim/replaceable guess) —
// safe to just append each one to a running transcript string in order. The backend
// relay does the same accumulation server-side and is the source of truth for the
// transcript that actually gets saved; this hook's `liveTranscript` is purely for the
// on-screen "it's working" feedback during dictation.
const READY_TIMEOUT_MS = 6000;
const STOP_TIMEOUT_MS = 10000;
const MAX_RECONNECT_ATTEMPTS = 2;
const RECONNECT_DELAYS_MS = [500, 1500];

function buildStreamUrl() {
  const httpBase = API.defaults.baseURL || 'http://localhost:5000/api';
  const wsBase = httpBase.replace(/^http/, 'ws'); // http(s) -> ws(s)
  const token = localStorage.getItem('dms_token') || '';
  return `${wsBase}/report/stream?token=${encodeURIComponent(token)}`;
}

/**
 * Owns the WS lifecycle for live (streaming) dictation transcription — the only
 * audio transcription path. Every method resolves with real data or rejects;
 * callers decide what to show on rejection (there is no batch fallback).
 */
export function useLiveTranscriptionSocket() {
  const wsRef = useRef(null);
  const statusRef = useRef('idle'); // idle | connecting | ready | stopping | closed | error
  const intentionalStopRef = useRef(false);
  const reconnectCountRef = useRef(0);
  const pendingReadyRef = useRef(null);  // { resolve, reject }
  const pendingStopRef = useRef(null);   // { resolve, reject }
  // MediaRecorder's very first chunk carries the WebM/EBML container header — every
  // chunk after that is headerless continuation data that's meaningless without it.
  // The Sarvam handshake takes a moment, so that first chunk (and any others) almost
  // always arrive before we're 'ready'; buffer them and flush in order once we are.
  // The header chunk is tracked separately (and resent on every 'ready', including
  // after a reconnect) since a reconnect spins up a brand new server-side ffmpeg
  // process that needs that same header again.
  const firstChunkRef = useRef(null);
  const pendingChunksRef = useRef([]);

  const [status, setStatus] = useState('idle');
  const [liveTranscript, setLiveTranscript] = useState('');

  const setBothStatus = (s) => { statusRef.current = s; setStatus(s); };

  const cleanupSocket = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try { if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(); } catch { /* noop */ }
    }
    wsRef.current = null;
  }, []);

  const handleMessage = useCallback((event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    console.log('[LiveTranscription] Message:', msg.type, msg.type === 'error' ? msg.message : '');

    if (msg.type === 'ready') {
      setBothStatus('ready');
      reconnectCountRef.current = 0;

      // Resend the header chunk first (every time — a reconnect means a brand new
      // server-side ffmpeg process that needs it again), then flush whatever else
      // arrived while we were still connecting, in order.
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (firstChunkRef.current) ws.send(firstChunkRef.current);
        for (const chunk of pendingChunksRef.current) ws.send(chunk);
      }
      pendingChunksRef.current = [];

      pendingReadyRef.current?.resolve();
      pendingReadyRef.current = null;
      return;
    }

    if (msg.type === 'data' && msg.data?.transcript) {
      setLiveTranscript((prev) => (prev ? `${prev} ${msg.data.transcript}` : msg.data.transcript));
      return;
    }

    if (msg.type === 'final') {
      setBothStatus('closed');
      pendingStopRef.current?.resolve({
        transcript: msg.transcript || '',
        duration_seconds: msg.duration_seconds,
      });
      pendingStopRef.current = null;
      cleanupSocket();
      return;
    }

    if (msg.type === 'error') {
      console.error('[LiveTranscription] Relay error:', msg.message, 'code:', msg.code);
      setBothStatus('error');
      pendingReadyRef.current?.reject(new Error(msg.message || 'Live transcription error'));
      pendingReadyRef.current = null;
      pendingStopRef.current?.reject(new Error(msg.message || 'Live transcription error'));
      pendingStopRef.current = null;
    }
    // 'events' (VAD signals) — informational only, no UI hookup.
  }, [cleanupSocket]);

  const openSocket = useCallback(() => {
    return new Promise((resolve, reject) => {
      const wsUrl = buildStreamUrl();
      console.log('[LiveTranscription] Opening WS:', wsUrl);
      let ws;
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        reject(err);
        return;
      }
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;
      pendingReadyRef.current = { resolve, reject };

      const readyTimer = setTimeout(() => {
        if (pendingReadyRef.current) {
          console.warn('[LiveTranscription] Ready timeout after', READY_TIMEOUT_MS, 'ms');
          pendingReadyRef.current.reject(new Error('Timed out waiting for live transcription to connect'));
          pendingReadyRef.current = null;
          cleanupSocket();
        }
      }, READY_TIMEOUT_MS);

      ws.onopen = () => console.log('[LiveTranscription] WS handshake open, awaiting server ready');
      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        console.warn('[LiveTranscription] WS closed code:', event.code, 'reason:', event.reason);
        clearTimeout(readyTimer);
        if (intentionalStopRef.current) return; // expected — finalize() already handled it

        if (pendingReadyRef.current) {
          pendingReadyRef.current.reject(new Error(`Live socket closed before ready (code ${event.code})`));
          pendingReadyRef.current = null;
        }

        // Mid-recording drop — a couple of quick reconnect attempts, then give up.
        if (statusRef.current === 'ready' && reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_DELAYS_MS[reconnectCountRef.current] ?? 1500;
          reconnectCountRef.current += 1;
          console.warn(`[LiveTranscription] Socket dropped (code ${event.code}) — reconnect ${reconnectCountRef.current} in ${delay}ms`);
          setBothStatus('connecting');
          setTimeout(() => { openSocket().catch(() => setBothStatus('error')); }, delay);
        } else {
          setBothStatus('error');
          pendingStopRef.current?.reject(new Error('Live transcription connection lost'));
          pendingStopRef.current = null;
        }
      };

      ws.onerror = () => {
        // onclose fires right after with a code — let that branch own recovery.
      };

      setBothStatus('connecting');
    });
  }, [cleanupSocket, handleMessage]);

  /** Open the live socket and wait for the relay to signal it's ready for audio. */
  const connect = useCallback(async () => {
    intentionalStopRef.current = false;
    reconnectCountRef.current = 0;
    firstChunkRef.current = null;
    pendingChunksRef.current = [];
    setLiveTranscript('');
    await openSocket();
  }, [openSocket]);

  /** Send one MediaRecorder chunk (Blob) over the live socket. Buffers if not ready yet. */
  const sendChunk = useCallback((blob) => {
    const isFirstChunkOfSession = firstChunkRef.current === null;
    if (isFirstChunkOfSession) firstChunkRef.current = blob;

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && statusRef.current === 'ready') {
      ws.send(blob);
      return;
    }
    // Not ready yet — buffer it; the 'ready' handler flushes this (after the header
    // chunk) once connected. Skip the first chunk — it's tracked in firstChunkRef and
    // resent specially on every 'ready' so it survives reconnects too.
    if (statusRef.current === 'connecting' && !isFirstChunkOfSession) {
      pendingChunksRef.current.push(blob);
    }
  }, []);

  /** Signal end-of-dictation and await the relay's finalized transcript. */
  const stop = useCallback(({ timeoutMs = STOP_TIMEOUT_MS } = {}) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || statusRef.current !== 'ready') {
      return Promise.reject(new Error('Live transcription socket is not connected'));
    }

    intentionalStopRef.current = true;
    setBothStatus('stopping');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pendingStopRef.current) {
          pendingStopRef.current = null;
          reject(new Error('Timed out waiting for final transcript'));
          cleanupSocket();
        }
      }, timeoutMs);

      const wrappedResolve = (value) => { clearTimeout(timer); resolve(value); };
      const wrappedReject = (err) => { clearTimeout(timer); reject(err); };
      pendingStopRef.current = { resolve: wrappedResolve, reject: wrappedReject };

      try { ws.send(JSON.stringify({ type: 'stop' })); } catch (err) { wrappedReject(err); }
    });
  }, [cleanupSocket]);

  /** Hard cleanup — used when cancelling/unmounting. */
  const disconnect = useCallback(() => {
    intentionalStopRef.current = true;
    pendingReadyRef.current = null;
    pendingStopRef.current = null;
    firstChunkRef.current = null;
    pendingChunksRef.current = [];
    cleanupSocket();
    setBothStatus('idle');
    setLiveTranscript('');
  }, [cleanupSocket]);

  return { status, liveTranscript, connect, sendChunk, stop, disconnect };
}
