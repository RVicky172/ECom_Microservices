---
description: Run the Definition of Done for a feature and update docs and memory
argument-hint: <NNN>
---

Verify feature $ARGUMENTS against the Definition of Done in `specs/constitution.md`.

1. Run every gate command in the Definition of Done (`npm run check`, `npm run build`); report results honestly, including flaky or
   skipped tests.
2. Check every acceptance criterion in `spec.md` against its test or recorded measurement; tick only the ones
   proven, in `spec.md` and `feature.json` (`done: true`). If an AC has no real proof, add the missing test or say so — don't tick it.
3. If all pass: set spec Status to `Implemented` (`"implemented"`, `stage: "verified"` in `feature.json`) and
   the roadmap status to ✔️ (`"done"` in `roadmap.json`); note a completed phase. Re-run `npm run check`.
4. Add a `memory/progress.md` entry and update "Current State" in `memory/MEMORY.md` (next feature from the roadmap).
5. Report anything that failed or was skipped.
