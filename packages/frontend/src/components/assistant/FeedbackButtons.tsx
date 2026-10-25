/** Thumbs up and down under an assistant answer (012). */
import type { AnswerRating } from '../../types/assistant';

interface FeedbackButtonsProps {
  rating?: AnswerRating;
  onRate: (rating: AnswerRating) => void;
}

const OPTIONS: Array<{ rating: AnswerRating; label: string; icon: string }> = [
  { rating: 'up', label: 'Helpful', icon: '👍' },
  { rating: 'down', label: 'Not helpful', icon: '👎' },
];

/**
 * Thumbs up / down under a finished assistant answer (012). Native buttons, so
 * Tab, Enter and Space work; `aria-pressed` tells screen readers which one is
 * chosen. Clicking the other one changes the rating; the last one counts.
 */
export function FeedbackButtons({ rating, onRate }: FeedbackButtonsProps): React.JSX.Element {
  return (
    <div className="assistant-feedback" role="group" aria-label="Rate this answer">
      {OPTIONS.map((option) => (
        <button
          key={option.rating}
          type="button"
          className="assistant-feedback-button"
          aria-label={option.label}
          title={option.label}
          aria-pressed={rating === option.rating}
          onClick={() => onRate(option.rating)}
        >
          <span aria-hidden="true">{option.icon}</span>
        </button>
      ))}
    </div>
  );
}
