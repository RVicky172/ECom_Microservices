# 011 — Assistant: Store Policies and Human Handoff

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 1 · **Created:** 2026-10-23 · **Owner:** RVicky172

## Summary

The shopping assistant can find products, check stock, read the cart and explain orders. It cannot answer "What
is your return policy?", because the store has no written policies and the assistant is told never to invent
them. It also cannot help someone who wants a person. This is Phase 3 of `docs/ai-shopping-assistant.md`.

This feature does two things:

- **Policies:** it gives the store one written, versioned set of policies (returns, shipping, warranty, payment,
  cancellation) that the assistant answers from, and only from.
- **Handoff:** it lets a customer ask for a human. The assistant then sends a handoff request through Kafka, which
  the notification service picks up, the same way order and payment events already flow.

Answers must match the source document. A question the document doesn't cover gets "I don't know", plus an offer
to reach a person, never a made-up policy.

## User Stories

- **US-1:** As a shopper, I want to ask the assistant about returns, shipping, warranty, payment and cancellation,
  and get the store's actual rules, so that I can decide before buying.
- **US-2:** As a shopper whose question the assistant can't answer, I want to reach a person from the chat and get
  a reference, so that I know my request was received.
- **US-3:** As the store, I want each handoff to reach support once, with who asked and why, but not the whole
  chat, so that support can follow up without us copying private conversations around.
- **US-4:** As a maintainer, I want the policies in one reviewable file and the handoff event defined in shared
  code, so that changing a policy or the event is a normal, tested change (Constitution V).

## Acceptance Criteria

"The configured model" means the assistant's current provider, today LM Studio `qwen/qwen3-30b-a3b-2507` (Q6).
Questions are asked through `POST /api/v1/assistant/chat` as a signed-in user, each in a new conversation.

- [x] **AC-1:** The store's policies live in one document in the repository. It covers returns, shipping,
  warranty, payment and order cancellation, and each topic states concrete terms (days, amounts, conditions). The
  assistant answers from this document. Editing it and restarting the assistant service changes the answers with
  no code change. _(unit + manual)_
- [x] **AC-2:** Of 10 scripted policy questions (written into tasks.md with their expected facts), at least 9
  answers state the document's facts correctly, and none contradicts the document. _(manual measurement on the
  configured model)_
- [x] **AC-3:** For 3 scripted questions the document does not cover (e.g. price matching, shipping outside the
  listed regions, gift wrapping), the assistant says it doesn't know or that it isn't covered, and offers to
  connect the customer with a person. It states no invented policy in any of the 3. _(manual measurement)_
- [x] **AC-4:** Given a customer asks to talk to a person, or accepts the assistant's offer, then in that same turn:
  - the assistant confirms the request and gives a handoff reference;
  - exactly one handoff event is published, carrying the reference, the signed-in user's ID, the conversation ID,
    a reason category, a short summary and a timestamp.

  The assistant never hands off without the customer asking or agreeing (Q4). _(unit + manual)_
- [x] **AC-5:** Within 5 seconds of the request, the notification service logs exactly one support notification
  for the handoff, naming the reference, user ID and conversation ID. _(manual measurement)_
- [x] **AC-6:** Asking for a person again in the same conversation publishes nothing new and returns the same
  reference. The same event delivered twice produces one notification (Q5). _(unit + manual measurement:
  replay)_
- [x] **AC-7:** The user ID in the event always comes from the gateway-verified identity. Nothing the model or the
  customer writes can change it. _(unit)_
- [x] **AC-8:** Given Kafka is unavailable when a handoff is requested, the assistant tells the customer it couldn't
  reach support right now and to try again later, and the chat keeps working. Nothing claims the request was sent.
  _(unit + manual measurement with Kafka stopped)_
- [x] **AC-9:** The handoff event and the logs carry no chat transcript. The summary is at most 500 characters, and
  no message text beyond it leaves the assistant (Q3). _(unit)_
- [x] **AC-10:** The handoff topic and its payload are defined once in `packages/shared`, alongside the saga
  events, with a parser. The assistant (producer) and notification (consumer) use them, and a contract test checks
  that the produced payload passes the parser. _(unit)_
- [x] **AC-11:** Policies and handoff work with both model providers:
  - live on the configured local model;
  - for Claude, through unit tests with a stubbed model (no API credits, testing-strategy rule 5).

  _(unit + manual)_
- [x] **AC-12:** The new logic (policy loading, the handoff tool, the event, the notification handler) is
  unit-tested without Kafka, Redis or a model, and each test is seen failing once by breaking its code, recorded in
  tasks.md. _(unit + manual measurement)_
- [x] **AC-13:** The changed services are rebuilt and report healthy. The docs are updated:
  - `docs/ai-shopping-assistant.md` (Phase 3 status, open question 3 answered);
  - the assistant and notification READMEs;
  - `specs/architecture.md` (event table);
  - `README.md` event flow.

  _(manual review)_

## Non-Functional Requirements

- Grounding: the assistant states no policy fact that is not in the document (AC-2, AC-3).
- Privacy: handoff events and logs carry IDs, a reason category and a short summary, never the transcript (AC-9).
  Design doc §6: no full message text in logs.
- Data ownership (Constitution V): the handoff travels only as a Kafka event defined in shared. The notification
  service reads no assistant data from Redis.
- Reliability: a Kafka outage degrades only the handoff (AC-8). The notification consumer starts through the
  existing `startSagaConsumer` (retries until Kafka is ready, D-015).
- Cost: policy text is part of the static, cached system prompt (design doc §4.6). No retrieval or embeddings.

## Out of Scope

- A support inbox, ticketing tool, admin page or real email delivery (Q2): the notification service logs the
  handoff, like its other notifications.
- Live chat with a person inside the widget.
- Retrieval or embeddings for large policy sets (`search_help_center`).
- The `assistant.interaction` analytics event, feedback buttons and the eval suite (012).
- Checking answers on Claude live (no credits; open in G12 / 012).
- Policy questions from signed-out visitors (the assistant requires sign-in today).

## Open Questions

- **Q1** **Resolved 2026-10-23 (accepted as proposed).** Who writes the policy text, and what are the terms? _Proposed:_ I draft example
  policies for this learning store, marked as sample content, and you review them before the plan is approved.
  Draft terms:
  - returns within 30 days, unused and in original packaging;
  - free shipping over $50, otherwise $5; 3–5 business days, domestic only;
  - 1-year warranty;
  - card payments only, charged when the order is confirmed;
  - cancellation possible until the order ships;
  - refunds to the original payment method within 5–7 business days.
- **Q2** **Resolved 2026-10-23 (accepted as proposed).** Where do handoffs go (design doc open question 3)? _Proposed:_ the notification
  service logs them as a simulated email to support, like its other notifications. No ticketing or admin page in
  this feature.
- **Q3** **Resolved 2026-10-23 (accepted as proposed).** What does the handoff event contain? _Proposed:_
  - reference, user ID, conversation ID, timestamp;
  - a reason category: `customer_request`, `policy_not_covered`, `order_problem` or `other`;
  - a summary of at most 500 characters written by the assistant.

  No transcript, and no email address (support looks the user up by ID).
- **Q4** **Resolved 2026-10-23 (accepted as proposed).** When may the assistant hand off? _Proposed:_ only when the customer asks for a
  person, or says yes after the assistant offers (e.g. after an uncovered policy question). Never on its own.
- **Q5** **Resolved 2026-10-23 (accepted as proposed).** How often can one conversation hand off? _Proposed:_ once. A repeat request returns
  the same reference. A new conversation can hand off again.
- **Q6** **Resolved 2026-10-23 (accepted as proposed).** Which model and bar for AC-2/AC-3? _Proposed:_ the configured LM Studio model
  (`qwen/qwen3-30b-a3b-2507`), at least 9/10 grounded and 3/3 no invention. Claude is covered by stubbed unit
  tests only, until credits exist.
- **Q7** **Resolved 2026-10-23 (accepted as proposed).** Should the customer also get a notification (e.g. a confirmation email)?
  _Proposed:_ no. The confirmation and reference in the chat are enough; only support is notified.

## Changelog

- 2026-10-23 — Created.
- 2026-10-23 — Q1–Q7 accepted as proposed by RVicky172 (including the draft policy terms in Q1); status →
  Approved (D-016).
- 2026-10-23 — Plan approved (D-017), tasks written; status → In Progress.
- 2026-10-23 — T032: policy document made explicit after the first measurements (D-020): "card payments only" now
  also says no other method is accepted, and a return's 5–7 day refund period starts when the item is received
  (a new term, approved by RVicky172).
- 2026-10-24 — T034: a handoff that timed out with Kafka down was still delivered later; the producer now makes one
  bounded attempt (D-021, plan §3 updated; the spec's AC-8 is unchanged).
- 2026-10-24 — T035 added (RVicky172): hand off on the first ask and ground product answers (D-022).
- 2026-10-24 — All 13 ACs met (evidence in tasks.md T032–T035, T090, T091); status → Implemented.
