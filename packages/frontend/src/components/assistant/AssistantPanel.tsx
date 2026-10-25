/** The assistant's chat window. */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { useAssistantChat } from '../../hooks/useAssistantChat';
import { AssistantMessage } from './AssistantMessage';

/** Starter prompts shown in an empty conversation. */
const SUGGESTIONS = [
  'Find me a keyboard for long writing sessions',
  'Where is my latest order?',
  "What's in my cart?",
];

interface AssistantPanelProps {
  chat: ReturnType<typeof useAssistantChat>;
  onClose: () => void;
}

/**
 * The open chat window: conversation, starter prompts and the message box.
 * Enter sends, Shift+Enter adds a new line, Escape closes.
 */
export function AssistantPanel({ chat, onClose }: AssistantPanelProps): React.JSX.Element {
  const { items, isStreaming, isRestoring, send, stop, newChat } = chat;
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // Keep the newest message in view as replies stream in.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [items]);

  const submit = (text: string): void => {
    if (!text.trim() || isStreaming) return;
    setDraft('');
    void send(text);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submit(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit(draft);
    }
  };

  return (
    <section
      className="assistant-panel"
      role="dialog"
      aria-label="Shopping assistant"
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
    >
      <header className="assistant-header">
        <div>
          <p className="eyebrow">MERCATO ASSISTANT</p>
          <h2>How can I help?</h2>
        </div>
        <div className="assistant-header-actions">
          <button type="button" className="text-button" onClick={newChat} disabled={items.length === 0}>New chat</button>
          <button type="button" className="assistant-close" onClick={onClose} aria-label="Close assistant">×</button>
        </div>
      </header>

      <div className="assistant-log" ref={logRef} role="log" aria-live="polite">
        {isRestoring && <p className="assistant-activity"><span className="loader" />Loading your conversation…</p>}
        {!isRestoring && items.length === 0 && (
          <div className="assistant-empty">
            <p>Ask about products, stock, your cart or your orders. I'll suggest items, and you decide what goes in the cart.</p>
            {SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} type="button" className="assistant-suggestion" onClick={() => submit(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {items.map((item) => <AssistantMessage key={item.id} item={item} />)}
      </div>

      <form className="assistant-form" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          rows={1}
          maxLength={2000}
          placeholder="Ask about products or orders…"
          aria-label="Message the assistant"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {isStreaming ? (
          <button type="button" onClick={stop}>Stop</button>
        ) : (
          <button type="submit" disabled={!draft.trim()}>Send</button>
        )}
      </form>
      <p className="assistant-disclaimer">AI answers can be wrong. Check details before you buy.</p>
    </section>
  );
}
