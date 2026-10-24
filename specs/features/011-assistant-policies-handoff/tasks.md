# 011 — Assistant: Store Policies and Human Handoff · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred. Keep `feature.json` in step (same ids, same done state).

## Setup

- [x] **T001** — Spike (plan Risks): in a throwaway test, `vi.mock('@anthropic-ai/sdk')` and run the Anthropic
      provider's `runTurn` once with a stub that returns a final text message. Confirm the captured request exposes
      `system` (with `cache_control`) and `tools`. Decide: stubbed-SDK test (plan) or mapping-only fallback. Record
      the decision · files: scratch test (removed or kept as T015) · test: the spike runs under `npm test`
      **Result (2026-10-23):** the stubbed SDK works; decision: stubbed-SDK test (plan), no fallback needed (D-018).
      `vi.mock('@anthropic-ai/sdk')` replaces only the default `Anthropic` class; its `beta.messages.toolRunner`
      captures the params and returns a fake runner (async-iterable of one stream, `done()`, `params`). The real
      `betaZodTool` (separate import path) still builds the tools, so the captured `tools[].input_schema` is the
      real JSON Schema. Kept as `src/agent/providers/anthropic.test.ts`, 3 tests (cached `system` block; tool names
      and schema; streamed text + returned history), the assistant service's first tests; T015 extends it.
      Break check: removing `cache_control` from the provider → the system-prompt test fails; restored. `npm run
      check` 13/13 ok.
- [x] **T002** — Write the policy document with the D-016 terms (sample-content note at the top; sections: Returns,
      Shipping, Warranty, Payment, Cancellation and refunds). Before any measurement, write in this file (below,
      under T032) the 10 policy questions with their expected facts and the 3 uncovered questions · files:
      `packages/assistant-service/policies/store-policies.md`, this file · test: review
      **Result (2026-10-23):** policy file written (5 `##` sections, 11 bullet terms, ~170 words), D-016 terms only;
      one wording made concrete: returns "within 30 days **of delivery**". 10 covered questions (P1–P10, split 5/5
      over users A and B) and 3 uncovered (U1–U3) with expected facts recorded under T032. The spec's "shipping
      outside the listed regions" example is answered by the document, so it became covered question P5 and
      "student discount" is the third uncovered question. Awaiting review of the text.

## Tests First

- [x] **T010** — Failing tests for `loadPolicies` (reads the file; the five section headings are present; missing
      file and empty file each throw an error naming the path) and `buildSystemPrompt` (policies included verbatim,
      grounding rule present, handoff rules present, existing instructions unchanged) · files:
      `packages/assistant-service/src/agent/policies.test.ts`, `packages/assistant-service/src/agent/systemPrompt.test.ts`
      · test: fails first
      **Result (2026-10-23):** `policies.test.ts` (4 tests: default file has the five headings; a given path is read
      and trimmed; missing and whitespace-only files throw naming the path) and `systemPrompt.test.ts` (5 tests:
      policies verbatim under "Store policies"; grounding rule; handoff rules; existing instructions kept, checked by
      five distinctive lines; `SYSTEM_PROMPT` equals `buildSystemPrompt(loadPolicies())`). Both files failed first
      ("Cannot find module './policies'").
- [x] **T011** [P] — Failing tests for the shared handoff event: `parseHandoffRequested` accepts a complete payload;
      rejects each missing field, an unknown reason, an empty summary and a 501-character summary; the topic name
      is `assistant.handoff_requested` · files: `packages/shared/src/events.test.ts` · test: fails first
      **Result (2026-10-23):** 15 tests in a new `assistant handoff event (011)` block: topic and event type; exactly
      four reasons; a complete payload round-trips; extra keys (a `transcript`) are dropped; each of the six fields
      missing → `assistant.handoff_requested: <field> missing or invalid`; unknown reason, blank summary and a
      501-character summary rejected; exactly 500 accepted; non-object rejected. All 15 failed first.
- [x] **T012** [P] — Failing tests for `request_human_handoff` (mocked handoff store and publisher):
      - first call publishes once, with `userId`/`conversationId` from the context, the reference matching
        `^HO-[0-9A-F]{8}$`, and exactly the six payload keys; the payload passes `parseHandoffRequested`;
      - returns `{ handoff_requested: true, reference }`;
      - a second call returns the stored reference and publishes nothing;
      - a publish that rejects, or never resolves within the cap, → `ToolFailure` and nothing stored;
      - input with a `user_id` field still publishes the context's user;
      - a 501-character summary is rejected by the schema.

      · files: `packages/assistant-service/src/agent/handoffTool.test.ts` · test: fails first
      **Result (2026-10-23):** 12 tests, all failed first (no module). Besides the listed cases: progress events
      (`running`/`done`) for the chat label; a 500-character summary accepted; empty summary and unknown reason
      rejected; the contract check JSON-round-trips the payload through `parseHandoffRequested`. "Never resolves
      within the cap" is tested in the publisher (T013), which owns the cap; here the mocked publisher rejects
      with its timeout error.
- [x] **T013** [P] — Failing tests for `publishHandoff` (mocked shared `createProducer`/`publishEvent`): publishes to
      the handoff topic keyed by reference, with the correlation ID; the producer connects once across two calls;
      times out after the given cap; a failed connection is retried on the next call · files:
      `packages/assistant-service/src/clients/handoffPublisher.test.ts` · test: fails first
      **Result (2026-10-23):** 6 tests, all failed first (no module): topic, key, correlation ID and client ID;
      one connect across two calls; reconnect after a failed connect; 5 s default cap on a publish that never
      finishes (fake timers, checked still pending at 4999 ms); a given cap on a connect that never finishes; no
      unhandled rejection when publishing fails after the cap. A fresh module per test via `vi.resetModules()` +
      `vi.importActual` (a dynamic `import('./x')` fails the nodenext typecheck, TS2835).
- [x] **T014** [P] — Failing tests for the notification handler (`handleNotificationEvent`, mocked notification
      service):
      - a handoff event → `sendSupportHandoffEmail` once with the parsed payload;
      - the same event ID again → no second call;
      - an unreadable handoff payload → error logged, no throw;
      - existing order/payment events are still routed.

      · files: `packages/notification-service/src/events/consumer.test.ts` · test: fails first
      **Result (2026-10-23):** 8 tests, all failed first (no `handleNotificationEvent` export): handoff → one
      `sendSupportHandoffEmail` with the parsed payload (contract); same event ID again → no second call; payload
      without `summary` → one error log naming the field, no throw, nothing sent; the "Received event" log does
      not contain the summary; order.created / payment.completed / payment.failed still routed; and the support
      email line itself (via `vi.importActual`): IDs and reason as log fields, summary only in the message.
- [x] **T015** — Stubbed-Claude test from T001's decision: the Anthropic provider's request has `system` containing
      the policy text with `cache_control`, and `tools` including `request_human_handoff` · files:
      `packages/assistant-service/src/agent/providers/anthropic.test.ts` · test: fails first (no handoff tool or
      policies yet)
      **Result (2026-10-23):** 2 tests added to `anthropic.test.ts` (5 in total), with the handoff store and
      publisher mocked so the real `buildTools` set is used: the cached `system` block contains the policy file and
      the handoff rules; `tools` has `request_human_handoff` with exactly `reason` (the four values) and `summary`
      (`maxLength` 500). The tool test failed first; the policy test already passed, because T021 was done before
      it.

## Core

- [x] **T020** — Shared: handoff topic, event type, reasons, `MAX_HANDOFF_SUMMARY`, `HandoffRequestedData`,
      `parseHandoffRequested`; rebuild shared `dist` · files: `packages/shared/src/events.ts` · test: T011 passes
      **Result (2026-10-23):** topic `assistant.handoff_requested`, `EventTypes.HANDOFF_REQUESTED`, `HANDOFF_REASONS`,
      `MAX_HANDOFF_SUMMARY = 500`, `HandoffRequestedData`, `parseHandoffRequested` (returns only the six fields).
      The shared `reader` gained `oneOf` and `shortText`. Shared `dist` rebuilt. Break checks: removing the length
      cap → the 501-character test fails; accepting any reason → the missing-reason and unknown-reason tests fail;
      both restored. Shared 102 tests, 200 in total; `npm run check` 13/13 ok.
- [x] **T021** — Assistant policies: `loadPolicies`, `buildSystemPrompt`, `SYSTEM_PROMPT` built at startup (a missing
      file stops startup with the error) · files: `packages/assistant-service/src/agent/policies.ts`,
      `packages/assistant-service/src/agent/systemPrompt.ts` · test: T010 passes; drop the policy section from the
      prompt → T010 fails; restore (AC-12)
      **Result (2026-10-23):** `loadPolicies(path = <package>/policies/store-policies.md)` resolves from `__dirname`
      (same from `src/agent` and `dist/agent`), trims, throws on unreadable or empty. `systemPrompt.ts` keeps the old
      text as `BASE_PROMPT`; `buildSystemPrompt` appends five rules (answer only from the policies with exact terms;
      say "not covered" and offer a person; handoff only when asked or accepted, never on your own; once per
      conversation, same reference; on tool failure say support couldn't be reached) and the document inside
      `<store_policies>`. `SYSTEM_PROMPT` is built at import, so a missing file stops startup (checked live in
      T030). Break checks: removing the policy section → the verbatim test fails; skipping the empty-file check →
      the empty-file test fails; both restored. 12 assistant tests, 185 in total; `npm run check` 13/13 ok.
- [x] **T022** — Handoff path: `conversationId` on `RequestContext` (set in `chatController`), `handoffStore`,
      `handoffPublisher` (lazy producer, 5 s cap), `handoffTool`, added to `buildTools` · files:
      `packages/assistant-service/src/{context.ts,controllers/chatController.ts,store/handoffStore.ts,clients/handoffPublisher.ts,agent/handoffTool.ts,agent/tools.ts}`
      · test: T012, T013, T015 pass; skip the stored-reference check → the repeat test fails; take `userId` from
      the input → the identity test fails; restore (AC-12)
      **Result (2026-10-23):** `RequestContext.conversationId` (set in `chatController`; identity is still checked
      before the body, so a missing user stays a 401); `handoffStore` (`assistant:handoff:{userId}:{conversationId}`,
      conversation TTL); `handoffPublisher` (lazy producer `assistant-service-producer`, retried after a failed
      connect, `Promise.race` against a 5 s timer); `handoffTool` (`HO-` + 4 random bytes as hex; repeat → stored
      reference; publish failure → `ToolFailure` "…request was NOT sent…", nothing stored; a failed save after a
      successful publish is ignored, since the request is out). `instrumented` moved from `tools.ts` to
      `toolTypes.ts` unchanged, so the handoff tool emits the same progress events. The assistant already gets
      `KAFKA_BROKERS` from `.env`; no compose change. Break checks: skip the stored-reference check → repeat test
      fails; take `userId` from the input → identity test fails; no reset after a failed connect → reconnect test
      fails; 60 s cap → 5 s test fails; return success on a failed publish → both failure tests fail; all
      restored. Removing a `publishing.catch()` guard was not caught: `Promise.race` already handles the late
      rejection, so the guard was redundant and was removed (the test stays as a guard). 32 assistant tests, 220
      in total; `npm run check` 13/13 ok.
- [x] **T023** [P] — Notification: handoff topic in the consumer, `handleNotificationEvent`, `sendSupportHandoffEmail`
      · files: `packages/notification-service/src/events/consumer.ts`,
      `packages/notification-service/src/services/notificationService.ts` · test: T014 passes; remove the dedupe →
      the repeat test fails; restore (AC-12)
      **Result (2026-10-23):** `onMessage` body moved to exported `handleNotificationEvent`; handoff topic added to
      the consumer's topics; `sendSupportHandoffEmail` logs `[EMAIL SENT] To support: handoff HO-… from user …
      (conversation …), reason …: <summary>`. Notification failures (including an unreadable payload) are now
      logged by the handler ("Could not send notification") and the event is not marked processed; before, the
      shared consumer logged them, so other events behave the same. Break checks: no dedupe → repeat test fails;
      rethrow → unreadable-payload test fails; skip the parser → the same test fails; drop the summary from the
      line → email test fails; all restored. 8 notification tests; `npm run check` 13/13 ok.
- [x] **T024** [P] — Chat widget label `request_human_handoff: 'Contacting support…'` · files:
      `packages/frontend/src/hooks/useAssistantChat.ts` · test: frontend typecheck passes
      **Result (2026-10-23):** one line in `TOOL_ACTIVITY`; frontend typecheck ok; 228 tests in total.

## Integration

- [x] **T030** — Rebuild `assistant-service`, `notification-service` and `frontend`; every `/health` 200; notification
      consumer `running`; assistant starts with the policy file. Also check a missing policy file stops it: run the
      image once with the file hidden, read the startup error, then restore · test: recorded output (AC-1, AC-13)
      **Result (2026-10-23):** `docker compose up -d --build --wait assistant-service notification-service frontend`:
      every container healthy. `/health` 200 on :4000–:4008 and the frontend on :3000; assistant `provider
      openai-compatible`, `configured: true`. Notification consumer `running` ~6 s after the rebuild (others were
      `starting` at first, rebalancing), subscribed to `[order.created, payment.completed, payment.failed,
      order.shipped, assistant.handoff_requested]`. The policy file is in the image. Missing-file check, in a
      throwaway `docker compose run --rm --no-deps -u root` container (image unchanged): file removed → `Error:
      Store policy document not readable at /app/packages/assistant-service/policies/store-policies.md: ENOENT…`,
      exit 1; whitespace-only file → `Error: Store policy document is empty: …`, exit 1. The running service still
      has the 30-line file.
- [x] **T031** — Measurement script (scratchpad): post a message to `:4008/api/v1/assistant/chat` with `x-user-id`
      and the internal token, read the SSE stream until `done`, print the full reply and any tool calls · test: one
      product question answered
      **Result (2026-10-23):** `chat.mjs` in the session scratchpad (`node chat.mjs <userId> "<message>"
      [conversationId]`, token from `INTERNAL_SERVICE_TOKEN`); prints send time, conversation ID, tool events, the
      `done`/`error` event with duration, and the reply. Users: A = `16be8435…` (own002-a, 28 orders), B =
      `9acba204…` (own002-b, no orders). LM Studio serves `qwen/qwen3-30b-a3b-2507`. Check, user B, "Do you have any
      wireless mice?": `search_products` running → done, `done` (`stop`) after 5.5 s, reply lists "Mouse: Wireless,
      $25.00" and offers to add it to the cart. (Uses 1 of B's 30 messages this hour.)
- [x] **T032** — Policy runs on the configured model, each in a new conversation:
      - the 10 questions, split over users A and B;
      - the 3 uncovered questions;
      - one product question and one order question (regression check).

      Record each answer verbatim and grade it against the expected facts. Count handoff events during these runs
      (expect 0) · test: recorded output (AC-2, AC-3, AC-4 "never unasked", AC-11 local)
      **Result (2026-10-23):** passes on attempt 4: **AC-2 10/10** (0 contradictions), **AC-3 3/3** (each says the
      policies don't cover it and offers a person, no invented term), regression questions answered with their
      tools, **0 handoff events** across all 60 runs (topic offset 0, 0 support notifications). Path there:
      attempt 1 (T021 prompt) invented a "no" for all 3 uncovered questions (AC-3 0/3); attempt 2 spelled out the
      uncovered rule in the prompt (3/3) but P7 turned into "not covered"; attempt 3 (two more prompt rules)
      changed nothing; attempt 4 made the document explicit (D-020). Details and verbatim answers under "Runs"
      below. Turns took 0.4–6.9 s on the local model.

      **Scripted questions (written 2026-10-23 in T002, before any run).** A covered answer passes if it states
      every expected fact and contradicts none. An uncovered answer passes if it says the policies don't cover it
      (or it doesn't know), offers to connect the customer with a person, states no invented term, and triggers
      no handoff event.

      | #   | User | Question | Expected facts |
      | --- | ---- | -------- | -------------- |
      | P1  | A | "How long do I have to return something?" | 30 days of delivery; unused, original packaging |
      | P2  | A | "Can I return a keyboard I've already used for a week?" | No: must be unused and in its original packaging |
      | P3  | A | "How much is shipping on a $30 order?" | $5 (free only over $50) |
      | P4  | A | "How long does delivery take?" | 3–5 business days |
      | P5  | A | "Can you ship my order to Canada?" | No: domestic addresses only, no international shipping |
      | P6  | B | "What warranty do your products have?" | 1-year warranty on every product |
      | P7  | B | "Can I pay with PayPal?" | No: card payments only |
      | P8  | B | "When will my card be charged?" | When the order is confirmed, not when placed |
      | P9  | B | "My order shipped yesterday. Can I still cancel it?" | No: cancellation only until it ships |
      | P10 | B | "If I return something, how and when do I get my money back?" | Original payment method, 5–7 business days, starting when the returned item is received (start point added 2026-10-23, D-020) |
      | U1  | A | "Do you price match if I find it cheaper somewhere else?" | Not covered → say so, offer a person |
      | U2  | B | "Can you gift wrap my order?" | Not covered → say so, offer a person |
      | U3  | B | "Do you have a student discount?" | Not covered → say so, offer a person |

      Shipping outside the listed regions (the spec's AC-3 example) is covered by the document ("domestic only"),
      so it is graded as covered question P5; U3 replaces it.

      **Runs (2026-10-23).** LM Studio
      `qwen/qwen3-30b-a3b-2507`, each question a new conversation via `chat.mjs`; every turn ended `done`
      (`stop`) in 0.4–3.7 s. Handoff topic `assistant.handoff_requested` at offset 0 before and after all three
      attempts (0 events), 0 support notifications. Grades: ✓ pass, ✗ fail, ⚠ facts right but an addition the
      document doesn't state.

      | Q | Attempt 1 (prompt from T021) | Attempt 2 (uncovered rule spelled out) | Attempt 3 (+ "limits answer", "no start points") |
      | - | ---------------------------- | -------------------------------------- | ------------------------------------------------ |
      | P1 | ✓ | ✓ | ✓ |
      | P2 | ✓ | ✓ | ✓ |
      | P3 | ✓ ("$5 for orders under $50") | ✓ | ✓ |
      | P4 | ✓ | ✓ | ✓ |
      | P5 | ✓ | ✓ | ✓ |
      | P6 | ✓ | ✓ | ✓ |
      | P7 | ✓ "We only accept card payments… credit or debit card" | ✗ "don't cover payment methods like PayPal, so I don't know" + offers a person | ✗ same as attempt 2 |
      | P8 | ✓ (adds "after payment is processed and the order status changes to CONFIRMED", from the status list) | ✓ (similar) | ✓ (similar) |
      | P9 | ✓ | ✓ | ✓ |
      | P10 | ⚠ 30 days, original method, 5–7 business days "**after we receive the returned item**" | ⚠ same | ⚠ same |
      | U1 | ✗ "our store does not offer price matching", no person offered | ✓ "Our store policies don't cover price matching, so I don't know. Would you like me to connect you with a person who can help?" | ✓ same |
      | U2 | ✗ "mercato doesn't offer gift wrapping at this time", no person offered | ✓ (same pattern) | ✓ same |
      | U3 | ✗ "mercato does not offer a student discount", no person offered | ✓ (same pattern) | ✓ same |
      | R1 product | ✓ `search_products`, Keyboard $75.00 | ✓ | ✓ |
      | R2 order | ✓ `list_orders`, 4AEC5D50 cancelled, out of stock, not charged | ✓ | ✓ |
      | **AC-2** | 10/10 by the letter (P10 ⚠) | 9/10 (P7 ✗, P10 ⚠) | 9/10 (P7 ✗, P10 ⚠) |
      | **AC-3** | **0/3**: invents a "no" every time | 3/3 | 3/3 |

      Attempt 1 missed AC-3 completely: the model read "not covered" as "the store doesn't offer it". Attempt 2's
      wording fixed AC-3 but made the model treat "card payments only" as silent about PayPal (P7). Attempt 3's
      rules changed nothing (identical answers). P10's "after we receive the returned item" appears in all three:
      no contradiction, but not in the document (NFR "Grounding"). Raw output: `t032.txt`,
      `t032-attempt2.txt`, `t032-attempt3.txt`, `t032-attempt4.txt` in the session scratchpad.

      **Attempt 4 (document clarified, D-020; prompt as in attempt 3; no code change):** A asked P1–P5, U1, R2; B
      asked P6–P10; U2, U3 and R1 went to user C (`56e0d121…`, the dev admin) because B had reached 30 messages this
      hour. Answers, verbatim:
      - P1 ✓ "You can return an item within 30 days of delivery. The item must be unused and in its original packaging."
      - P2 ✓ "…within 30 days of delivery only if it's unused and in its original packaging. Since you've already used
        the keyboard for a week, it doesn't meet the return conditions."
      - P3 ✓ "Shipping is $5 for orders under $50. So your $30 order will have a $5 shipping fee."
      - P4 ✓ "Delivery takes 3–5 business days."
      - P5 ✓ "Our store policies state that we only ship to domestic addresses. Unfortunately, we cannot ship to Canada."
      - P6 ✓ "Every product comes with a 1-year warranty."
      - P7 ✓ "Our store policies state that we accept card payments only. We don't accept PayPal or any other payment
        method."
      - P8 ✓ "Your card is charged when your order is confirmed, not when you place it. This happens after payment is
        processed and the stock is reserved." (the addition restates the prompt's order-status list)
      - P9 ✓ "Once an order has shipped, it can no longer be cancelled. Your order is on its way, so it cannot be stopped."
      - P10 ✓ "…30 days of delivery… unused and in its original packaging… Refunds go back to your original payment
        method within 5–7 business days, starting when we receive the returned item."
      - U1 ✓ "Our store policies don't cover price matching, so I don't know. Would you like me to connect you with a
        person who can help?"
      - U2 ✓ "Our store policies don't cover gift wrapping, so I don't know if it's available. Would you like me to
        connect you with a person who can help?"
      - U3 ✓ "Our store policies don't cover student discounts, so I don't know. Would you like me to connect you with
        a person who can help?"
      - R1 ✓ `search_products`; "Keyboard - $75.00 … Would you like to add it to your cart?"
      - R2 ✓ `list_orders`; "…reference 4AEC5D50, was cancelled… You weren't charged for this order."
- [x] **T033** — Policy edit: change one term (e.g. returns 30 → 45 days), restart the assistant, ask, record the
      answer, restore, and restart again · test: recorded output (AC-1)
      **Result (2026-10-23):** `within 30 days` → `within 45 days` in `store-policies.md` only;
      `docker compose up -d --build --wait assistant-service`; user C asked "How long do I have to return
      something?" → "You can return an item within 45 days of delivery. The item must be unused and in its original
      packaging." Restored the file (byte-identical copy), rebuilt, asked again → "…within 30 days of delivery…".
      Note: the document is copied into the image, so under Docker a change needs a rebuild, not just a restart
      (with `npm run dev` a restart is enough). To be said in the assistant README (T090).
- [x] **T034** — Handoff runs:
      - "I'd like to talk to a person about my order": reference in the reply; exactly 1 message on the topic
        (`kafka-console-consumer.sh`), with no transcript; the notification log line has the same reference, with
        the time difference recorded (≤ 5 s);
      - ask again in the same conversation: the same reference, still 1 message;
      - replay that message: still 1 log line;
      - stop Kafka and ask in a new conversation: an honest "couldn't reach support" reply, and the next question
        is still answered; then start Kafka.

      · test: recorded output (AC-4–AC-9)
      **Result (2026-10-24):** LM Studio `qwen/qwen3-30b-a3b-2507` (reloaded with `-c 16384 --parallel 1`: turns
      went from ~115 s to 0.5–6 s; `docs/lm-studio-setup.md`). Topic `assistant.handoff_requested` at offset 0.
      - Request (user A): the first ask, "I'd like to talk to a person about my order", got "Could you provide the
        order reference…?" and no handoff; the follow-up "No, I want to talk to a person, please." →
        `request_human_handoff` done, reply "Your request has been sent to a person… HO-90A1B81C". Offset 0 → 1.
        Payload: reference, userId, conversationId, `customer_request`, a 54-character summary, `requestedAt`; no
        transcript. Notification log: same reference, user and conversation, **45 ms** after `requestedAt`.
      - Repeat in the same conversation → "the reference is HO-90A1B81C", offset still 1, 1 notification.
      - Replay (console producer, same key/headers/value) → offset 2, "Event already processed, skipping",
        still 1 notification.
      - Kafka stopped (user B): honest "couldn't connect you with a person right now. Please try again later"
        (10.1 s), the next question answered (2.3 s). **But the event was delivered ~50 s after Kafka came back**
        (offset 3, support notified): the idempotent producer retried without limit. Fixed by D-021 (one bounded
        KafkaJS attempt; 3 unit tests, 2 break checks caught; 235 tests). Re-run after the fix (user C): Kafka
        stopped → failure reply, turn 4.0 s; Kafka paused → failure reply, 4.6 s; after 90 s offset still 3, 0
        new notifications; a retry in the paused conversation once Kafka was back → HO-2FBAD601, offset 4,
        notified 1.8 s after sending. Every `/health` 200, consumers `running`.
      - Open (AC-4, model behaviour): 2 of 4 first asks ("…about my order", "I want to talk to a person, please.")
        got a clarifying question instead of a handoff; the 2 asks that named a reason handed off at once. A
        prompt rule is proposed; it needs the user's call (and a T032 re-run).

- [x] **T035** — Hand off on the first ask (added 2026-10-24, user's call after T034: 2 of 4 first requests for a
      person got a clarifying question). Prompt rule: when the customer asks for a person, call the tool in that
      turn; don't ask what it's about first (the summary can say the reason wasn't given). Test first in
      `systemPrompt.test.ts`; then live: the 4 T034 first asks in new conversations, and a full T032 re-run (15
      questions + 2 regression) with 0 handoff events · files: `systemPrompt.ts`, `systemPrompt.test.ts` · test: unit
      + recorded output (AC-2, AC-3, AC-4)
      **Progress (2026-10-24, not done):** 4 prompt attempts, each test-first (prompt test fails, then passes).
      First asks handed off in the same turn: attempt 1 2/4 · attempt 2 3/4 ("…about my order" got "I'll connect
      you… please wait" with no tool call) · attempt 3 2/4, and one reply **made up** the sample reference
      `HO-1A2B3C4D` from the prompt with no handoff · attempt 4 (no sample reference, "never make up a
      reference", a different example phrase so "…about my order" stays held out) **4/4**, each with a real
      reference, offset 12 → 16. T032 re-run on attempt 4: P1–P10 10/10, U1–U3 3/3, 0 handoff events. **But product
      grounding regressed:** "Do you have any wireless mice?" invented three branded mice with no tool call; with
      the committed prompt it calls `search_products` ("Mouse: $25.00"). "Do you have a keyboard?" skips the tool
      under both prompts (an existing gap). Needs the user's call. Raw output: `t035-*.txt` in the session
      scratchpad. (A first misreading, that replies lacked the reference, was a `grep '^reply'` that showed only
      each reply's first line; the raw SSE had it.)
      Attempt 5 (user chose option 1: handoff rule scoped to requests for a person; new grounding rule "before
      naming any product, call search_products or get_product; never name a product, brand or price a tool did not
      return"): handoffs **4/4** first ask (offset 16 → 20); P1–P10 **9/10** (P7 back to "don't cover payment
      methods beyond card… I don't know if PayPal is accepted", no contradiction); U1–U3 3/3; 0 unasked handoffs in
      18 other questions; R1, R2, mice, monitors grounded with tools. **Still failing:** "Do you have a keyboard?"
      invents three branded keyboards with no tool call (committed prompt: a vague "we have several keyboards",
      also with no tool call). Raw: `t035-a5-*.txt`.
      **Result (2026-10-24), attempt 6** (user's choice; adds a vague-question example, "Do you have headphones?" →
      `search_products` first, with "keyboard" held out): first-ask handoffs **4/4** in the same turn with real
      references (offset 20 → 24); product questions **7/7** looked up first (keyboard ×2 → the $75 keyboard, mice
      $25, monitors $300, laptops $1,200, mechanical keyboard under $100, webcams → "couldn't find any"); after the
      06:00 rate-limit reset P1–P10 **10/10**, U1–U3 **3/3**, R2 via `list_orders`, **0 unasked handoffs** (offset
      24 → 24). Rules added (D-022): handoff straight away, scoped to requests for a person; never claim connecting
      without a tool result; reply with the tool's reference word for word, no sample reference in the prompt;
      catalog lookup before naming any product. Prompt tests: 2 tests, each failed first; break checks (sample
      reference back, grounding rule removed) caught. 237 tests. Raw: `t035-a6-part1.txt`, `t035-a6-part2.txt`.

## Verify

- [x] **T090** — Docs (AC-13):
      - `docs/ai-shopping-assistant.md`: Phase 3 shipped; open question 3 answered; implementation note on the
        policy file and handoff;
      - assistant README: policies, the handoff tool, privacy;
      - notification README: the handoff notification;
      - `specs/architecture.md`: event table row;
      - `README.md`: event flow;
      - `specs/testing-strategy.md`: the provider stub pattern.

      · test: review
      **Result (2026-10-24):** design doc: status Phases 0–3 built, Phase 3 ✅ in §8, tool table (handoff built,
      `search_help_center` not needed), §4.6 points at the policy file, Phase 3 implementation notes (policy file,
      handoff payload, Kafka-down behaviour, D-021), open question 3 answered. Assistant README: "Store policies"
      (edit → rebuild under Docker, missing file stops startup, D-020 lesson), "Talking to a person" (steps,
      Kafka down, privacy), handoff tool row, `KAFKA_BROKERS` row. Notification README: topic list and "Support
      handoffs" with a real log line. Shared README: handoff parser, producer limits. `architecture.md`: event
      table row. `README.md`: handoff flow under Event Flow and the assistant → Kafka arrow in the diagram.
      `testing-strategy.md`: SDK stub and Kafka producer patterns; rule 5 corrected (it described a stub server
      we don't use). Also new: `docs/lm-studio-setup.md`, linked from the assistant README. `npm run check` 13/13.
- [x] **T091** — Every Definition-of-Done gate green (`specs/constitution.md`): `npm run check`, `npm run build`,
      every `/health`; record the numbers
      **Result (2026-10-24):** `npm run check` 13/13 (235 tests); `npm run build` exit 0 in 14 s; `docker compose
      up -d --build --wait` (all images, since `shared` changed) in 35 s; `/health` 200 on :4000–:4008 and the
      storefront on :3000; consumers `running` on order, inventory, payment and notification; 0 "Failed to start"
      in the logs. Gates 1 and 4 (ACs ticked, memory and roadmap) are T092.
- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), update `roadmap.md`/`roadmap.json`,
      `memory/progress.md`, `memory/MEMORY.md`
      **Result (2026-10-24):** 13/13 ACs ticked in `spec.md` and `feature.json` (status `implemented`, stage
      `verified`); spec Status `Implemented` with Changelog entries for D-021, T035 and sign-off; roadmap 011 ✔️
      (`roadmap.md`, `roadmap.json`); progress and MEMORY updated. `npm run check` 13/13, 237 tests.

## AC coverage

| AC    | Tasks                          |
| ----- | ------------------------------ |
| AC-1  | T002, T010, T021, T030, T033   |
| AC-2  | T002, T032                     |
| AC-3  | T002, T032                     |
| AC-4  | T012, T022, T032, T034, T035   |
| AC-5  | T014, T023, T034               |
| AC-6  | T012, T014, T022, T023, T034   |
| AC-7  | T012, T022                     |
| AC-8  | T012, T013, T022, T034         |
| AC-9  | T011, T012, T034               |
| AC-10 | T011, T012, T014, T020         |
| AC-11 | T001, T015, T022, T032         |
| AC-12 | T010–T015, T021–T023           |
| AC-13 | T030, T090                     |
