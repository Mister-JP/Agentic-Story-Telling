# Editor App Frontend

Developer README for the React/Vite story editor in `frontend/editor-app`.

## What this app does

This frontend is a browser-first writing workspace for story drafts plus an early world-model sync flow.

- Write and organize story files in a local workspace tree.
- Persist workspace state, world-model data, and sync metadata in browser local storage.
- Import and export project archives as zip files.
- Trigger a backend contract check for world-model sync from the World mode sidebar.

## Stack

- React 18
- Vite 6
- Mantine 8
- Vitest for unit tests
- Playwright for end-to-end coverage

## Prerequisites

Use a current Node.js LTS release and `npm`.

## Local setup

```bash
cd frontend/editor-app
npm install
npm run dev
```

The Vite dev server runs at [http://localhost:5173](http://localhost:5173).

## Backend integration

The frontend talks to the backend through `src/utils/agentApi.js`.

- Default API base URL: `http://localhost:8000`
- Override with: `VITE_BACKEND_API_BASE`
- Current UI integration: `POST /harness/events-index/propose`

Example:

```bash
cd frontend/editor-app
VITE_BACKEND_API_BASE=http://localhost:8000 npm run dev
```

If you want to test the sync button against a live backend, start the FastAPI service separately from `backend/`.

## Scripts

- `npm run dev`: start the Vite dev server
- `npm run build`: create a production build
- `npm run preview`: preview the production build locally
- `npm run lint`: run ESLint
- `npm run test`: run unit tests once with Vitest
- `npm run test:watch`: run Vitest in watch mode
- `npm run test:coverage`: generate coverage output
- `npm run test:e2e`: run Playwright end-to-end tests

## Project structure

- `src/App.jsx`: app shell, local-storage state, workspace actions, world sync trigger
- `src/components/`: editor UI, workspace tree, world sidebar, detail panes, dialogs
- `src/data/initialTree.js`: starter workspace content
- `src/utils/tree.js`: workspace tree mutation helpers
- `src/utils/projectArchive.js`: zip import/export and archive validation
- `src/utils/worldSync.js`: diff creation and sync CTA logic
- `src/utils/agentApi.js`: backend request wrapper and typed error handling
- `tests/unit/`: unit coverage for core helpers and UI behavior
- `tests/e2e/`: browser flows with Playwright

## Local data model

The app stores its working state in browser local storage under these keys:

- `editor-app-workspace-v1`
- `editor-app-world-model-v1`
- `editor-app-sync-state-v1`

Resetting browser storage clears the local workspace unless you export it first.

## Testing notes

Unit tests:

```bash
cd frontend/editor-app
npm run test
```

End-to-end tests:

```bash
cd frontend/editor-app
npm run test:e2e
```

Playwright starts the Vite dev server automatically. The current world-sync E2E coverage intercepts backend requests in the browser, so those tests do not require the FastAPI backend to be running.

## Current implementation scope

The frontend world-sync UI is intentionally narrow right now.

- It builds a combined diff from changed story files.
- It sends that diff to the backend events-index propose endpoint.
- It shows success or error status back in the app.

The richer apply/detail backend routes exist, but they are not yet wired into the frontend flow.
