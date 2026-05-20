# Pre-run demo results

Bundled CSVs under `projects/ci-bess-uk/results/pre-run/` and `projects/v2g-uk/results/pre-run/` are shown to **every user** in the results UI as a single simulation **Pre-run (demo)** with two runs in the parameter picker (with / without PV and consumption). They are not tied to a guest workspace.

Regenerate after changing shared parameters:

```bash
node scripts/generate-pre-run-results.mjs
```

This deletes other result CSVs in the repo and guest `.data/workspaces`, then runs four optimisations (BESS/V2G × with/without PV and consumption) for **2024-01-01 → 2026-05-01** with identical demo tariffs, BESS sizing, and V2G schedule.

**Demo DUoS (see `generate-pre-run-results.mjs`):** NEC £70/MWh on import; green 1 / −1, amber 10 / −10, red 60 / −60 £/MWh. Weekends all green. Weekdays green except amber 07:00–21:30 and red 16:00–19:30.
