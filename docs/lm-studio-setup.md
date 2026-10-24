# Loading the Local Model in LM Studio

How to load `qwen/qwen3-30b-a3b-2507` for the assistant on the development machine (RTX 5080, 16 GB VRAM) without
slowing the whole PC down. Measured 2026-10-24.

**Short version:** load one copy, with a 16k context and one parallel slot, under a fixed identifier. It then fits
the GPU much better and answers in 0.5–6 s per turn instead of about 115 s.

## Why it hangs

The model is bigger than the GPU, so the load settings decide how much of it spills onto the CPU and system RAM.

| Part       | Development machine                                                              |
| ---------- | -------------------------------------------------------------------------------- |
| GPU        | NVIDIA GeForce RTX 5080, 16 GB VRAM (16,303 MiB)                                 |
| System RAM | 127.4 GB                                                                         |
| Model      | `qwen/qwen3-30b-a3b-2507` (Qwen3 30B-A3B, mixture of experts), 18.56 GB on disk  |
| Used by    | `assistant-service` in Docker, via `http://host.docker.internal:1234/v1`         |

Three things went wrong on 2026-10-24:

- **Default load settings.** `lms load` picked a 51,968-token context and 4 parallel slots. The KV cache for that
  pushes more of the model off the GPU. GPU use was 1% while generating, and a chat turn took 115 s.
- **Two copies loaded.** The first API request auto-loaded (JIT) one copy while `lms load` loaded a second,
  `qwen/qwen3-30b-a3b-2507:2`. Two copies are about 35 GB across VRAM and RAM, which slows the whole PC.
- **Server off.** With the LM Studio server stopped, the assistant can't reach the model at all, and the first
  request after starting it waits about 33 s for the load.

## Load it safely

Run these in a terminal (Git Bash or PowerShell) before starting the Docker stack. `lms` is in
`%USERPROFILE%\.lmstudio\bin`.

1. Start the server (it does nothing if it is already running):

   ```bash
   lms server start
   ```

2. Unload everything, so a JIT-loaded copy can't sit next to the new one:

   ```bash
   lms unload --all
   ```

3. Load one copy with the settings that fit:

   ```bash
   lms load qwen/qwen3-30b-a3b-2507 -c 16384 --parallel 1 --identifier qwen/qwen3-30b-a3b-2507 -y
   ```

4. Check that exactly one copy is loaded (next section), then start the stack: `docker compose up -d`.

The load takes about 33 s. Don't send chat requests while it runs, or LM Studio may JIT-load a second copy.

## What each setting does

| Flag                  | Value                     | Default it replaces            | Why |
| --------------------- | ------------------------- | ------------------------------ | --- |
| `-c` (context length) | 16384                     | 51,968                         | The KV cache grows with context. 16k holds the system prompt, store policies, tool results and a long chat, and leaves VRAM for the weights. |
| `--parallel`          | 1                         | 4                              | Each slot reserves its own cache. The assistant runs one turn at a time locally, so extra slots only waste VRAM. |
| `--identifier`        | `qwen/qwen3-30b-a3b-2507` | auto (`…:2` for a second copy) | A fixed name, so the assistant's "first model" lookup finds this copy and no `:2` copy appears. |
| `--gpu`               | not set (automatic)       | automatic                      | LM Studio splits layers between GPU and CPU. Use `--gpu 0.8` if the PC still lags (lower = less VRAM, slower replies). |
| `--ttl`               | not set                   | none                           | Optional: `--ttl 3600` unloads the model after an hour idle, freeing about 17 GB. The next request reloads it (~33 s). |

If replies get cut off in long chats, try `-c 24576`. If the PC lags during replies, go back to 16384 or lower
`--gpu`.

## Check it worked

| Check                    | Command                                                         | Good result (measured 2026-10-24) |
| ------------------------ | --------------------------------------------------------------- | --------------------------------- |
| One copy loaded          | `lms ps`                                                        | One row: `qwen/qwen3-30b-a3b-2507`, context 16384, parallel 1. No `:2` row. |
| GPU memory               | `nvidia-smi --query-gpu=memory.used,memory.total --format=csv`  | About 13,700 of 16,303 MiB used, so not full. |
| GPU busy while replying  | `nvidia-smi` during a chat                                      | Well above 1%. Near 1% means it is running on the CPU. |
| Assistant sees it        | `curl localhost:4008/health`                                    | `"model":"qwen/qwen3-30b-a3b-2507"`, `"configured":true` |
| Speed                    | ask the storefront assistant something                          | 0.5–6 s per turn (with the default settings: about 115 s) |

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| PC freezes or lags while the model is loaded | `lms ps`. Two rows means a duplicate: `lms unload "qwen/qwen3-30b-a3b-2507:2"`. Still slow: reload with `--gpu 0.8`. |
| Replies take minutes | Probably loaded with the defaults (for example auto-loaded by the first request). Run steps 2–3 of "Load it safely" again. |
| Assistant errors; `curl -m 5 localhost:1234/v1/models` returns nothing | The server is off: `lms server start`, then load. |
| Done for the day, or need the VRAM for something else | `lms unload --all` frees it. `lms server stop` stops the server too. |
| Loading from the LM Studio app instead of the terminal | In the load dialog, set the context length to 16384 and parallel predictions to 1, and load only when `lms ps` shows nothing loaded. |
