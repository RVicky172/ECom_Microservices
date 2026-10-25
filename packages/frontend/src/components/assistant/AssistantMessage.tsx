/** A message bubble in the assistant chat. */
import type { AnswerRating, ChatItem } from '../../types/assistant';
import { formatCurrency } from '../../utils/storePresentation';
import { FeedbackButtons } from './FeedbackButtons';
import { ProposalButton } from './ProposalButton';

/**
 * Turns `**bold**` (which local models often write despite instructions) into
 * <strong>. Builds React elements, never HTML, so text can't inject markup.
 */
const renderInline = (text: string): React.ReactNode[] =>
  text.split(/\*\*(.+?)\*\*/g).map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part));

interface AssistantMessageProps {
  item: ChatItem;
  onRate?: (item: ChatItem, rating: AnswerRating) => void;
}

/**
 * One chat bubble. Assistant bubbles can also carry a live activity line,
 * product cards and "Add to cart" suggestions. Text is rendered as plain text
 * (never as HTML), so model output can't inject markup.
 */
export function AssistantMessage({ item, onRate }: AssistantMessageProps): React.JSX.Element {
  const isUser = item.role === 'user';
  const isEmpty = !item.text && !item.activity && !item.error && item.products.length === 0;
  // `answerId` arrives with `done`, so the buttons never show while streaming (012).
  const canRate = !isUser && Boolean(item.answerId) && !item.error && Boolean(onRate);

  return (
    <div className={`assistant-message ${isUser ? 'from-user' : 'from-assistant'}`}>
      {item.text && <p className="assistant-bubble">{isUser ? item.text : renderInline(item.text)}</p>}
      {!isUser && isEmpty && <p className="assistant-bubble assistant-typing" aria-label="Assistant is typing"><i /><i /><i /></p>}
      {item.activity && <p className="assistant-activity"><span className="loader" />{item.activity}</p>}

      {item.products.length > 0 && (
        <ul className="assistant-products">
          {item.products.map((product) => (
            <li key={product.id}>
              {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <span className="assistant-product-mark">{product.name.charAt(0)}</span>}
              <span className="assistant-product-name">{product.name}</span>
              <strong>{formatCurrency(product.price)}</strong>
            </li>
          ))}
        </ul>
      )}

      {item.proposals.map((proposal) => <ProposalButton key={proposal.id} proposal={proposal} />)}

      {item.error && <p className="assistant-error" role="alert">{item.error.message}</p>}

      {canRate && <FeedbackButtons rating={item.rating} onRate={(rating) => onRate!(item, rating)} />}
    </div>
  );
}
