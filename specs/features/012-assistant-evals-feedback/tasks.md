# 012 — Assistant: Eval Suite, Answer Feedback and Usage Analytics · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred. Keep `feature.json` in step (same ids, same done state).
Every test task records its break check (break the code, see the test fail, restore; AC-14).
Paths below are relative to `packages/assistant-service/` unless they start with `packages/`, `specs/` or `docs/`.

## Setup

- [x] **T001** — Spike (plan Risks): with the model loaded per `docs/lm-studio-setup.md`, send one streamed
      `POST /v1/chat/completions` to LM Studio with `stream_options: { include_usage: true }`. Record whether a
      final chunk with `usage` (and no `choices`) arrives, and which fields it has (`prompt_tokens`,
      `completion_tokens`, cached tokens?). Decide the mapping to `TokenUsage`, or `null` if absent · files: none
      (record here) · test: recorded output
  - **Result (2026-10-24):** loaded per the doc (one copy, 16k context, 1 slot, 10.6 s). With
    `include_usage` the last chunk before `[DONE]` is
    `{"choices":[],"usage":{"prompt_tokens":22,"completion_tokens":10,"total_tokens":32,"completion_tokens_details":{"reasoning_tokens":0}}}`.
    `choices` is an **empty array** (not absent), so `choices[0]` is undefined and the chunk must be read before
    the `if (!choice) continue`. Without `include_usage` no chunk carries `usage` (0 of N). No cached-token field,
    even on an identical repeated 1,857-token prompt (prompt cache not reported). Mapping (D-025):
    `inputTokens = prompt_tokens − cached`, `cachedInputTokens = prompt_tokens_details?.cached_tokens ?? 0`,
    `outputTokens = completion_tokens`; no usage chunk at all → `usage: null`. Anthropic maps to the same meaning
    (`inputTokens = input_tokens + cache_creation_input_tokens`, `cachedInputTokens = cache_read_input_tokens`),
    so input + cached = the whole prompt for both providers.
- [x] **T002** [P] — Spike (plan §3.3): from the host, with `INTERNAL_SERVICE_TOKEN` from `.env`, check by `curl`:
      - auth `:4001/register` returns the user ID;
      - order `:4004/orders` accepts a `POST` with `x-user-id` and the token, and `GET /orders/:id` shows the
        status leaving `PENDING`;
      - a Laptop ×9999 order ends `CANCELLED` / `OUT_OF_STOCK`;
      - product `:4002` create → visible in `GET /products` (cache) → delete;
      - assistant `:4008/chat` streams with the headers.

      Record anything the runner must handle · files: none (record here) · test: recorded output
  - **Result (2026-10-24):** all five work from the host with a Node `fetch` script (spike kept outside the repo).
    What the runner must handle:
    - **Paths** are under `/api/v1/<service>`: `:4001/api/v1/auth/register`, `:4004/api/v1/orders`,
      `:4002/api/v1/products`, `:4003/api/v1/cart`, `:4008/api/v1/assistant/chat`. Without the token → 401.
    - **Email domain:** auth's Joi `email()` rejects `@example.test` (400 "must be a valid email", TLD check), so
      eval users are `eval-<runId>-<role>@example.com` (plan §3.3 updated). Register → 201
      `{ user: { id, … }, accessToken }`; the user ID is `user.id`.
    - **Orders:** `POST` needs `items[{ productId, name, price, quantity }]` (name and price from
      `GET /products`). Both left `PENDING` fast: Mouse ×1 in 536 ms (ended `CANCELLED` / `PAYMENT_DECLINED`: the
      random payment outcome, so record the real status), Laptop ×9999 in 2,127 ms → `CANCELLED` /
      `OUT_OF_STOCK`. Fields are snake_case (`cancel_reason`, `total_amount`). A wrong `x-user-id` order create
      gave 500, not 400 — the runner must stop if registration failed.
    - **Product:** create 201 (`_id`), visible in the list at once (no cache delay), `DELETE` 200 is a **soft
      delete** (`isActive: false`): gone from the list, but `GET /products/:id` still returns it. Each run leaves
      one inactive lantern in `product_db`; unique names keep runs apart.
    - **Cart:** `GET` with `x-user-id` → `{ userId, items, total, itemCount }` (empty for a new user).
    - **Chat:** 200 `text/event-stream`, `event: <type>` + `data: <json>` frames; a "my latest order" turn called
      `list_orders` (`running` → `done`) and finished in 2.7 s. Today's `done` is
      `{ type, conversationId, stopReason }` (T023 extends it).

## Tests First

- [x] **T010** — Failing tests for the shared analytics events (plan §2): topic names and event types; outcomes and
      ratings lists exactly; a complete interaction and a complete feedback payload round-trip; each missing field
      → `<event>: <field> missing or invalid`; unknown outcome or rating rejected; negative or fractional token
      count rejected; `usage: null` accepted; a non-ISO timestamp rejected · files:
      `packages/shared/src/events.test.ts` · test: fails first
  - **Result (2026-10-24):** 41 tests in `packages/shared/src/events.test.ts` (`assistant analytics events (012)`):
    topics and types, the outcome and rating lists written out, both payloads round-trip, extra fields (`userId`,
    `text`, `comment`) dropped, one rejection per missing field (10 + 4), and 16 bad values (unknown outcome or
    rating, non-UUID IDs, negative or fractional latency and token counts, bad tool lists, non-ISO / impossible /
    offset / numeric timestamps, non-object `usage`). Seen failing first: 38 failed, 65 old passed.
    Break checks (each restored): outcome or rating not checked → 1 fails; fractional counts allowed → 2; UUID not
    checked → 3; tool entries not checked → 1; `usage: null` refused → 1; nested `usage.` prefix dropped → 4;
    ISO round-trip skipped → 2. A first ISO regex was redundant (breaking it failed nothing) and was removed.
- [x] **T011** [P] — Failing provider usage tests (plan §1):
      - Anthropic: two model calls in one turn → `usage` is their sum (input, cache-read, output) and `model` is
        the message's model (extend the stubbed SDK in `anthropic.test.ts`);
      - OpenAI-compatible (new test, `vi.mock('openai')` with a fake streaming `chat.completions.create`): the
        request has `stream_options.include_usage`; a final usage chunk without `choices` is read; usage over two
        calls is summed; no usage chunk → `usage: null`.

      files: `src/agent/providers/anthropic.test.ts`, `src/agent/providers/openaiCompatible.test.ts` · test: fails
      first
  - **Result (2026-10-24):** 7 new tests. `anthropic.test.ts`: the stubbed tool runner now plays back a scripted list
    of model calls (`sdk.calls`; the 5 old tests unchanged and green); single-call usage and model; two calls summed,
    with cache writes counted as input (2,250 / 2,000 / 100). New `openaiCompatible.test.ts` (`vi.mock('openai')`,
    LM Studio-shaped chunks, `config.model` mocked empty): reply and history, `stream_options.include_usage`, the
    `choices: []` usage chunk read, two calls summed with cached split out, no usage chunk → `null`. Seen failing
    first: 6 of the new failed, the old passed. Break checks (each restored): no `include_usage` → 1 fails; usage
    read only with choices → 2; cached not subtracted → 1; no summing → 2; cache writes dropped → 1; total starting
    at zeros → 1.
- [x] **T012** [P] — Failing tests for `TurnObserver` and `buildInteractionEvent`:
      - tool names in call order (from `running` only);
      - outcome precedence (`refused` > `handoff` > `proposal` > `answered`);
      - `rate_limited` → `limited`, and the other error codes → `error`;
      - latency from the injected clock;
      - the payload's keys are exactly the AC-9 fields (no `userId`, no text);
      - the built payload passes `parseAssistantInteraction` (contract, AC-11).

      files: `src/agent/turnObserver.test.ts`, `src/analytics/interactionEvent.test.ts` · test: fails first
  - **Result (2026-10-24):** 21 tests. `agent/turnObserver.test.ts` (14): events forwarded unchanged; tool names from
    `running` only, in order, repeats kept, returned as a copy; outcomes `answered`, `proposal`, `handoff` over
    `proposal`, a repeat handoff is `handoff` (D-026), `refused` over both, `rate_limited` → `limited`, the other
    four codes → `error` over everything; `errorCode`; untracked events. `analytics/interactionEvent.test.ts` (7):
    payload with latency 4,721 ms and `completedAt` from the injected times; keys exactly the AC-9 ten even when the
    input carries `userId` / `text` / `message`; rounding and no negative latency; inputs copied; contract: built
    events (normal and an error turn with `usage: null`) pass `parseAssistantInteraction` unchanged (AC-11). Seen
    failing first (modules missing). Break checks (each restored, each failed ≥ 1): tools from every status; handoff
    below proposal; refusal below handoff; rate limit as `error`; tool list not copied; input spread into the event
    (4 fail); latency not clamped; `completedAt` from the start time.
- [x] **T013** [P] — Failing handoff-tool tests:
      - a first handoff emits `{ type: 'handoff', reference, alreadyRequested: false }` only after the publish
        resolves;
      - a repeat emits `alreadyRequested: true` with the stored reference;
      - a failed publish emits no `handoff`.

      files: `src/agent/handoffTool.test.ts` · test: fails first
  - **Result (2026-10-24):** `agent/handoffTool.test.ts`: the progress test now expects `running` → `handoff` →
    `done`; new: the `handoff` event is not emitted while the publish is pending and is emitted once after it resolves
    (deferred promise); a repeat emits `alreadyRequested: true` with the stored reference; both failed-publish cases
    also assert no `handoff` event. Seen failing first: 3 failed, 11 passed. Break checks (each restored): emit
    before the publish → 4 fail; repeat flagged as new → 1; repeat emits nothing → 1.
- [x] **T014** [P] — Failing publisher tests (plan §5):
      - `publishCapped` caps at the timeout (a never-resolving fake with fake timers);
      - `publishHandoff`'s existing tests stay green on top of it;
      - `publishInteraction` and `publishFeedback` use the right topic, event type and key (`conversationId`);
      - they resolve without throwing when the send rejects or times out, log exactly one `warn` with topic and
        event ID, and call `send` once (no retry).

      files: `src/clients/eventPublisher.test.ts`, `src/clients/analyticsPublisher.test.ts`,
      `src/clients/handoffPublisher.test.ts` · test: fails first
  - **Result (2026-10-24):** 13 new tests; the 7 `handoffPublisher.test.ts` tests unchanged and green on the new
    publisher. `eventPublisher.test.ts` (5): args incl. a given event ID; none given → `publishEvent` makes it; one
    producer for all three topics, connected once, D-021 limits; never-resolving send → rejects at 300 ms with
    "Interaction publish timed out after 300 ms" (fake timers), timer cleared; timer cleared on success.
    `analyticsPublisher.test.ts` (8): interaction and feedback topic / type / key `conversationId` / UUID event ID;
    a new ID per event; no log on success; send rejects or connect fails → resolves, one send at most, one connect,
    one `warn` with exactly `topic`, `eventId`, `error`; never-resolving send → resolves at 5,000 ms (not 4,999)
    with one `warn`. Seen failing first: 13 failed (modules missing). Break checks (each restored): no cap → 5 fail;
    timer not cleared → 1; producer not shared → 2; failure rethrown → 4; one retry → 3; keyed by answer → 2;
    payload in the warning → 3; no event ID → 3.
- [x] **T015** — Failing controller tests (mocked stores, provider and publishers; `res` fake records writes):
      - **chat turn:**
        - `done` carries a UUID `answerId` and `usage`;
        - the saved conversation appends that `answerId`;
        - exactly one `publishInteraction` per finished turn, called after `done` is written and `res.end()`;
        - `rate_limited` publishes one `limited` event;
        - a client-cancelled turn publishes none.
      - **transcript:** `answerId` on the assistant entry after the *k*-th user entry; omitted for a conversation
        without `answerIds`; `ratings` included.
      - **feedback:** 401 without identity; 400 for rating `meh`; 404 for a conversation stored under another
        user; 404 for an unknown `answerId`; 204 for the owner, saving the rating; a second vote replaces it;
        `publishFeedback` once with exactly the AC-10 keys, passing `parseAssistantFeedback`.
      - **delete:** removes the ratings too.

      files: `src/controllers/chatController.test.ts` · test: fails first
  - **Result (2026-10-24):** new `controllers/chatController.test.ts`, 23 tests (mocked runAgent, stores, limiter and
    publishers; a fake `res` records SSE frames). Chat: `done` has a UUID `answerId` and `usage`; `answerIds` appended,
    and padded with `null` for turns saved before 012 (decided here: without padding, a new ID would label an old
    answer); one `publishInteraction` after `done` and `res.end()`, parsed by the shared parser, no user ID or text;
    `rate_limited` → one `limited` event, model not run; provider failure → one `error` event; cancelled turn and 401
    → none. Transcript: answer IDs by turn, incl. a turn with no text; omitted for old or padded turns; `ratings`.
    Feedback: 401; 400 for `meh` / missing / `1`; 404 for another user's conversation and for an unknown answer;
    204 saves; second vote saved over the first; one `publishFeedback` after the 204 with exactly the AC-10 keys;
    204 even if the publish never settles. Delete removes the ratings. Seen failing first: 20 failed; the 3 "publishes
    nothing" guards passed on the old code and are covered by break checks. Break checks (each restored, each
    failed ≥ 1): publish before `res.end()`; no publish on a pre-flight error (2); publish on cancel; no padding;
    emit not observed (3); `done` without `answerId` (4); transcript off by one (3); answer not checked; rating not
    validated (2); feedback published without the 204 (3); feedback awaited; ratings not deleted.
- [x] **T016** [P] — Failing eval tests (plan §3):
      - `sse`: parses split chunks, multi-line `data`, ignores comments;
      - `grader`: a pass and a fail on a recorded turn for every rule kind; text normalisation ("30-day" matches
        "30 days", curly quotes); the implicit `handoff: none` rule added to non-handoff cases and flagged as
        safety; `repeat`; the same recording graded twice → deep-equal results;
      - `report`: rates per category and overall; 45/50 → passed, 44/50 → failed; any safety failure → failed;
        token totals with "not reported"; the flip list against a previous report; Markdown contains every failed
        case ID;
      - `cases` (written as a check on T027): per-category counts ≥ AC-1 minimums, total ≥ 50, unique IDs, every
        `{{placeholder}}` is a known fixture key, all cart and injection cases `safety: true`.

      files: `src/evals/sse.test.ts`, `src/evals/grader.test.ts`, `src/evals/report.test.ts`,
      `src/evals/cases.test.ts` · test: fails first
  - **Result (2026-10-24):** 54 tests in `src/evals/`. `sse.test.ts` (6): whole frames; a two-event stream cut at
    every position; multi-line `data`; comments, data-less frames, CRLF; an unfinished frame kept until `end()`;
    non-JSON data throws. `grader.test.ts` (35): normalisation; 7 terms that must match ("30 days" ↔ "30-day" /
    "30–day", curly apostrophe, markdown, plural) and 5 that must not (`refund`/"refunded", `card`/"cardboard",
    `paypal`/"pay pal", `pal`/"paypal", "30 days"/"130 days"); placeholders (unknown key throws); a pass and a
    fail for every rule kind (`repeat`: same reference, tool-free repeat, new publish, new publish while quoting
    the old one, no earlier handoff); last-turn rules; the implicit `handoff: none` added to non-handoff cases as a
    safety failure; safety cases; failure details, summed time and usage; turn-count mismatch; the same recording
    graded twice → deep-equal. `report.test.ts` (13): rates per category and overall; 45/50 and 90/100 pass, 44/50
    and 89/100 fail; any safety failure (incl. implicit) fails at 49/50; token totals and cases without usage; flips
    only against the same provider and model; Markdown has every failed ID, rule detail, reply, safety tag, meta,
    "5 min 12 s", verdict and tokens or "not reported". Seen failing first (modules missing). **The `cases` test moves
    to T027**: it checks the case file, so written now it would keep `npm run check` red until T027. Break checks
    (each restored): 21 breaks; 18 caught at once, 3 survived (no leading word boundary, `repeat` accepting a new
    publish, an 89% threshold) and got the missing tests above, then all caught; the space/hyphen break (4 fail) was
    applied by hand because Git Bash rewrote the backslashes in the scripted one.
- [x] **T017** [P] — Failing usage-aggregation tests on hand-written events:
      - grouping by UTC day and model;
      - distinct conversations and turns;
      - tool counts by name; handoffs;
      - mean latency and nearest-rank p95 (values written out);
      - token totals, and turns without usage counted separately;
      - ratings joined by `answerId` with the last vote per answer counting.

      files: `src/analytics/usage.test.ts` · test: fails first
  - **Result (2026-10-24):** `analytics/usage.test.ts`, 15 tests, every expected number written out: nearest-rank p95
    for 1, 2, 10, 20 and 21 values (incl. unsorted) and none; grouping by UTC day (23:59:59.999 vs 00:00) and model,
    sorted; distinct conversations vs turns; tool calls by name with repeats; handoff turns incl. a repeat (D-026)
    and an outcome breakdown; mean 1,350 ms (13,501 / 10, rounded) and p95 1,801; token totals with a `usage: null`
    turn counted apart; ratings joined by `answerId` with the latest `ratedAt` winning even when it arrives first;
    ratings without an interaction counted as unmatched; a duplicated interaction counted once; no events. Seen
    failing first (module missing). Break checks (each restored, each failed ≥ 1): p95 off by one; p95 unsorted;
    local-time day; no de-duplication (3); first vote wins; arrival order wins; unmatched ratings not counted;
    conversations = turns; null usage not counted; mean not rounded (2).
- [x] **T018** [P] — Failing frontend reducer tests for `useAssistantChat`'s event reducer:
      - `done` sets `answerId` on the streaming assistant item;
      - a `handoff` event changes no visible state;
      - an optimistic rating is set, and reverted on failure;
      - an error item never gets an `answerId`.

      If the reducer isn't exported yet, export it without changing behaviour · files:
      `packages/frontend/src/hooks/useAssistantChat.test.ts` · test: fails first

  - **Result (2026-10-24):** `packages/frontend/src/hooks/useAssistantChat.test.ts`, 10 tests on exported pure helpers
    (`applyEvent` exported unchanged): `done` sets `answerId`; `handoff` returns the same item; an error item never
    gets an `answerId`; text and errors still fold; `withRating` sets one item and changes a vote; `revertRating`
    restores the previous vote but not when a newer vote replaced the failed one; `itemsFromTranscript` restores
    answer IDs and ratings, and accepts a pre-012 transcript. Seen failing first: 10 failed (not exported). Break
    checks (each restored, each failed 1): `done` ignored; error item rateable; revert always; rating on every item;
    ratings not restored; `handoff` copies the item.
## Core

- [x] **T020** — Shared analytics events: topics, event types, `INTERACTION_OUTCOMES`, `ANSWER_RATINGS`,
      `TokenUsage`, payloads, parsers and the `reader` helpers (`count`, `nullableCount`, `stringList`, `iso`,
      `uuid`) · files: `packages/shared/src/events.ts`, `packages/shared/src/index.ts` (exports) · test: T010
  - **Result (2026-10-24):** `packages/shared/src/events.ts`: topics `assistant.interaction` / `assistant.feedback`,
    types `INTERACTION_COMPLETED` / `ANSWER_RATED`, `INTERACTION_OUTCOMES`, `ANSWER_RATINGS`, `TokenUsage` (D-025),
    both payload interfaces and parsers. `index.ts` already re-exports `events` (no change). Reader helpers: `count`,
    `stringList`, `iso` (must equal `toISOString()` exactly), `uuid`, plus `nullableText` (`stopReason`) and
    `nullableObject` (`usage`, errors named `usage.<field>`) in place of the plan's `nullableCount`, which nothing
    needed. Parsers return only known fields, like the handoff parser. Gate: check 13/13, 278 tests (was 237).
- [x] **T021** — Provider usage: `TurnOutput.usage` and `model`; the Anthropic provider sums per call; the
      OpenAI-compatible provider sends `include_usage` and reads the usage chunk (mapping from T001) · files:
      `src/agent/providers/types.ts`, `anthropic.ts`, `openaiCompatible.ts` · test: T011
  - **Result (2026-10-24):** `TurnOutput` gains `model` and `usage`; `addUsage` in `providers/types.ts` sums per call
    (a `null`-call branch was dead code, found by a break check that changed nothing, and removed). Anthropic sums
    `input_tokens + cache_creation_input_tokens` / `cache_read_input_tokens` / `output_tokens` and returns the last
    message's model; OpenAI-compatible sends `include_usage`, reads the usage chunk before the `choice` check, and
    returns the resolved model (D-025 mapping). `TokenUsage` is imported as a type from shared; inside services it is
    still untyped (`any`, no `.d.ts`, known backlog gap), so the unit tests carry the shape. Gate: check 13/13, 285
    tests (was 278). Live usage is seen in T030/T033 after the rebuild.
- [x] **T022** — `TurnObserver` and `buildInteractionEvent` · files: `src/agent/turnObserver.ts`,
      `src/analytics/interactionEvent.ts` · test: T012
  - **Result (2026-10-24):** `agent/turnObserver.ts` (class with `wrap(emit)`, `tools`, `errorCode`,
    `outcome(stopReason)`) and `analytics/interactionEvent.ts` (`buildInteractionEvent`, explicit fields only, times
    passed in). The observer needs the `handoff` SSE variant, so its type was added to `agent/events.ts` here;
    T023 still adds `done.answerId` / `done.usage`, the frontend mirror and the emit from the handoff tool. Gate:
    check 13/13, 306 tests (was 285).
- [x] **T023** [P] — `handoff` SSE event: the type in `src/agent/events.ts` (and `done.answerId`, `done.usage`),
      mirrored in `packages/frontend/src/types/assistant.ts`; emitted by the handoff tool · files:
      `src/agent/events.ts`, `src/agent/handoffTool.ts`, `packages/frontend/src/types/assistant.ts` · test: T013
  - **Result (2026-10-24):** the handoff tool emits `{ type: 'handoff', reference, alreadyRequested }` after the
    Kafka acknowledgement (or for a repeat found in Redis); the type (added in T022) is mirrored in
    `packages/frontend/src/types/assistant.ts`, and the chat reducer's `default` already ignores it. **Moved to
    T025:** `done.answerId` and `done.usage`, since making them required here would break the controller before it
    generates an answer ID. Gate: check 13/13, 308 tests (was 306).
- [x] **T024** — Publishers: extract `eventPublisher.ts` from `handoffPublisher.ts` (same D-021 limits), add
      `analyticsPublisher.ts` · files: `src/clients/eventPublisher.ts`, `handoffPublisher.ts`,
      `analyticsPublisher.ts` · test: T014
  - **Result (2026-10-24):** `clients/eventPublisher.ts` holds the one lazily connected producer (D-021 limits) and
    `publishCapped({ topic, type, key, data, correlationId, timeoutMs, name, eventId? })` (an options object rather
    than the plan's positional list; `name` keeps the "Handoff publish timed out…" message). `handoffPublisher.ts`
    is now a thin wrapper with the same signature. `analyticsPublisher.ts`: `publishInteraction` /
    `publishFeedback(data, correlationId, log)`, 5 s cap, a `randomUUID` event ID, never reject, one `warn`
    "analytics event dropped". Gate: check 13/13, 321 tests (was 308).
- [x] **T025** — Controller and stores:
      - `answerIds` in `conversationStore`;
      - `feedbackStore` (hash with the conversation's TTL, deleted with the conversation);
      - `postChat` wires the answer ID, the observer, `done` and the interaction publish;
      - `getConversation` returns answer IDs and ratings;
      - new `putFeedback` and its route.

      files: `src/controllers/chatController.ts`, `src/store/conversationStore.ts`, `src/store/feedbackStore.ts`,
      `src/routes/chatRoutes.ts` · test: T015
  - **Result (2026-10-24):** `postChat` wraps `emit` in the `TurnObserver`, makes an `answerId` per turn, saves
    `answerIds` (null-padded), sends `done` with `answerId` and `usage` (moved here from T023; mirrored in the
    frontend types), and fires `publishInteraction` after `res.end()` and after every pre-flight error. Latency
    is measured from just before `runAgentTurn` (pre-flight errors: from the request). `getConversation` returns
    answer IDs and `ratings`; new `putFeedback` and `PUT /conversations/:id/answers/:answerId/feedback` (the
    gateway's `app.use` forwards PUT with `requireAuth`); `deleteConversation` also deletes the ratings. New
    `store/feedbackStore.ts` (hash, last vote wins, conversation TTL). Gate: check 13/13, 344 tests (was 321).
    Live smoke after rebuilding assistant-service: a turn → `done` with `answerId` and usage 4,850 / 0 / 61
    (LM Studio); ratings 204 / 204, `meh` 400, other user 404, unknown answer 404; transcript carries the answer ID
    and `ratings: { …: "down" }`. **Found:** on a Kafka where the analytics topics don't exist yet, the first
    publish auto-creates the topic but the single attempt (D-021) fails ("This server does not host this
    topic-partition"), so the first event per topic is dropped with one warning; the next run dropped 0 (end offsets
    interaction 1, feedback 2 = that run's events). **Fixed (D-027, chosen by RVicky172):** new
    `clients/analyticsTopics.ts` creates both topics at startup in the background (backoff 1 s → 30 s, never
    rejects), called from `index.ts`; 3 tests, 4 break checks (no retry → 2 fail; no 30 s cap → 1; one topic only → 1;
    client creation outside the try → 1). Live: deleted the two topics, rebuilt → "Analytics topics ready"; a turn and
    two ratings → 0 dropped, end offsets interaction 1, feedback 2. Gate: check 13/13, 347 tests.
- [x] **T026** [P] — Eval core: `sse.ts`, `grader.ts`, `report.ts` (incl. `toMarkdown`); `tsconfig.build.json`
      excludes `src/evals/**`; `eval-reports/` added to `.gitignore` · files: `src/evals/sse.ts`,
      `src/evals/grader.ts`, `src/evals/report.ts`, `tsconfig.build.json`, `.gitignore` · test: T016 (sse, grader,
      report)
  - **Result (2026-10-24):** `src/evals/types.ts` (rules, cases, `TurnRecord`, `CaseResult`, `Report`,
    `EVAL_CATEGORIES`), `sse.ts` (`SseParser` with `push` / `end`), `grader.ts` (`normaliseText`, `matchesTerm`,
    `fillPlaceholders`, `grade`; matching rules D-028), `report.ts` (`summarise` with an integer 90% check and
    flips, `toMarkdown`). `tsconfig.build.json` excludes `src/evals/**` (`tsc --listFilesOnly`: 0 eval files);
    `.gitignore` adds `packages/assistant-service/eval-reports/`. Gate: check 13/13, 401 tests (was 347).
- [ ] **T027** — The 50 cases, written out per AC-1:
      - 10 product discovery (the 7 from 011 T035 and "Do you have a keyboard?");
      - 5 details and stock;
      - 6 orders, incl. the cancelled reason and another user's order;
      - 5 cart;
      - 10 policy (P1–P10 with their facts as `containsAll` / `containsAny` terms);
      - 3 uncovered (U1–U3: "don't cover" or "not sure", plus an offer of a person, plus `notContains` for an
        invented yes or no);
      - 5 handoff (the 4 first asks from T034/T035, plus a repeat);
      - 3 injection (2 in chat, 1 through the lantern product's text);
      - 3 off-topic.

      Each case's rules are reviewed by the user before T030 · files: `src/evals/cases.ts` · test: T016 (cases) +
      review
- [x] **T028** [P] — Usage aggregation and report CLI. The CLI uses a fresh consumer group with `fromBeginning`,
      reads up to the high-water marks taken at start, parses with the shared parsers, counts and skips bad
      records, and prints the table. Add the root `assistant:usage` script (`docker compose exec …`) · files:
      `src/analytics/usage.ts`, `src/analytics/usageReport.ts`, root `package.json` · test: T017 (live in T033)
  - **Result (2026-10-24):** `analytics/usage.ts` (`aggregateUsage` → rows + `unmatchedRatings`; `nearestRankP95`;
    interactions de-duplicated by `answerId`; latest vote per answer by `ratedAt`) and `analytics/usageReport.ts`
    (admin `fetchTopicOffsets` at start, fresh group `fromBeginning`, stops when every partition reaches its mark,
    60 s safety cap, shared parsers, bad records counted, plain-text table plus tool and outcome lines). Root script
    `assistant:usage`. **Fixed during the live run:** the container's working directory is the repo root (`/app`), so
    the path is `packages/assistant-service/dist/analytics/usageReport.js` (plan §6 updated; the plan's `dist/…` gave
    MODULE_NOT_FOUND). Live after rebuilding: ended by itself in 3.7 s; 2 conversations, 2 turns (`search_products`
    1, `get_cart` 1), mean 2,508 / p95 2,601 ms, tokens 9,738 / 0 / 130, 0 up / 1 down (the smoke answer's up → down).
    The exact check against a script is T033. Gate: check 13/13, 416 tests (was 401).
- [x] **T029** [P] — Feedback UI:
      - `FeedbackButtons.tsx` (two `aria-pressed` buttons labelled "Helpful" and "Not helpful", keyboard
        operable);
      - shown in `AssistantMessage.tsx` only for finished items with an `answerId` and no error;
      - `rateAnswer()` in `assistantApi.ts`;
      - the transcript mapping (`answerId`, `ratings`) in `fetchConversation`;
      - the reducer changes.

      files: `packages/frontend/src/components/assistant/FeedbackButtons.tsx`, `AssistantMessage.tsx`,
      `packages/frontend/src/api/assistantApi.ts`, `packages/frontend/src/hooks/useAssistantChat.ts` · test: T018
      (manual in T031)

  - **Result (2026-10-24):** `FeedbackButtons.tsx` (two native buttons in a labelled group, `aria-label` "Helpful" /
    "Not helpful", `aria-pressed`), shown by `AssistantMessage` only when the item has an `answerId` (set by `done`,
    so never while streaming) and no error; `rate()` in the hook (optimistic, reverts on failure, no call for the
    same vote); `rateAnswer()` in `assistantApi.ts` via the Axios client (bearer and 401 refresh); `fetchConversation`
    returns the transcript with `ratings`; styles in `styles.css`. Gate was red for a while from the shared `.d.ts`
    change, fixed by D-029; now check 13/13, 426 tests. Browser check is T031.
## Integration

- [ ] **T030** — Eval runner `src/evals/run.ts` (plan §3.3):
      - steps: `.env` → health checks → per-run users → orders (wait out of `PENDING`, ≤ 60 s) → lantern product →
        cases one by one (new conversation each, direct `:4008` with headers) → cart snapshots for `cartUnchanged`
        → grade → report files → delete the lantern in `finally` → exit code;
      - scripts: `eval` in the assistant package and the root.

      First full run on the configured model, recording: duration (≤ 30 min, spec NFR), the report path, the pass
      rate, the exit code, and that no fixture was written outside the services' APIs. Also confirm that
      `npm run check` does not run it (AC-6) · files: `src/evals/run.ts`, `package.json` (both) · test: recorded
      run (AC-2, AC-4)
- [ ] **T031** — Rebuild and check in the real app:
      - `docker compose up -d --build assistant-service frontend`; `/health` healthy;
      - in the storefront (hard reload): rate an answer up, change it to down, reload the page and see it kept;
        no buttons while streaming or on an error message; Tab / Enter / Space work; the screen-reader labels are
        present.

      files: none · test: manual measurement (AC-7, AC-15)
- [ ] **T032** — Kafka stopped (`docker compose stop kafka`):
      - 3 chat turns finish, with turn times recorded and compared with Kafka up;
      - 1 rating is saved (204, still there after a reload);
      - the assistant logs exactly one `warn` per dropped event;
      - start Kafka again: no late delivery of those events (check the topic offsets before and after).

      files: none · test: manual measurement (AC-12)
- [ ] **T033** — Usage report live: in fresh conversations as one user, 10 scripted turns (incl. ≥ 1 tool call,
      1 proposal, 1 handoff) and 3 ratings (2 up, 1 down, one of them changed once). Then run
      `npm run assistant:usage`; every count matches the script exactly. The topic holds only these events, or the
      report is compared as a delta against a run just before · files: none · test: manual measurement (AC-13)
- [ ] **T034** — AC-5: 2 consecutive full eval runs on `qwen/qwen3-30b-a3b-2507`, each ≥ 90% overall and 100%
      safety. Record both summaries (pass rates per category, failed cases with the failing rule, flip list,
      duration, tokens). If a run misses: stop and bring the failures to the user. Prompt or code changes need the
      user's call and are test-first; then 2 new consecutive runs · files: possibly `src/agent/systemPrompt.ts`
      (+ test), only with the user's agreement · test: recorded runs (AC-5)
- [ ] **T035** [P] — Docs (plan §7):
      - `docs/ai-shopping-assistant.md` (Phase 4 status: built / still open);
      - the assistant README (eval and usage report how-to, case and rule format, feedback route);
      - `specs/testing-strategy.md` (an "Assistant evals" layer);
      - `README.md` (event flow, API reference).

      files: as listed · test: review (AC-15)

## Verify

- [ ] **T090** — Update `specs/architecture.md`: event table rows for `assistant.interaction` and
      `assistant.feedback`, the assistant routes and SSE events, and the eval runner's direct-call note (D-024).
- [ ] **T091** — Every Definition-of-Done gate green (`specs/constitution.md`): `npm run check`, `npm run build`,
      the rebuilt services healthy; record the numbers (test count).
- [ ] **T092** — Tick the ACs in `spec.md` and `feature.json` (Status `Implemented`), update `roadmap.md` and
      `roadmap.json` (and Phase 1's exit status), `memory/progress.md` and `memory/MEMORY.md`.

## AC coverage

| AC    | Tasks                                    |
| ----- | ---------------------------------------- |
| AC-1  | T016, T027                               |
| AC-2  | T002, T030                               |
| AC-3  | T016, T026                               |
| AC-4  | T016, T026, T030                         |
| AC-5  | T034                                     |
| AC-6  | T016, T026, T030, T091                   |
| AC-7  | T018, T029, T031                         |
| AC-8  | T015, T025                               |
| AC-9  | T010, T011, T012, T015, T020–T022, T025  |
| AC-10 | T015, T025                               |
| AC-11 | T010, T012, T015, T020, T022             |
| AC-12 | T014, T015, T024, T025, T032             |
| AC-13 | T017, T028, T033                         |
| AC-14 | T010–T018 (break checks recorded)        |
| AC-15 | T031, T035, T090                         |
