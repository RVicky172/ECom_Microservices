# 011 — Assistant: Store Policies and Human Handoff · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved -->

## Approach

**§1 One policy document, built into the cached system prompt (AC-1, AC-2, AC-3).**

- **The document:** `packages/assistant-service/policies/store-policies.md`, a short Markdown file with one
  section per topic (Returns, Shipping, Warranty, Payment, Cancellation and refunds). It holds the D-016 terms and
  a note that they are sample content. It sits in the assistant package, so the existing Dockerfile
  (`COPY packages/assistant-service/`) ships it with no change.
- **Loading:** `src/agent/policies.ts` reads the file once at startup (`loadPolicies()`, path resolved from
  `__dirname`, so it works from `src/` under ts-node and from `dist/` alike). A missing or empty file stops the
  service at startup with a clear error (point to decide 2).
- **The prompt:** `systemPrompt.ts` keeps the existing text and gains a policy part. `SYSTEM_PROMPT =
  buildSystemPrompt(policies)` adds:
  - **"Store policies"**, containing the document verbatim;
  - **rules:** answer policy questions only from that section, using its exact terms; if it doesn't cover the
    question, say so and offer to connect the customer with a person; never state a policy that isn't there;
  - **handoff rules:** use `request_human_handoff` only when the customer asks for a person or says yes to the
    offer, never on your own; one request per conversation, so if asked again, give the same reference.

  The prompt is still built once per process, so Claude's prompt caching keeps working, and the OpenAI-compatible
  provider gets the same text.
- **Editing:** changing the document and restarting the service changes the answers, with no code change.

**§2 The handoff event, defined once in shared (AC-9, AC-10).** `packages/shared/src/events.ts` gains:

- topic `KafkaTopics.ASSISTANT_HANDOFF_REQUESTED = 'assistant.handoff_requested'`, and event type
  `EventTypes.HANDOFF_REQUESTED`;
- `HandoffReason`: `customer_request | policy_not_covered | order_problem | other`;
- `HandoffRequestedData`: `{ reference, userId, conversationId, reason, summary, requestedAt }`;
- `parseHandoffRequested(data)`, which rejects missing fields, unknown reasons and a summary over 500 characters,
  like the 010 parsers.

The event uses the standard envelope and the shared `publishEvent` (010).

**§3 The handoff tool (AC-4, AC-6, AC-7, AC-8).** A new `request_human_handoff` tool, in `src/agent/handoffTool.ts`
(added to `buildTools`):

- **Input:** `{ reason: HandoffReason, summary: string (1–500 chars) }`. No user or conversation ID: both come from
  `RequestContext`, which gains `conversationId` (set by `chatController`, like `userId`).
- **Run:**
  1. **Already requested?** If this conversation already has a handoff (Redis
     `assistant:handoff:{userId}:{conversationId}`), return `{ already_requested: true, reference }` and publish
     nothing (Q5).
  2. **New request:** create reference `HO-` + 8 uppercase hex characters, and publish
     `assistant.handoff_requested` with `userId`/`conversationId` from the context.
  3. **Publishing is capped at 5 s.** On failure or timeout, throw
     `ToolFailure('Support could not be reached right now…')`: the model tells the customer to try later, and
     nothing is stored, so a later try can succeed (AC-8).
  4. **Record it:** on success, store the reference with the conversation's TTL (7 days), then return
     `{ handoff_requested: true, reference }`.
- One turn at a time per conversation is already enforced by the existing turn lock, so there is no race between
  steps 1 and 4.

**§4 Assistant Kafka producer.** `src/clients/handoffPublisher.ts` uses shared `createKafkaClient` and
`createProducer` and connects lazily on the first handoff, the 010 pattern. The assistant still starts and chats
without Kafka; only a handoff needs it. No new dependency: `kafkajs` comes through `@ecommerce/shared`. The
assistant's compose entry gains no hard dependency on Kafka.

**§5 Notification handles the handoff (AC-5, AC-6).**

- The notification consumer (already on `startSagaConsumer`, 010) adds `assistant.handoff_requested` to its
  topics.
- New `sendSupportHandoffEmail(data)` logs one line:
  `[EMAIL SENT] To support: handoff HO-… from user … (conversation …), reason …: <summary>`.
- The existing in-memory event-ID dedupe makes a redelivered event log once.
- The `onMessage` body moves into an exported `handleNotificationEvent` so it can be unit-tested.

**§6 Storefront label (small).** `useAssistantChat`'s tool label map gains
`request_human_handoff: 'Contacting support…'` (point to decide 4). There is no other frontend change: the
reference comes back in the assistant's text.

**§7 Docs (AC-13).**

- `docs/ai-shopping-assistant.md`: Phase 3 marked shipped; open question 3 answered; implementation note on the
  policy file.
- Assistant README: policies, the handoff tool, privacy.
- Notification README: the handoff notification.
- `specs/architecture.md`: event table row for `assistant.handoff_requested`.
- `README.md`: event flow.
- `specs/testing-strategy.md`: the provider stub pattern.

## Files

| File | Change | Purpose |
| ---- | ------ | ------- |
| `packages/assistant-service/policies/store-policies.md` | new | The policy document (D-016 terms) |
| `packages/assistant-service/src/agent/policies.ts` (+ `.test.ts`) | new | `loadPolicies` (§1) |
| `packages/assistant-service/src/agent/systemPrompt.ts` (+ `.test.ts`) | modify | `buildSystemPrompt(policies)`: policy section and rules (§1) |
| `packages/shared/src/events.ts`, `events.test.ts` | modify | Topic, type, `HandoffRequestedData`, `parseHandoffRequested` (§2) |
| `packages/assistant-service/src/context.ts` | modify | `conversationId` on `RequestContext` |
| `packages/assistant-service/src/controllers/chatController.ts` | modify | Put `conversationId` into the context |
| `packages/assistant-service/src/agent/handoffTool.ts` (+ `.test.ts`) | new | `request_human_handoff` (§3) |
| `packages/assistant-service/src/agent/tools.ts` | modify | Add the tool to `buildTools` |
| `packages/assistant-service/src/store/handoffStore.ts` | new | Redis get/set of a conversation's reference |
| `packages/assistant-service/src/clients/handoffPublisher.ts` | new | Lazy producer + 5 s publish cap (§4) |
| `packages/assistant-service/src/agent/providers/anthropic.test.ts` | new | Stubbed Claude: the request carries the policy prompt and the handoff tool (AC-11) |
| `packages/notification-service/src/events/consumer.ts` (+ `.test.ts`), `services/notificationService.ts` | modify | Handoff topic, `handleNotificationEvent`, `sendSupportHandoffEmail` (§5) |
| `packages/frontend/src/hooks/useAssistantChat.ts` | modify | Tool label (§6) |
| `docs/ai-shopping-assistant.md`, assistant and notification READMEs, `specs/architecture.md`, `README.md`, `specs/testing-strategy.md` | modify | AC-13 (§7) |

## Data Structures & Interfaces

```ts
// packages/shared/src/events.ts
export enum KafkaTopics { /* … */ ASSISTANT_HANDOFF_REQUESTED = 'assistant.handoff_requested' }
export enum EventTypes { /* … */ HANDOFF_REQUESTED = 'HANDOFF_REQUESTED' }
export const HANDOFF_REASONS = ['customer_request', 'policy_not_covered', 'order_problem', 'other'] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];
export const MAX_HANDOFF_SUMMARY = 500;
export interface HandoffRequestedData {
  reference: string;        // "HO-1A2B3C4D"
  userId: string;           // from the gateway-verified identity
  conversationId: string;
  reason: HandoffReason;
  summary: string;          // 1–500 chars, written by the assistant; never the transcript
  requestedAt: string;      // ISO timestamp
}
export const parseHandoffRequested: (data: unknown) => HandoffRequestedData;

// packages/assistant-service/src/context.ts
export interface RequestContext { userId: string; correlationId: string; conversationId: string }

// packages/assistant-service/src/agent/policies.ts
export const loadPolicies: (path?: string) => string;   // throws on a missing or empty file

// packages/assistant-service/src/agent/systemPrompt.ts
export const buildSystemPrompt: (policies: string) => string;
export const SYSTEM_PROMPT: string;                     // buildSystemPrompt(loadPolicies()), once per process

// packages/assistant-service/src/clients/handoffPublisher.ts
export const publishHandoff: (data: HandoffRequestedData, correlationId: string, timeoutMs?: number) => Promise<void>;

// packages/assistant-service/src/store/handoffStore.ts
export const getHandoffReference: (userId: string, conversationId: string) => Promise<string | null>;
export const saveHandoffReference: (userId: string, conversationId: string, reference: string) => Promise<void>;
```

## Techniques

- **Unit tests with no Kafka, Redis or model:** `vi.mock` the handoff store, the publisher and the shared
  `publishEvent`, as in 002/010. `vi.hoisted` holds the fakes' state, and there is no top-level `await`.
- **Contract (AC-10):** the handoff tool test captures the published `data` and runs it through
  `parseHandoffRequested`. The notification handler test feeds a parsed event to the handler.
- **AC-9:** the test checks that the payload has exactly the six keys, with a summary of at most 500 characters.
  A schema test checks that a 501-character summary is rejected before anything is published.
- **AC-7:** the tool is built with a context for user A. Even if the model's input contains another user ID, the
  published `userId` is A's, because the schema has no such field and extra keys are dropped.
- **Stubbed Claude (AC-11):** `vi.mock('@anthropic-ai/sdk')` captures the request the Anthropic provider builds,
  then checks that `system` contains the policy text with `cache_control` and that `tools` includes
  `request_human_handoff`. No sockets, no credits (testing-strategy rule 5). If the provider's tool-runner wiring
  makes this impractical, the T001 spike decides the fallback: test the provider's tool and prompt mapping
  function directly.
- **Live measurements (AC-2–AC-6, AC-8):** a scratchpad script posts chat messages and reads the SSE stream.
  1. It calls the assistant directly on :4008 with `x-user-id` and the internal token, as the gateway would. That
     avoids the gateway's 100-requests-per-15-minutes limit.
  2. The assistant's own per-user limit is 30 messages an hour, so the runs are spread over users A and B.
  3. It records each answer verbatim in tasks.md, then grades it against the expected facts written down before
     the run.
  4. Handoff events are checked in the Kafka topic (`kafka-console-consumer.sh`) and in the notification log.

## Test Approach

| AC | Test / measurement | Type |
| -- | ------------------ | ---- |
| AC-1 | `policies.test.ts` (reads the five sections; missing or empty file throws); `systemPrompt.test.ts` (document included verbatim, plus the grounding rule); live: change one term (e.g. 30 → 45 days), restart, ask, see 45, then restore | unit + manual |
| AC-2 | Script: 10 policy questions with expected facts written in tasks.md first; answers recorded and graded; target ≥ 9/10, 0 contradictions | manual measurement |
| AC-3 | Script: 3 uncovered questions; each answer says it isn't covered and offers a person; 0 invented terms; and no handoff event unless the customer agrees | manual measurement |
| AC-4 | `handoffTool.test.ts` (one publish, reference format, payload fields); live: "I want to talk to a person" → reference in the reply and exactly 1 message on the topic | unit + manual |
| AC-5 | Live: notification log line with the same reference, ≤ 5 s after the request (timestamps) | manual measurement |
| AC-6 | `handoffTool.test.ts` (second call → same reference, no publish); `consumer.test.ts` (same event ID twice → one log); live: ask again (same reference), replay the Kafka message (one log line) | unit + manual measurement |
| AC-7 | `handoffTool.test.ts` (`userId` and `conversationId` always from the context) | unit |
| AC-8 | `handoffTool.test.ts` (publish rejects or exceeds 5 s → `ToolFailure`, nothing stored); live: stop Kafka, ask for a person; the reply says try later; the next question is still answered; start Kafka | unit + manual measurement |
| AC-9 | `handoffTool.test.ts` + `events.test.ts` (exact keys, 500-character cap, 501 rejected) | unit |
| AC-10 | `events.test.ts` (parser); contract checks in the tool and notification tests | unit |
| AC-11 | `anthropic.test.ts` (stubbed SDK); the live runs above use the OpenAI-compatible provider | unit + manual |
| AC-12 | All unit tests run without Kafka, Redis or a model; break/restore results recorded per test file | unit + manual measurement |
| AC-13 | `docker compose up -d --build --wait assistant-service notification-service` (+ every `/health`); docs reviewed | manual review |

## Risks & Mitigations

- **Mocking the Anthropic SDK may not fit the provider's tool runner** (`betaZodTool`, streaming). Mitigation: T001
  is a short spike that tries it. The fallback is to test the exported mapping (system prompt and tool list) without
  the SDK, and to note in AC-11 that Claude is checked only at that level until credits exist.
- **A local model may ignore the "only when asked" rule** and hand off unasked, or invent policy terms. Mitigation:
  AC-2 and AC-3 measure it. If the bar is missed, tune the prompt wording (no code change), then measure again and
  record each attempt. If it still fails, stop and report rather than lower the bar.
- **Rate limits during measurement:** the assistant allows 30 messages per user per hour. About 13 policy
  questions plus about 6 handoff checks fit when spread over two users. The gateway is bypassed with the internal
  token (as the gateway itself does).
- **Kafka producer retries can stall a turn** (KafkaJS retries for tens of seconds). Mitigation: the 5 s cap on
  publishing (§3), tested with a never-resolving fake.
- **Policy text makes every request longer.** About 300 words; cached for Claude; for the local model it adds a
  little latency per turn. Accepted (design doc §4.6).
- **Prompt changes can shift behaviour of the existing tools** (cart, orders). Mitigation: T032's live run also asks
  one product question and one order question, and checks they still work.

## Points to decide (approved 2026-10-23 as recommended, D-017)

1. **Where the policy file lives:** `packages/assistant-service/policies/store-policies.md` (recommended: it ships
   in the existing image with no Dockerfile change) or `docs/store-policies.md` (more visible, but needs a
   Dockerfile change).
2. **Missing or empty policy file:** the assistant refuses to start (recommended: loud, and the file is in git),
   or it starts and answers "no policies available".
3. **Claude coverage:** a stubbed-SDK unit test, with the spike fallback described above (recommended), or the
   OpenAI-compatible live runs only.
4. **The "Contacting support…" label** in the chat widget: include (recommended; one line) or leave the generic
   label.

## Constitution Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Spec before code | ✅ | Spec approved 2026-10-23 (D-016); plan approved 2026-10-23 (D-017) |
| II. Test-gated delivery | ✅ | Tool, store, parser, prompt builder and notification handler unit-tested first, each proven to fail; no fixed sleeps (the publish cap is tested with a fake that never resolves; SSE reads wait on `done`) |
| III. Small dependencies | ✅ | None new: `kafkajs` via shared, Redis and Zod already used |
| IV. Memory maintained | ✅ | D-016 logged; plan decisions and gotchas logged as they come |
| V. Database per service | ✅ | The handoff travels only as a shared-defined Kafka event; notification reads no assistant Redis keys; the assistant writes only its `assistant:` keys |
