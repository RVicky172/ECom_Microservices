/**
 * Usage report CLI (012, AC-13, Q11): reads `assistant.interaction` and
 * `assistant.feedback` from the start and prints totals per UTC day and model.
 *
 * Kafka advertises only `kafka:9092`, so this runs inside the assistant container
 * (D-024): `npm run assistant:usage` → `docker compose exec assistant-service node
 * packages/assistant-service/dist/analytics/usageReport.js`. It reads each partition up to the high-water
 * mark taken at start, so it ends when it has read everything that was there,
 * not after a guessed wait. Covers only what the topics still hold.
 */
import { randomUUID } from 'crypto';
import {
  createKafkaClient,
  KafkaTopics,
  parseAssistantFeedback,
  parseAssistantInteraction,
  type AssistantFeedbackData,
  type AssistantInteractionData,
} from '@ecommerce/shared';
import { ANALYTICS_TOPICS } from '../clients/analyticsTopics';
import { aggregateUsage, type UsageSummary } from './usage';

/** Safety net only; the normal end is reaching every high-water mark. */
const MAX_RUN_MS = 60_000;

interface Collected {
  interactions: AssistantInteractionData[];
  feedback: AssistantFeedbackData[];
  badRecords: number;
}

const readTopics = async (): Promise<Collected> => {
  const kafka = createKafkaClient('assistant-usage-report');
  const admin = kafka.admin();
  await admin.connect();
  // partition key → the offset one past the last message present at start
  const remaining = new Map<string, number>();
  try {
    for (const topic of ANALYTICS_TOPICS) {
      for (const { partition, high, low } of await admin.fetchTopicOffsets(topic)) {
        if (Number(high) > Number(low)) remaining.set(`${topic}:${partition}`, Number(high));
      }
    }
  } finally {
    await admin.disconnect();
  }

  const collected: Collected = { interactions: [], feedback: [], badRecords: 0 };
  if (remaining.size === 0) return collected;

  const consumer = kafka.consumer({ groupId: `assistant-usage-report-${randomUUID()}` });
  await consumer.connect();
  await consumer.subscribe({ topics: ANALYTICS_TOPICS, fromBeginning: true });

  let finish!: () => void;
  const finished = new Promise<void>((resolve) => (finish = resolve));
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const key = `${topic}:${partition}`;
      const end = remaining.get(key);
      if (end === undefined || Number(message.offset) >= end) return; // arrived after the report started
      try {
        const envelope = JSON.parse(message.value?.toString() ?? '') as { data?: unknown };
        if (topic === KafkaTopics.ASSISTANT_INTERACTION) collected.interactions.push(parseAssistantInteraction(envelope.data));
        else collected.feedback.push(parseAssistantFeedback(envelope.data));
      } catch {
        collected.badRecords += 1;
      }
      if (Number(message.offset) + 1 >= end) {
        remaining.delete(key);
        if (remaining.size === 0) finish();
      }
    },
  });

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Usage report: not all events read within ${MAX_RUN_MS / 1000} s`)), MAX_RUN_MS);
  });
  try {
    await Promise.race([finished, timeout]);
  } finally {
    clearTimeout(timer);
    await consumer.disconnect();
  }
  return collected;
};

const table = (headers: string[], rows: string[][]): string => {
  const widths = headers.map((header, column) => Math.max(header.length, ...rows.map((row) => row[column].length)));
  const line = (cells: string[]) => cells.map((cell, column) => cell.padEnd(widths[column])).join('  ');
  return [line(headers), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join('\n');
};

/** Renders the usage summary as a plain-text table, with the count of unreadable records. */
export const formatUsage = ({ rows, unmatchedRatings }: UsageSummary, badRecords: number): string => {
  if (rows.length === 0) return 'No assistant usage events found.';
  const main = table(
    ['day', 'model', 'convs', 'turns', 'handoffs', 'mean ms', 'p95 ms', 'input', 'cached', 'output', 'no usage', 'up', 'down'],
    rows.map((row) => [
      row.day,
      row.model,
      String(row.conversations),
      String(row.turns),
      String(row.handoffs),
      String(row.latencyMeanMs),
      String(row.latencyP95Ms),
      String(row.tokens.inputTokens),
      String(row.tokens.cachedInputTokens),
      String(row.tokens.outputTokens),
      String(row.turnsWithoutUsage),
      String(row.ratingsUp),
      String(row.ratingsDown),
    ]),
  );
  const details = rows.map((row) => {
    const tools = Object.entries(row.toolCalls).map(([name, count]) => `${name} ${count}`).join(', ') || 'none';
    const outcomes = Object.entries(row.outcomes).map(([name, count]) => `${name} ${count}`).join(', ');
    return `${row.day} ${row.model}\n  tool calls: ${tools}\n  outcomes:   ${outcomes}`;
  });
  const notes = [
    unmatchedRatings ? `${unmatchedRatings} rating(s) for answers with no interaction event` : '',
    badRecords ? `${badRecords} unreadable record(s) skipped` : '',
  ].filter(Boolean);
  return [main, '', ...details, ...(notes.length ? ['', ...notes] : [])].join('\n');
};

const main = async (): Promise<void> => {
  const { interactions, feedback, badRecords } = await readTopics();
  console.log(formatUsage(aggregateUsage(interactions, feedback), badRecords));
};

if (require.main === module) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
