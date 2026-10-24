# 012 — Assistant: Eval Suite, Answer Feedback and Usage Analytics

**Status:** In Progress <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 1 · **Created:** 2026-10-24 · **Owner:** RVicky172

## Summary

The assistant's quality has so far been checked by hand, one feature at a time: 002 checked order answers, 011
checked policies, handoff and product grounding with a few dozen scripted questions on the local model. Each change
to the prompt in 011 fixed one case and broke another (D-022), and nothing re-runs the old cases. This is the
first half of Phase 4 ("Hardening") of `docs/ai-shopping-assistant.md`, and Phase 1's exit criterion needs it.

This feature does three things:

- **Eval suite:** a fixed, versioned set of scripted conversations with pass rules, run with one command against
  the configured model. It reports a pass rate, so a prompt, model or effort change can be judged by numbers.
- **Answer feedback:** shoppers can rate each assistant answer thumbs up or down.
- **Usage analytics:** each chat turn emits an `assistant.interaction` event (tools used, outcome, latency,
  tokens, no message text), and a report sums those events, with the ratings, per day and model.

## User Stories

- **US-1:** As a maintainer, I want to run every known assistant case with one command and get a pass rate, so
  that I can change the prompt or model without breaking earlier fixes (011 T035).
- **US-2:** As a maintainer, I want the eval's grading to be repeatable, so that a lower score means the
  assistant got worse, not that the grader changed its mind.
- **US-3:** As a shopper, I want to mark an answer as helpful or not, so that the store learns where the
  assistant fails.
- **US-4:** As the store, I want to see how the assistant is used (turns, tools, handoffs, latency, tokens,
  ratings) without storing what customers wrote, so that cost and quality can be tracked privately.
- **US-5:** As a maintainer, I want the new events defined in shared code like the others, so that producers and
  consumers can't drift (Constitution V).

## Acceptance Criteria

"The configured model" means the assistant's current provider, today LM Studio `qwen/qwen3-30b-a3b-2507` (Q8).

### Eval suite

- [ ] **AC-1:** The repository holds at least 50 eval cases (Q2). Each has an ID, a category, one or more user
  messages, and pass rules. The categories and their minimum counts are:
  - product discovery and grounding: 10, including the 7 product questions from 011 T035 and "Do you have a
    keyboard?";
  - product details and stock: 5;
  - orders (own order status, cancelled-order reason, another user's order ID): 6;
  - cart and proposals (adds only through a proposal, never claims to have added): 5;
  - covered policy questions: 10 (011 P1–P10);
  - uncovered policy questions: 3 (011 U1–U3);
  - handoff: 5 (the 4 first asks from 011 T034/T035, plus a repeat request in the same conversation);
  - prompt injection (in the chat, and in product text returned by a tool): 3;
  - off-topic requests: 3.

  _(manual review of the case file)_
- [ ] **AC-2:** One command runs the whole suite against the running stack and the configured model. Each case runs
  in a new conversation as a dedicated eval user. The data the cases need (products, the eval user's orders) is set
  up by the command, with no manual steps beyond starting the stack and loading the model (Q6). _(manual
  measurement)_
- [ ] **AC-3:** Grading is rule-based and deterministic (Q4). The same recorded reply and tool calls always get the
  same grade. Supported rules include: tool called, tool not called (by tool name), text must contain, text must
  not contain, a handoff event was or was not published, a proposal was or was not returned. _(unit, on recorded
  replies)_
- [ ] **AC-4:** Each run writes a report file with:
  - per case: pass or fail, and for a fail, which rule failed;
  - pass rate per category and overall;
  - provider, model, date, duration and token totals.

  The command exits non-zero when the target in AC-5 is missed. _(manual measurement)_
- [ ] **AC-5:** On the configured model, 2 consecutive full runs each reach an overall pass rate of at least 90%,
  with 100% in the safety categories: cart (no write without a proposal), orders (another user's order), prompt
  injection, and no unasked handoff (Q3, Q7). The two reports are recorded in tasks.md. _(manual measurement)_
- [ ] **AC-6:** The eval never runs inside `npm test` or `npm run check`, and no automated test calls a model
  (testing-strategy rule 5). The grader and the report are unit-tested on recorded replies. _(unit + manual review)_

### Answer feedback

- [ ] **AC-7:** Each finished assistant answer in the chat widget shows thumbs up and thumbs down buttons. They are
  not shown while the answer streams or on an error message. Clicking one records the rating and shows it as
  selected. Clicking the other changes it; one rating per answer is kept (the last). The buttons have accessible
  labels and work from the keyboard (Q9). _(manual measurement in the storefront)_
- [ ] **AC-8:** The feedback API accepts a rating only from the signed-in owner of the conversation, for an answer
  that exists in it. Without a JWT it returns 401; for another user's conversation or an unknown answer it returns
  404; a rating other than up or down returns 400. _(unit, tested both ways)_

### Usage analytics

- [ ] **AC-9:** After each finished chat turn, exactly one `assistant.interaction` event is published. It carries:
  - an event ID, the conversation ID and the answer's ID;
  - provider, model, stop reason, and an outcome (`answered`, `proposal`, `handoff`, `refused`, `error`,
    `limited`);
  - the names of the tools called, the latency in milliseconds, and token usage (input, cached input, output);
  - a timestamp.

  It carries no message text and no user ID (Q10). _(unit)_
- [ ] **AC-10:** Each rating publishes one `assistant.feedback` event with the event ID, conversation ID, answer
  ID, rating and timestamp, so it can be joined with the interaction event. No user ID, no text. _(unit)_
- [ ] **AC-11:** Both topics and payloads are defined once in `packages/shared` with parsers, and a contract test
  checks that what the assistant produces passes the parser. _(unit)_
- [ ] **AC-12:** Publishing analytics never slows or breaks the chat. The event is sent after the answer has been
  streamed. With Kafka stopped, chat turns still finish and ratings are still saved, and a failed event is dropped
  with one log line, not retried. _(unit + manual measurement with Kafka stopped)_
- [ ] **AC-13:** A usage report command reads the events and prints, per day and per model: conversations, turns,
  tool calls by tool name, handoffs, mean and 95th-percentile latency, token totals, and thumbs up and down counts
  (Q11). After 10 scripted turns and 3 ratings, every count in the report matches exactly. _(unit + manual
  measurement)_

### Quality and docs

- [ ] **AC-14:** The new logic (grader, report, event builders, feedback handler, usage aggregation) is
  unit-tested without Kafka, Redis or a model, and each test is seen failing once by breaking its code, recorded in
  tasks.md. _(unit + manual measurement)_
- [ ] **AC-15:** The changed services are rebuilt and report healthy. The docs are updated:
  - `docs/ai-shopping-assistant.md` (Phase 4 status: what is built, what is still open);
  - the assistant README (how to run the eval and the usage report);
  - `specs/testing-strategy.md` (where evals sit);
  - `specs/architecture.md` (event table) and the `README.md` event flow.

  _(manual review)_

## Non-Functional Requirements

- Privacy (design doc §6): analytics events and logs carry IDs, names of tools, counts and timings, never message
  text or a user ID. Ratings carry no free text.
- Repeatability: a run's grade depends only on the model's replies and tool calls, not on another model judging
  them.
- Reliability: analytics is best-effort and outside the request path (AC-12). Kafka down affects only analytics.
- Data ownership (Constitution V): ratings live in the assistant's own Redis keys (`assistant:`); analytics leaves
  the service only as Kafka events defined in shared.
- Duration: one full eval run on the configured local model finishes in at most 30 minutes.

## Out of Scope

- Running the eval in CI (CI is in the backlog, D-012). The design doc's "in CI" becomes "before every prompt,
  model or effort change, by hand".
- An LLM-as-judge grader (Q4).
- Running the eval on Claude live (no API credits; the Claude path stays covered by stubbed unit tests, as in 011).
- A cost dashboard in a UI, cost in currency, and a daily token budget per user (Q11, Q12). The existing
  30-messages-per-hour limit stays as is.
- Model or effort tuning from eval results: this feature gives the numbers; changing the model is a later decision.
- Free-text feedback, and a page for the store to read ratings.
- Conversation compaction (backlog).
- Persisting Kafka data across a Kafka recreate (backlog): the usage report covers what the topic still holds.

## Open Questions

Number them so answers can be referenced (Q1, Q2…). Each with a proposed default answer.

- **Q1** **Resolved 2026-10-24 (accepted as proposed).** One feature or two? Phase 1's exit criterion needs only the eval suite; feedback and
  analytics add a frontend change, a new API route, two events and a report. _Proposed:_ keep all three in 012, as
  the roadmap lists them, and build the eval suite first so the phase exit isn't blocked by the rest. (Alternative:
  012 = eval suite only; feedback and analytics become 013.)
- **Q2** **Resolved 2026-10-24 (accepted as proposed).** How many cases? The design doc says 50–100. _Proposed:_ 50 to start (the minimums in
  AC-1 add up to 50), grown by adding a case for every bug found from now on.
- **Q3** **Resolved 2026-10-24 (accepted as proposed).** What target passes? _Proposed:_ at least 90% overall and 100% in the safety
  categories (AC-5), on each of 2 consecutive runs. A case that fails is fixed in the prompt or the code, or
  recorded as a known failure with the user's agreement; the safety categories allow no known failures.
- **Q4** **Resolved 2026-10-24 (accepted as proposed).** How are answers graded? _Proposed:_ rules only (tool calls, events, proposals,
  must-contain and must-not-contain text). Policy facts are matched on key terms (e.g. "30 days"), so wording
  varies freely. No second model judges answers: it would be slower, cost money on Claude, and its grades vary.
- **Q5** **Resolved 2026-10-24 (accepted as proposed).** Does a single reply decide a case, given local models are not deterministic?
  _Proposed:_ yes, each case runs once per run; the "2 consecutive runs" in AC-5 covers flakiness. The report lists
  cases that passed in one run and failed in the other.
- **Q6** **Resolved 2026-10-24 (accepted as proposed).** How does the eval get its data? _Proposed:_ the command registers (or reuses) an
  eval user through the normal auth API and creates the orders it needs through the normal APIs, on top of the
  existing product seed. A second eval user owns the order used in the "another user's order" case. Nothing writes
  to a service's database directly (Constitution V).
- **Q7** **Resolved 2026-10-24 (accepted as proposed).** How is "no unasked handoff" checked? _Proposed:_ every non-handoff case also has an
  implicit rule "no handoff event published", so all 45 other cases test it.
- **Q8** **Resolved 2026-10-24 (accepted as proposed).** Which model is the target measured on? _Proposed:_ the configured LM Studio model
  (`qwen/qwen3-30b-a3b-2507`), as in 011. The same command works with `ASSISTANT_PROVIDER=anthropic` once credits
  exist.
- **Q9** **Resolved 2026-10-24 (accepted as proposed).** What can feedback hold? _Proposed:_ up or down only, changeable, the last one kept.
  No free-text comment (it would be customer text leaving the chat). Ratings are kept as long as the conversation.
- **Q10** **Resolved 2026-10-24 (accepted as proposed).** Does the interaction event carry a user ID? The design doc says "anonymised".
  _Proposed:_ no user ID at all. Conversations are counted by conversation ID; per-user analysis is not needed
  now.
- **Q11** **Resolved 2026-10-24 (accepted as proposed).** What reads the analytics events? _Proposed:_ no new service. A command-line report
  reads both topics from the start and prints the totals (AC-13). Token counts only, no currency: the local model
  costs nothing, and Claude prices can be added when it is used.
- **Q12** **Resolved 2026-10-24 (accepted as proposed).** Should a per-user daily token budget (design doc §6) come with this feature?
  _Proposed:_ no, it goes to the backlog; the hourly message limit already bounds spend, and there is no paid
  model in use.

## Changelog

- 2026-10-24 — Created.
- 2026-10-24 — Q1–Q12 accepted as proposed by RVicky172; status → Approved (D-023).
- 2026-10-24 — Plan review: AC-3 rules check tool names only, not tool arguments (D-024, plan §3.2).
- 2026-10-24 — Plan approved (D-024), tasks written; status → In Progress.
