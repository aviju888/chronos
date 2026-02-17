import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TimelineData, ChatMessage } from '../types';
import { askFollowUp } from '../services/apiService';
import { Send, MessageSquare, X, Trash2 } from 'lucide-react';
import { formatYearRange } from '../utils';

// Chat history persistence helpers
const CHAT_STORAGE_PREFIX = 'chronos_chat_';
const MAX_STORED_MESSAGES = 50;

const getChatStorageKey = (timelineId: string) => `${CHAT_STORAGE_PREFIX}${timelineId}`;

const loadChatHistory = (timelineId: string): ChatMessage[] | null => {
  try {
    const stored = localStorage.getItem(getChatStorageKey(timelineId));
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load chat history', e);
  }
  return null;
};

const saveChatHistory = (timelineId: string, messages: ChatMessage[]): void => {
  try {
    // Only store the last N messages to avoid storage bloat
    const toStore = messages.slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(getChatStorageKey(timelineId), JSON.stringify(toStore));
  } catch (e) {
    console.warn('Failed to save chat history', e);
  }
};

const clearChatHistory = (timelineId: string): void => {
  try {
    localStorage.removeItem(getChatStorageKey(timelineId));
  } catch (e) {
    console.warn('Failed to clear chat history', e);
  }
};

interface ChatPanelProps {
  timelineData: TimelineData;
  isOpen: boolean;
  onClose: () => void;
  pendingMessage?: string | null;
  onMessageHandled?: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  timelineData,
  isOpen,
  onClose,
  pendingMessage,
  onMessageHandled
}) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousTimelineIdRef = useRef<string>(timelineData.id);

  // Create default welcome message
  const getWelcomeMessage = useCallback((): ChatMessage => ({
    id: 'init',
    role: 'model',
    text: `I have studied the timeline of ${timelineData.region} (${formatYearRange(timelineData.timeRange.start, timelineData.timeRange.end)}). Ask me anything about these events!`,
    timestamp: Date.now()
  }), [timelineData.region, timelineData.timeRange.start, timelineData.timeRange.end]);

  // Load chat history when timeline changes
  useEffect(() => {
    if (previousTimelineIdRef.current !== timelineData.id || messages.length === 0) {
      // Try to load existing chat history
      const savedHistory = loadChatHistory(timelineData.id);

      if (savedHistory && savedHistory.length > 0) {
        setMessages(savedHistory);
      } else {
        // No saved history, start fresh with welcome message
        setMessages([getWelcomeMessage()]);
      }

      previousTimelineIdRef.current = timelineData.id;
    }
  }, [timelineData.id, getWelcomeMessage]);

  // Save chat history when messages change
  useEffect(() => {
    if (messages.length > 0 && previousTimelineIdRef.current === timelineData.id) {
      saveChatHistory(timelineData.id, messages);
    }
  }, [messages, timelineData.id]);

  // Clear chat and start fresh
  const handleClearChat = useCallback(() => {
    clearChatHistory(timelineData.id);
    setMessages([getWelcomeMessage()]);
  }, [timelineData.id, getWelcomeMessage]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, isTyping]);

  // Handle pending message from parent (e.g. from Event Modal)
  useEffect(() => {
    if (pendingMessage && onMessageHandled) {
        handleSend(pendingMessage);
        onMessageHandled();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSend changes on every render, we only want to trigger on new pendingMessage
  }, [pendingMessage, onMessageHandled]);

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim() || isTyping) return;
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: textToSend, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Prepare history for API
      const historyForApi = messages.map(m => ({ role: m.role, text: m.text }));
      const responseText = await askFollowUp(timelineData, historyForApi, userMsg.text);
      
      const botMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() };
      setMessages(prev => [...prev, botMsg]);
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "I encountered an error accessing the archives. Please try again.", timestamp: Date.now() }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Backdrop overlay - visible on mobile when panel is open */}
      <div
        className={`fixed inset-0 bg-black/50 z-[1400] md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Chat panel - full width on mobile, fixed width on desktop */}
      <div className={`fixed z-[1500] flex flex-col bg-paper dark:bg-night-light shadow-2xl transition-all duration-300 ease-out
        /* Mobile: bottom drawer */
        inset-x-0 bottom-0 h-[85vh] rounded-t-2xl border-t border-stone-200 dark:border-gold/20
        /* Desktop: right sidebar */
        md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:h-auto md:w-96 md:rounded-none md:border-l md:border-t-0
        /* Transform based on open state */
        ${isOpen ? 'translate-y-0 md:translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'}
      `}>
        {/* Drag handle for mobile */}
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-stone-300 dark:bg-gold/30 rounded-full" />
        </div>

        <div className="p-4 bg-ink text-paper flex justify-between items-center shadow-md">
          <h3 className="font-display font-bold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gold" />
            Historian Assistant
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={handleClearChat}
              className="text-sm hover:text-gold p-2 rounded hover:bg-white/10 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Clear chat history"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="text-sm hover:text-gold p-2 rounded hover:bg-white/10 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50 dark:bg-night" ref={scrollRef}>
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-lg text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-ink text-white rounded-br-none shadow-md'
                  : 'bg-white dark:bg-night-lighter border border-stone-200 dark:border-gold/20 text-ink dark:text-paper rounded-bl-none shadow-sm'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-stone-100 dark:bg-night-lighter p-3 rounded-lg rounded-bl-none text-xs text-slate dark:text-paper/60 italic animate-pulse border border-stone-200 dark:border-gold/20">
                Consulting archives...
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-white dark:bg-night-light border-t border-stone-200 dark:border-gold/20 pb-safe">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question..."
              className="flex-1 p-3 border border-stone-300 dark:border-gold/30 rounded-lg focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 text-base bg-white dark:bg-night text-ink dark:text-paper placeholder:text-ink/40 dark:placeholder:text-paper/40"
              aria-label="Type your question"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isTyping}
              className="bg-gold hover:bg-gold-dark text-white p-3 rounded-lg transition-colors disabled:opacity-50 min-w-[48px] min-h-[48px] flex items-center justify-center"
              aria-label="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
