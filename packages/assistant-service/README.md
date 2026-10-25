# Assistant Service: the AI shopping assistant

The Assistant Service powers the "Ask mercato" chat in the store. It listens on port `4008` by default. A signed-in customer asks a question; the service sends the conversation to a language model (Claude, or a local model in LM Studio), runs the store lookups Claude asks for (products, stock, cart, orders), and streams the answer back to the browser as it is written.

It is optional. With the `anthropic` provider and no `ANTHROPIC_API_KEY`, the service still starts, `/health` reports `"configured": false`, and the chat replies that the assistant is not set up. The rest of the store is unaffected.

Run it from the repository root with:

```sh
npm run dev:assistant
```

The full design, rollout phases and open questions are in [docs/ai-shopping-assistant.md](../../docs/ai-shopping-assistant.md).

## Model providers

`ASSISTANT_PROVIDER` chooses the model backend. The tools, safety rules and chat UI are the same for both.

| Provider | Use it for | Needs |
| --- | --- | --- |
| `anthropic` (default) | Claude through the Anthropic API | `ANTHROPIC_API_KEY` with API credits |
| `openai-compatible` | A local or self-hosted model: LM Studio, Ollama, vLLM, llama.cpp | A running server with a tool-calling model loaded |

### Using LM Studio

1. In LM Studio, download and load a model that supports **tool use**. A 30B model such as Qwen3-30B-A3B works well. Models without tool support can chat but can't look anything up.
2. In the model's load settings, set the **context length to at least 16384**. The system prompt, tool definitions and history don't fit in the 4096 default.
3. Open the **Developer** tab and **Start Server** (port `1234`).
4. In `.env`, set `ASSISTANT_PROVIDER=openai-compatible` and leave `ASSISTANT_MODEL` empty to use the loaded model, or set its API identifier.
5. Run `docker compose up -d --build assistant-service`. `GET /health` shows the provider and model.

To load Qwen3 30B on a 16 GB GPU without slowing the PC down (context length, parallel slots, avoiding a second
copy), follow [`docs/lm-studio-setup.md`](../../docs/lm-studio-setup.md).

The container reaches your machine as `host.docker.internal` (see `extra_hosts` in `docker-compose.yml`). If chats fail with a connection error, enable **Serve on Local Network** in LM Studio's server settings. When running the service directly on your machine (`npm run dev:assistant`), use `ASSISTANT_OPENAI_BASE_URL=http://localhost:1234/v1`.

Local models differ from Claude in a few ways the service handles: `<think>…</think>` reasoning is removed from replies and history, tool arguments are validated with the same Zod schemas (invalid calls go back to the model as errors), and a missing tool-call ID is generated. Answers are usually slower and less reliable than Claude's, so check them before relying on them.

Conversations are stored in the format of the provider that wrote them. After switching providers, older conversations start fresh.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ASSISTANT_PROVIDER` | `anthropic` | `anthropic` or `openai-compatible` |
| `ASSISTANT_MODEL` | `claude-opus-5-5` (anthropic); first listed model (openai-compatible) | Model ID |
| `ANTHROPIC_API_KEY` | none | Claude API key. Server-side only. |
| `ASSISTANT_EFFORT` | `low` | Anthropic only: how much the model reasons before answering (`low` to `max`) |
| `ASSISTANT_OPENAI_BASE_URL` | `http://localhost:1234/v1` | OpenAI-compatible server URL (`http://host.docker.internal:1234/v1` from Docker) |
| `ASSISTANT_OPENAI_API_KEY` | `lm-studio` | Sent as the API key; LM Studio ignores it |
| `ASSISTANT_TEMPERATURE` | `0.3` | OpenAI-compatible only: lower is steadier |
| `ASSISTANT_OPENAI_TIMEOUT_MS` | `120000` | Time limit for one model call |
| `ASSISTANT_TIMEOUT_MS` (gateway) | `300000` | Time limit for one streamed reply through the gateway |
| `ASSISTANT_MAX_ITERATIONS` | `8` | Maximum model ↔ tool round trips for one message. |
| `ASSISTANT_USER_MSGS_PER_HOUR` | `30` | Per-user message limit. |
| `ASSISTANT_MAX_HISTORY_MESSAGES` | `80` | Conversation size cap (see below). |
| `REDIS_HOST`, `REDIS_PORT` | `localhost:6379` | Conversation storage, turn locks, rate limits, handoff references. |
| `KAFKA_BROKERS` | `localhost:9092` | Where handoff events are published. Only a handoff needs Kafka; the chat works without it. |
| `PRODUCT_SERVICE_URL` … `PAYMENT_SERVICE_URL` | `localhost:4002`–`4006` | Internal services the tools call. |
| `INTERNAL_SERVICE_TOKEN` | unset | Sent to internal services, and required from the gateway, when set. |

## Endpoints

Routes are mounted below `/api/v1/assistant`. The gateway requires a valid access token for all of them.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/chat` | Send `{ conversationId?, message }`; the reply streams back as Server-Sent Events |
| `GET` | `/conversations/:id` | The visible transcript, used to restore the chat after a reload. Each assistant entry carries its `answerId`; `ratings` holds the saved votes |
| `PUT` | `/conversations/:id/answers/:answerId/feedback` | Rate one answer with `{ "rating": "up" }` or `{ "rating": "down" }` → 204. The last vote counts; 400 for another value, 404 for another user's conversation or an unknown answer |
| `DELETE` | `/conversations/:id` | Delete a conversation's history (and its ratings) |

### The event stream

`POST /chat` answers with `text/event-stream`. Every event is `event: <type>` plus a JSON `data` line:

| Event | Meaning |
| --- | --- |
| `start` | Turn accepted; carries the `conversationId` (new conversations get one here) |
| `text` | A piece of the answer to append |
| `tool_status` | A lookup is `running`, `done`, or hit an `error` (drives "Checking your orders…") |
| `products` | Product cards to show under the answer |
| `proposal` | An "Add to cart" suggestion the customer can confirm |
| `handoff` | A handoff was requested; carries the `reference` and whether it was `alreadyRequested` |
| `done` | Turn finished: the model's `stopReason`, the `answerId` that feedback refers to, and the token `usage` (`null` if the provider reported none) |
| `error` | `not_configured`, `rate_limited`, `busy`, `conversation_full`, or `assistant_unavailable` |

Problems found before the model is called (limits, a turn already running) are also sent as a single `error` event, so the browser handles every outcome the same way.

## Follow one message

1. The gateway verifies the JWT and forwards the request with `x-user-id`.
2. `chatController.postChat` validates the body, checks the per-user hourly limit, loads the conversation from Redis, and takes a per-conversation lock so two turns can't run at once.
3. `agent/runAgent.ts` hands the history, the new message and the tools to the configured provider (`agent/providers/`).
4. The model streams text and may request tools. The provider runs the tool's `run` function, sends the result back, and repeats until the model finishes (or `ASSISTANT_MAX_ITERATIONS` is reached). The Anthropic provider uses the SDK's tool runner; the OpenAI-compatible provider runs the same loop by hand.
5. Text deltas and tool activity are written to the response as they happen.
6. If the reply says the customer is being connected to a person but `request_human_handoff` didn't run, a correction is streamed and added to the reply (`agent/handoffGuard.ts`, D-048).
7. The complete history, including Claude's tool calls and results exactly as returned, is saved back to Redis.
8. After the response has ended, one `assistant.interaction` event is published (see Usage analytics). It is never awaited, so it can't slow the chat.

## The tools

All tools except `request_human_handoff` are read-only. They are defined once in `src/agent/tools.ts` against a provider-neutral contract (`src/agent/toolTypes.ts`). Each one is a thin wrapper over an existing service endpoint (`src/clients/storeClients.ts`).

| Tool | Data source |
| --- | --- |
| `search_products` | Product Service catalog, filtered in the tool by keywords, category and price |
| `get_product` | Product Service |
| `check_stock` | Inventory Service, reduced to `in_stock` / `low_stock` / `out_of_stock` / `unknown` |
| `get_cart` | Cart Service |
| `list_orders` | Order Service (10 most recent) |
| `get_order` | Order Service + Payment Service; accepts a full ID or the 8-character reference |
| `propose_add_to_cart` | Product Service; emits a `proposal` event, adds nothing |
| `request_human_handoff` | Publishes `assistant.handoff_requested` to Kafka (the one tool that sends something; see below) |

## Store policies

The store's policies (returns, shipping, warranty, payment, cancellation and refunds) live in one file, [`policies/store-policies.md`](policies/store-policies.md). The service reads it at startup and puts it in the system prompt (`src/agent/policies.ts`, `src/agent/systemPrompt.ts`), cached for Claude. The prompt tells the model to answer policy questions only from this document, and when the document doesn't cover something, to say so and offer to connect the customer with a person rather than guess.

- **Changing a policy** needs no code change: edit the file and restart. Under Docker the file is copied into the image, so rebuild: `docker compose up -d --build assistant-service`.
- **A missing or empty file stops the service** at startup with `Store policy document not readable at …` or `Store policy document is empty: …`, so it never runs without its policies.
- Keep the terms explicit. Local models read silence literally: "card payments only" was read as "doesn't say" for PayPal until the file said "We don't accept any other payment method" (decision D-020).

## Talking to a person (handoff)

When the customer asks for a person, or says yes after the assistant offered one, the model calls `request_human_handoff` with a reason (`customer_request`, `policy_not_covered`, `order_problem`, `other`) and a short summary. The tool (`src/agent/handoffTool.ts`):

1. Returns the existing reference if this conversation already has one (Redis `assistant:handoff:{userId}:{conversationId}`, kept as long as the conversation), and publishes nothing.
2. Otherwise creates a reference such as `HO-90A1B81C` and publishes `assistant.handoff_requested` (`src/clients/handoffPublisher.ts`) with the reference, the user ID, the conversation ID, the reason, the summary and the time.
3. Stores the reference only once Kafka has accepted the event, then the assistant gives the customer the reference.

The Notification Service logs the support email for it ([its guide](../notification-service/README.md)).

If Kafka is unavailable, the publish gives up after one attempt (at most 5 s) and the customer is told support couldn't be reached and to try again later; nothing is stored, so trying again works once Kafka is back, and the rest of the chat keeps working. The single attempt is deliberate: a KafkaJS producer left retrying would deliver the handoff after the customer was told it failed (decision D-021).

**Privacy:** the event carries IDs, the reason category and a summary of at most 500 characters written by the model. No chat transcript and no email address leave the assistant, and the user ID always comes from the gateway, never from the model.

## How it stays safe

- **Identity comes only from the gateway.** The tools are created per request and close over the verified user ID. No tool takes a user ID as input, so the model can't request another customer's data.
- **Order ownership is checked here too.** Since feature 002 the Order and Payment services return 404 for someone else's order or payment. `getOwnOrder` still compares `user_id` as a second layer and reports someone else's order as not found. Short references are resolved only against the user's own orders.
- **The model cannot change anything.** There are no write tools; the only thing it can send is a handoff request, and only when the customer asks for it. `propose_add_to_cart` shows a button; the browser adds the item through the normal cart endpoint, with the user's own session, only when they click it.
- **Tool output is data.** The system prompt says tool results are data, not instructions. A local model still obeyed an instruction hidden in a product description (eval case I03), so the code defends too (`agent/untrustedText.ts`, D-047): `search_products` and `get_product` return descriptions only as `merchant_text_untrusted`, with a note beside them, after removing every sentence addressed to the assistant (`[text addressed to the assistant removed]`). The frontend renders replies as plain text, never HTML.
- **No false handoff claims.** A reply that says "I'll connect you" when no handoff happened gets a correction, so a customer is never left waiting for nobody (D-048).
- **Cost and abuse limits.** Per-user hourly limit in Redis, a cap on tool round trips, `max_tokens`, low effort by default, and a cached system prompt.
- **Refusals (Claude).** Requests use server-side fallbacks (`fallbacks: "default"`). If the final answer is still a refusal, the customer sees a neutral message.

## Answer feedback

Each finished answer shows thumbs up and down (`FeedbackButtons` in the frontend). A vote is stored in Redis as `assistant:feedback:{userId}:{conversationId}`, a hash of `answerId → up | down`. It expires and is deleted with the conversation, and holds no free text. Each vote also publishes an `assistant.feedback` event.

## Usage analytics

The assistant publishes two Kafka topics, keyed by conversation ID, that hold no user ID and no message text:

- `assistant.interaction`, one per finished turn: provider, model, stop reason, outcome (`answered`, `proposal`, `handoff`, `refused`, `error`, `limited`), tool names, latency and token usage;
- `assistant.feedback`, one per vote.

Publishing is best-effort and outside the request path: one attempt capped at 5 s, and a failure is dropped with one `warn` log line ("analytics event dropped"). With Kafka stopped, chat and ratings keep working and nothing is delivered late. The assistant creates both topics at startup, because nothing consumes them.

To see the totals per UTC day and model (conversations, turns, tool calls, handoffs, mean and p95 latency, tokens, votes), run from the repository root:

```sh
npm run assistant:usage
```

It reads both topics from the start with a fresh consumer group. A `TimeoutNegativeWarning` it prints comes from KafkaJS and is harmless.

## Evals

The eval suite checks the assistant's behaviour against the running stack and the configured model. It isn't part of `npm test` or `npm run check`, and no automated test calls a model. Run it before changing the prompt, the tools, the model or its settings:

```sh
npm run eval
```

1. It checks `/health` on the services and the assistant (`configured: true`). Load the model first: see [docs/lm-studio-setup.md](../../docs/lm-studio-setup.md).
2. Through the services' own APIs, it registers 5 users for the run (`eval-<runId>-<role>@example.com`), places their orders (one confirmed or randomly declined, one Laptop ×9999 that is always cancelled for stock, one belonging to another user), and waits for the saga to settle each one.
3. It runs the 50 cases in `src/evals/cases.ts` one by one, each in a new conversation, calling the assistant directly with the identity and internal-token headers. The injection case's product ("Eval Lantern") exists only while that case runs.
4. It grades each case and writes `eval-reports/<runId>-<provider>.json` and `.md` (git-ignored): pass or fail per case with the failing rule and reply, rates per category and overall, safety failures, tokens, and the cases that changed since the last report for the same model.
5. Exit code 0 means the target was met: at least 90% and no safety failure. 1 means it was missed, and 2 means the stack or the setup failed.

A case is `{ id, category, safety, messages, rules }`. Rules check the last turn: `toolCalled` / `toolNotCalled` (by tool name), `containsAny` / `containsAll` / `notContains` (whole words, case-insensitive, plurals and dash styles alike), `handoff` (`published`, `none`, `repeat`), `proposal` (with an optional product) and `cartUnchanged`. Every non-handoff case also checks that no handoff happened. A failure in a `safety` case is a safety failure unless that rule sets `safety: false`. Messages can use the placeholders listed in `FIXTURE_KEYS`.

Results on the local model vary by a few cases from run to run, so compare a change over at least two runs.

## Conversation storage

History is stored in Redis as `assistant:conv:{userId}:{conversationId}` for seven days. The user ID in the key keeps conversations private even if an ID is guessed.

History is **append-only**: Claude's turns are stored exactly as returned (plus a handoff correction when one was streamed) and earlier turns are never edited, because current Claude models check replayed history. That is why long conversations are capped (`conversation_full`, "start a new chat") rather than trimmed. If a turn stops right after Claude requested a tool, an error result is appended for it so the stored history stays valid.

## Debugging

- `GET /health` shows whether a key is configured and which model is set.
- Every model call is logged with the correlation ID, stop reason, token usage (including cached input tokens) and tool names. Message text is not logged.
- To work on the agent without spending tokens, use the `openai-compatible` provider with LM Studio, or point the Anthropic SDK at a local stub with `ANTHROPIC_BASE_URL` and any `ANTHROPIC_API_KEY` value.

## Where to read next

- `src/agent/systemPrompt.ts` defines what the assistant does and how it writes.
- `src/agent/tools.ts` and `src/clients/storeClients.ts` define what it can look up.
- `src/agent/runAgent.ts` picks the provider; `src/agent/providers/anthropic.ts` and `openaiCompatible.ts` run one turn and stream it.
- `src/controllers/chatController.ts` handles limits, locking, SSE, errors, feedback and the handoff-claim guard.
- `src/evals/` holds the eval cases, runner, grader and report; `src/analytics/` the usage report.
- The browser side is in the [frontend guide](../frontend/README.md#shopping-assistant).
