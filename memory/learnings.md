# Learnings & Gotchas

Non-obvious facts discovered while building. Keep entries short; group by topic (`## <Topic>`). Add one when
something cost more than ~10 minutes or the fix was non-obvious. Delete entries that become wrong.

## Docker & environment

- `.env` is read when a container is created. After changing a variable, rebuild every service that reads it.
  `INTERNAL_SERVICE_TOKEN` is read by all services; rebuilding only the assistant made it reject the gateway
  ("Internal service token required").
- From inside Docker, the host machine (e.g. LM Studio on :1234) is `host.docker.internal`; the assistant's
  compose entry adds `extra_hosts: host-gateway` for that.

## Data access

- `GET /api/v1/orders/:id` and `GET /api/v1/payments/:orderId` return any record by ID without checking the
  owner. The assistant checks `user_id` itself (`getOwnOrder`); browser callers stay exposed until feature 002.
- Product search (`?search=`) matches the product name only; the assistant filters the full catalog in memory.

## Assistant / LLM

- Claude: forced `tool_choice` returns 400 on current models, and history must stay append-only (never edit
  earlier turns), so long conversations are capped instead of trimmed.
- Local models (Qwen etc.) write `<think>…</think>` and markdown despite instructions; the OpenAI-compatible
  provider strips reasoning and the chat renders `**bold**` safely.
