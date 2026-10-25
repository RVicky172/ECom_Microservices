/**
 * All runtime configuration for the assistant service, read once from the environment.
 * See docs/ai-shopping-assistant.md §9 for what each variable does.
 */

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** `anthropic` = Claude API; `openai-compatible` = LM Studio, Ollama, vLLM or any `/v1/chat/completions` server. */
export type ProviderId = 'anthropic' | 'openai-compatible';

const provider = (process.env.ASSISTANT_PROVIDER || 'anthropic') as ProviderId;

const float = (value: string | undefined, fallback: number): number => {
  const parsed = parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
};

const int = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** The assistant's settings, with defaults for local development. */
export const config = {
  port: int(process.env.PORT, 4008),

  /** Which model API to use. */
  provider,
  /**
   * Model ID. Defaults to Claude Opus 5.5 for `anthropic`. For
   * `openai-compatible`, empty means "use the first model the server lists"
   * (in LM Studio, the loaded model).
   */
  model: process.env.ASSISTANT_MODEL || (provider === 'anthropic' ? 'claude-opus-5-5' : ''),
  /** Anthropic only: `output_config.effort`. Chat and lookups rarely need deep reasoning. */
  effort: (process.env.ASSISTANT_EFFORT || 'low') as Effort,
  /** Upper bound on API requests (model ↔ tool round trips) per user message. */
  maxIterations: int(process.env.ASSISTANT_MAX_ITERATIONS, 8),
  maxTokens: 16000,

  /** Settings for the `openai-compatible` provider (LM Studio by default). */
  openai: {
    baseUrl: process.env.ASSISTANT_OPENAI_BASE_URL || 'http://localhost:1234/v1',
    /** LM Studio ignores the key, but the client requires a value. */
    apiKey: process.env.ASSISTANT_OPENAI_API_KEY || 'lm-studio',
    /** Low temperature keeps tool use and facts steady on local models. */
    temperature: float(process.env.ASSISTANT_TEMPERATURE, 0.3),
    /** Local models can be slow; one model call may take this long. */
    requestTimeoutMs: int(process.env.ASSISTANT_OPENAI_TIMEOUT_MS, 120_000),
  },

  /** Per-user message limit, counted per clock hour. */
  userMessagesPerHour: int(process.env.ASSISTANT_USER_MSGS_PER_HOUR, 30),
  /** Longest accepted user message, in characters. */
  maxMessageLength: 2000,
  /** Conversations are capped instead of truncated, because history must stay append-only. */
  maxHistoryMessages: int(process.env.ASSISTANT_MAX_HISTORY_MESSAGES, 80),
  conversationTtlSeconds: 7 * 24 * 60 * 60,

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: int(process.env.REDIS_PORT, 6379),
  },

  /** Internal service URLs the tools call (same values the gateway uses). */
  services: {
    product: process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002',
    cart: process.env.CART_SERVICE_URL || 'http://localhost:4003',
    order: process.env.ORDER_SERVICE_URL || 'http://localhost:4004',
    inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:4005',
    payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:4006',
  },
  serviceTimeoutMs: 5000,
};
