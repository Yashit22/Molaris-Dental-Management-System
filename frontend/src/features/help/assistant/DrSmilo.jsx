import { useRef, useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDrSmilo } from './useDrSmilo.js';
import SmiloAvatar from './components/SmiloAvatar.jsx';
import ChatBubble from './components/ChatBubble.jsx';
import QuickReplies from './components/QuickReplies.jsx';
import WalkthroughCard from './components/WalkthroughCard.jsx';
import TypingIndicator from './components/TypingIndicator.jsx';
import ConfettiBurst from './components/ConfettiBurst.jsx';

// Default anchor: bottom-right (matches original fixed bottom-6 right-6)
const DEFAULT_POS = { right: 24, bottom: 24 };

export default function DrSmilo() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const smilo     = useDrSmilo(navigate);
  const scrollRef = useRef(null);
  const inputRef  = useRef(null);
  const [inputValue, setInputValue] = useState('');
  const [hasOpened, setHasOpened]   = useState(false);

  // Drag state: position stored as { right, bottom } from viewport edges
  const [pos, setPos]         = useState(DEFAULT_POS);
  const [dragging, setDragging] = useState(false);
  const dragOrigin             = useRef(null); // { startX, startY, startRight, startBottom }

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [smilo.messages, smilo.isTyping]);

  // Focus input when switching to freeText mode
  useEffect(() => {
    if (smilo.inputMode === 'freeText' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [smilo.inputMode]);

  const onPointerDown = useCallback((e) => {
    // Only drag on primary button; ignore clicks on child interactive elements
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: pos.right,
      startBottom: pos.bottom,
    };
    setDragging(true);
  }, [pos]);

  const onPointerMove = useCallback((e) => {
    if (!dragging || !dragOrigin.current) return;
    const dx = e.clientX - dragOrigin.current.startX;
    const dy = e.clientY - dragOrigin.current.startY;
    const newRight  = Math.max(8, Math.min(window.innerWidth  - 60, dragOrigin.current.startRight  - dx));
    const newBottom = Math.max(8, Math.min(window.innerHeight - 60, dragOrigin.current.startBottom - dy));
    setPos({ right: newRight, bottom: newBottom });
  }, [dragging]);

  const onPointerUp = useCallback((e) => {
    if (!dragging) return;
    setDragging(false);
    // If pointer barely moved, treat as a click (handled by onClick)
    const dx = Math.abs(e.clientX - dragOrigin.current.startX);
    const dy = Math.abs(e.clientY - dragOrigin.current.startY);
    dragOrigin.current = null;
    if (dx < 5 && dy < 5) return; // propagate click naturally
    e.stopPropagation();
  }, [dragging]);

  function handleOpen() {
    setHasOpened(true);
    smilo.open(location.pathname);
  }

  function handleFabClick() {
    // Skip click if we just finished a drag
    if (dragging) return;
    smilo.isOpen ? smilo.close() : handleOpen();
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!inputValue.trim()) return;
    smilo.submitText(inputValue.trim());
    setInputValue('');
  }

  const lastSmiloMsg    = [...smilo.messages].reverse().find(m => m.sender === 'smilo');
  const activeChips     = lastSmiloMsg?.quickReplies ?? null;
  const isInWalkthrough = smilo.walkthrough !== null;

  // Chat panel sits above the FAB
  const PANEL_W  = 380;
  const PANEL_H  = 560;
  const GAP      = 12; // gap between FAB and panel
  const FAB_H    = 48; // FAB circle height

  // Clamp panel so it stays within viewport
  const panelRight  = Math.max(8, Math.min(window.innerWidth  - PANEL_W  - 8, pos.right));
  const panelBottom = Math.max(8, Math.min(window.innerHeight - PANEL_H  - 8, pos.bottom + FAB_H + GAP));

  return (
    <>
      {/* ── Floating launcher button ── */}
      <div
        style={{ right: pos.right, bottom: pos.bottom, touchAction: 'none' }}
        className="fixed z-50 flex flex-col items-center gap-1.5 select-none"
      >
        {/* Speech bubble — only when closed */}
        {!smilo.isOpen && !dragging && (
          <div className="relative bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-md pointer-events-none">
            <span className="text-xs font-semibold text-[#137fec] whitespace-nowrap">Ask Dr. Smilo</span>
            {/* tail */}
            <span className="absolute left-1/2 -translate-x-1/2 -bottom-[7px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[7px] border-t-white" />
            <span className="absolute left-1/2 -translate-x-1/2 -bottom-[8px] w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[8px] border-t-slate-200" style={{ zIndex: -1 }} />
          </div>
        )}
        <button
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={handleFabClick}
          className={`flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-shadow duration-300 ${
            dragging ? 'cursor-grabbing shadow-xl' : 'cursor-grab'
          } ${
            smilo.isOpen
              ? 'bg-white border border-slate-200 hover:bg-slate-50'
              : 'bg-white border-2 border-[#137fec] hover:shadow-xl'
          }`}
          title={smilo.isOpen ? 'Close Dr. Smilo' : 'Ask Dr. Smilo'}
        >
          <SmiloAvatar state={smilo.isOpen ? 'idle' : (hasOpened ? 'happy' : 'idle')} size={30} />
        </button>
      </div>

      {/* ── Chat panel ── */}
      <div
        style={{ right: panelRight, bottom: panelBottom }}
        className={`fixed z-[60] transition-opacity duration-300 ease-in-out ${
          smilo.isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }
        w-[380px] max-w-[calc(100vw-2rem)]
        h-[560px] max-h-[calc(100vh-6rem)]
        bg-white rounded-2xl shadow-2xl border border-slate-200
        flex flex-col overflow-hidden`}
      >
        {/* Panel header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-[#137fec]/5 to-white flex-shrink-0">
          <div className="relative">
            <SmiloAvatar state={smilo.avatarState} size={38} />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900">Dr. Smilo</p>
            <p className="text-xs text-slate-400">
              {smilo.isTyping ? 'Typing…' : 'Here to help 🦷'}
            </p>
          </div>
          <button
            onClick={smilo.close}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Message thread */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-0.5 scroll-smooth"
        >
          {smilo.messages.map(msg =>
            msg.type === 'step' ? (
              <WalkthroughCard key={msg.id} msg={msg} onAction={smilo.stepAction} />
            ) : (
              <ChatBubble key={msg.id} msg={msg} />
            )
          )}
          {smilo.isTyping && <TypingIndicator />}
        </div>

        {/* Quick reply chips */}
        {!isInWalkthrough && !smilo.isTyping && activeChips && (
          <QuickReplies
            options={activeChips}
            onSelect={smilo.selectChip}
            disabled={smilo.isTyping}
          />
        )}

        {/* Text input */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-100 flex-shrink-0"
        >
          <input
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder={smilo.inputMode === 'freeText' ? 'Type your question…' : 'Or type to search…'}
            disabled={smilo.isTyping || isInWalkthrough}
            className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-full px-4 py-2 outline-none focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 disabled:opacity-50 transition-all placeholder-slate-400"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || smilo.isTyping || isInWalkthrough}
            className="w-8 h-8 rounded-full bg-[#137fec] text-white flex items-center justify-center disabled:opacity-40 hover:bg-blue-700 transition-colors flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
          </button>
        </form>

        {/* Restart link */}
        <div className="flex justify-center pb-2 flex-shrink-0">
          <button
            onClick={() => smilo.open(location.pathname)}
            className="text-[10px] text-slate-400 hover:text-[#137fec] transition-colors"
          >
            Start over
          </button>
        </div>
      </div>

      {/* Confetti */}
      {smilo.showConfetti && <ConfettiBurst />}
    </>
  );
}
