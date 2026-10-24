# 012 — Assistant: Eval Suite, Answer Feedback and Usage Analytics · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred. Keep `feature.json` in step (same ids, same done state).
Every test task records its break check (break the code, see the test fail, restore; AC-14).
Paths below are relative to `packages/assistant-service/` unless they start with `packages/`, `specs/` or `docs/`.

## Setup

- [ ] **T001** — Spike (plan Risks): with the model loaded per `docs/lm-studio-setup.md`, send one streamed
      `POST /v1/chat/completions` to LM Studio with `stream_options: { include_usage: true }`. Record whether a
      final chunk with `usage` (and no `choices`) arrives, and which fields it has (`prompt_tokens`,
      `completion_tokens`, cached tokens?). Decide the mapping to `TokenUsage`, or `null` if absent · files: none
      (record here) · test: recorded output
- [ ] **T002** [P] — Spike (plan §3.3): from the host, with `INTERNAL_SERVICE_TOKEN` from `.env`, check by `curl`:
      - auth `:4001/register` returns the user ID;
      - order `:4004/orders` accepts a `POST` with `x-user-id` and the token, and `GET /orders/:id` shows the
        status leaving `PENDING`;
      - a Laptop ×9999 order ends `CANCELLED` / `OUT_OF_STOCK`;
      - product `:4002` create → visible in `GET /products` (cache) → delete;
      - assistant `:4008/chat` streams with the headers.

      Record anything the runner must handle · files: none (record here) · test: recorded output

## Tests First

- [ ] **T010** — Failing tests for the shared analytics events (plan §2): topic names and event types; outcomes and
      ratings lists exactly; a complete interaction and a complete feedback payload round-trip; each missing field
      → `<event>: <field> missing or invalid`; unknown outcome or rating rejected; negative or fractional token
      count rejected; `usage: null` accepted; a non-ISO timestamp rejected · files:
      `packages/shared/src/events.test.ts` · test: fails first
- [ ] **T011** [P] — Failing provider usage tests (plan §1):
      - Anthropic: two model calls in one turn → `usage` is their sum (input, cache-read, output) and `model` is
        the message's model (extend the stubbed SDK in `anthropic.test.ts`);
      - OpenAI-compatible (new test, `vi.mock('openai')` with a fake streaming `chat.completions.create`): the
        request has `stream_options.include_usage`; a final usage chunk without `choices` is read; usage over two
        calls is summed; no usage chunk → `usage: null`.

      files: `src/agent/providers/anthropic.test.ts`, `src/agent/providers/openaiCompatible.test.ts` · test: fails
      first
- [ ] **T012** [P] — Failing tests for `TurnObserver` and `buildInteractionEvent`:
      - tool names in call order (from `running` only);
      - outcome precedence (`refused` > `handoff` > `proposal` > `answered`);
      - `rate_limited` → `limited`, and the other error codes → `error`;
      - latency from the injected clock;
      - the payload's keys are exactly the AC-9 fields (no `userId`, no text);
      - the built payload passes `parseAssistantInteraction` (contract, AC-11).

      files: `src/agent/turnObserver.test.ts`, `src/analytics/interactionEvent.test.ts` · test: fails first
- [ ] **T013** [P] — Failing handoff-tool tests:
      - a first handoff emits `{ type: 'handoff', reference, alreadyRequested: false }` only after the publish
        resolves;
      - a repeat emits `alreadyRequested: true` with the stored reference;
      - a failed publish emits no `handoff`.

      files: `src/agent/handoffTool.test.ts` · test: fails first
- [ ] **T014** [P] — Failing publisher tests (plan §5):
      - `publishCapped` caps at the timeout (a never-resolving fake with fake timers);
      - `publishHandoff`'s existing tests stay green on top of it;
      - `publishInteraction` and `publishFeedback` use the right topic, event type and key (`conversationId`);
      - they resolve without throwing when the send rejects or times out, log exactly one `warn` with topic and
        event ID, and call `send` once (no retry).

      files: `src/clients/eventPublisher.test.ts`, `src/clients/analyticsPublisher.test.ts`,
      `src/clients/handoffPublisher.test.ts` · test: fails first
- [ ] **T015** — Failing controller tests (mocked stores, provider and publishers; `res` fake records writes):
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
- [ ] **T016** [P] — Failing eval tests (plan §3):
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
- [ ] **T017** [P] — Failing usage-aggregation tests on hand-written events:
      - grouping by UTC day and model;
      - distinct conversations and turns;
      - tool counts by name; handoffs;
      - mean latency and nearest-rank p95 (values written out);
      - token totals, and turns without usage counted separately;
      - ratings joined by `answerId` with the last vote per answer counting.

      files: `src/analytics/usage.test.ts` · test: fails first
- [ ] **T018** [P] — Failing frontend reducer tests for `useAssistantChat`'s event reducer:
      - `done` sets `answerId` on the streaming assistant item;
      - a `handoff` event changes no visible state;
      - an optimistic rating is set, and reverted on failure;
      - an error item never gets an `answerId`.

      If the reducer isn't exported yet, export it without changing behaviour · files:
      `packages/frontend/src/hooks/useAssistantChat.test.ts` · test: fails first

## Core

- [ ] **T020** — Shared analytics events: topics, event types, `INTERACTION_OUTCOMES`, `ANSWER_RATINGS`,
      `TokenUsage`, payloads, parsers and the `reader` helpers (`count`, `nullableCount`, `stringList`, `iso`,
      `uuid`) · files: `packages/shared/src/events.ts`, `packages/shared/src/index.ts` (exports) · test: T010
- [ ] **T021** — Provider usage: `TurnOutput.usage` and `model`; the Anthropic provider sums per call; the
      OpenAI-compatible provider sends `include_usage` and reads the usage chunk (mapping from T001) · files:
      `src/agent/providers/types.ts`, `anthropic.ts`, `openaiCompatible.ts` · test: T011
- [ ] **T022** — `TurnObserver` and `buildInteractionEvent` · files: `src/agent/turnObserver.ts`,
      `src/analytics/interactionEvent.ts` · test: T012
- [ ] **T023** [P] — `handoff` SSE event: the type in `src/agent/events.ts` (and `done.answerId`, `done.usage`),
      mirrored in `packages/frontend/src/types/assistant.ts`; emitted by the handoff tool · files:
      `src/agent/events.ts`, `src/agent/handoffTool.ts`, `packages/frontend/src/types/assistant.ts` · test: T013
- [ ] **T024** — Publishers: extract `eventPublisher.ts` from `handoffPublisher.ts` (same D-021 limits), add
      `analyticsPublisher.ts` · files: `src/clients/eventPublisher.ts`, `handoffPublisher.ts`,
      `analyticsPublisher.ts` · test: T014
- [ ] **T025** — Controller and stores:
      - `answerIds` in `conversationStore`;
      - `feedbackStore` (hash with the conversation's TTL, deleted with the conversation);
      - `postChat` wires the answer ID, the observer, `done` and the interaction publish;
      - `getConversation` returns answer IDs and ratings;
      - new `putFeedback` and its route.

      files: `src/controllers/chatController.ts`, `src/store/conversationStore.ts`, `src/store/feedbackStore.ts`,
      `src/routes/chatRoutes.ts` · test: T015
- [ ] **T026** [P] — Eval core: `sse.ts`, `grader.ts`, `report.ts` (incl. `toMarkdown`); `tsconfig.build.json`
      excludes `src/evals/**`; `eval-reports/` added to `.gitignore` · files: `src/evals/sse.ts`,
      `src/evals/grader.ts`, `src/evals/report.ts`, `tsconfig.build.json`, `.gitignore` · test: T016 (sse, grader,
      report)
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
- [ ] **T028** [P] — Usage aggregation and report CLI. The CLI uses a fresh consumer group with `fromBeginning`,
      reads up to the high-water marks taken at start, parses with the shared parsers, counts and skips bad
      records, and prints the table. Add the root `assistant:usage` script (`docker compose exec …`) · files:
      `src/analytics/usage.ts`, `src/analytics/usageReport.ts`, root `package.json` · test: T017 (live in T033)
- [ ] **T029** [P] — Feedback UI:
      - `FeedbackButtons.tsx` (two `aria-pressed` buttons labelled "Helpful" and "Not helpful", keyboard
        operable);
      - shown in `AssistantMessage.tsx` only for finished items with an `answerId` and no error;
      - `rateAnswer()` in `assistantApi.ts`;
      - the transcript mapping (`answerId`, `ratings`) in `fetchConversation`;
      - the reducer changes.

      files: `packages/frontend/src/components/assistant/FeedbackButtons.tsx`, `AssistantMessage.tsx`,
      `packages/frontend/src/api/assistantApi.ts`, `packages/frontend/src/hooks/useAssistantChat.ts` · test: T018
      (manual in T031)

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
