/**
 * Sums `assistant.interaction` and `assistant.feedback` events per UTC day and
 * model for the usage report (012, AC-13, Q11). Pure: the CLI reads the topics.
 */
import type { AnswerRating, AssistantFeedbackData, AssistantInteractionData, InteractionOutcome, TokenUsage } from '@ecommerce/shared';

/** One line of the usage report: a UTC day and model's turns, latency, tokens and ratings. */
export interface UsageRow {
  /** UTC day, `YYYY-MM-DD`, of the turn's completion. */
  day: string;
  model: string;
  conversations: number;
  turns: number;
  toolCalls: Record<string, number>;
  outcomes: Partial<Record<InteractionOutcome, number>>;
  /** Turns whose outcome was `handoff`, repeats included (D-026). */
  handoffs: number;
  latencyMeanMs: number;
  latencyP95Ms: number;
  tokens: TokenUsage;
  turnsWithoutUsage: number;
  /** Last vote per answer, joined to the answer's turn. */
  ratingsUp: number;
  ratingsDown: number;
}

/** The usage report's rows, plus the ratings that matched no turn. */
export interface UsageSummary {
  rows: UsageRow[];
  /** Ratings for answers with no interaction event (dropped, or older than the topic's data). */
  unmatchedRatings: number;
}

/** Nearest-rank 95th percentile: the ⌈0.95·n⌉-th smallest value. */
export const nearestRankP95 = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
};

interface Group {
  day: string;
  model: string;
  conversations: Set<string>;
  turns: AssistantInteractionData[];
  ratings: AnswerRating[];
}

/**
 * Groups turns by day and model (one per answer ID, so duplicates count once) and joins the ratings on
 * `answerId`.
 */
export const aggregateUsage = (interactions: AssistantInteractionData[], feedback: AssistantFeedbackData[]): UsageSummary => {
  // One turn per answer ID, so a duplicated event counts once.
  const byAnswer = new Map<string, AssistantInteractionData>();
  for (const interaction of interactions) if (!byAnswer.has(interaction.answerId)) byAnswer.set(interaction.answerId, interaction);

  const groups = new Map<string, Group>();
  const groupOf = (interaction: AssistantInteractionData): Group => {
    const day = interaction.completedAt.slice(0, 10);
    const key = `${day}\u0000${interaction.model}`;
    let group = groups.get(key);
    if (!group) {
      group = { day, model: interaction.model, conversations: new Set(), turns: [], ratings: [] };
      groups.set(key, group);
    }
    return group;
  };
  for (const interaction of byAnswer.values()) {
    const group = groupOf(interaction);
    group.conversations.add(interaction.conversationId);
    group.turns.push(interaction);
  }

  // The latest vote per answer wins, whatever order the events arrive in.
  const lastVote = new Map<string, AssistantFeedbackData>();
  for (const vote of feedback) {
    const previous = lastVote.get(vote.answerId);
    if (!previous || vote.ratedAt >= previous.ratedAt) lastVote.set(vote.answerId, vote);
  }
  let unmatchedRatings = 0;
  for (const vote of lastVote.values()) {
    const interaction = byAnswer.get(vote.answerId);
    if (interaction) groupOf(interaction).ratings.push(vote.rating);
    else unmatchedRatings += 1;
  }

  const rows = [...groups.values()].map((group): UsageRow => {
    const toolCalls: Record<string, number> = {};
    const outcomes: Partial<Record<InteractionOutcome, number>> = {};
    const tokens: TokenUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
    let turnsWithoutUsage = 0;
    for (const turn of group.turns) {
      for (const tool of turn.tools) toolCalls[tool] = (toolCalls[tool] ?? 0) + 1;
      outcomes[turn.outcome] = (outcomes[turn.outcome] ?? 0) + 1;
      if (!turn.usage) {
        turnsWithoutUsage += 1;
        continue;
      }
      tokens.inputTokens += turn.usage.inputTokens;
      tokens.cachedInputTokens += turn.usage.cachedInputTokens;
      tokens.outputTokens += turn.usage.outputTokens;
    }
    const latencies = group.turns.map((turn) => turn.latencyMs);
    return {
      day: group.day,
      model: group.model,
      conversations: group.conversations.size,
      turns: group.turns.length,
      toolCalls,
      outcomes,
      handoffs: outcomes.handoff ?? 0,
      latencyMeanMs: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
      latencyP95Ms: nearestRankP95(latencies)!,
      tokens,
      turnsWithoutUsage,
      ratingsUp: group.ratings.filter((value) => value === 'up').length,
      ratingsDown: group.ratings.filter((value) => value === 'down').length,
    };
  });
  rows.sort((a, b) => (a.day === b.day ? a.model.localeCompare(b.model) : a.day.localeCompare(b.day)));
  return { rows, unmatchedRatings };
};
