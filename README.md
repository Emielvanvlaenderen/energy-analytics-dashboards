# Energy Analytics Dashboards

Multi-platform web UI for energy analytics workflows. Each solution lives in its own folder under `projects/`.

## Structure

```
web/                          — shared React app (home + routing)
projects/
  ci-bess-uk/                 — C&I BESS simulator (UK) — active
    data/
    optimisation/
    results/
  v2g-uk/                     — V2G charging (UK) — coming soon
  benelux-ancillary/          — BENELUX ancillary — work in progress
```

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 — pick a platform on the home page.

API routes are scoped per project: `/api/projects/{projectId}/...`

## Add a new platform

1. Create `projects/my-platform/` with `data/`, `optimisation/`, `results/`, and `project.json`.
2. Register it in `web/server/projectsRegistry.mjs` and `web/src/platforms/registry.js`.
3. Add routes in `web/src/SolutionRoutes.jsx` (or a dedicated `*Routes.jsx` module).
4. Wire API handlers in `web/server/projectApiRouter.mjs` as needed.

## C&I BESS (UK)

Workflow: Grid tariffs → Site data → BESS simulation → Results.

Legacy URLs (`/bess-simulation`, `/results`, etc.) redirect to `/solutions/ci-bess-uk/...`.
