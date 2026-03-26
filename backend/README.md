# Backend Service

Developer README for the FastAPI backend in `backend/`.

## What this service does

This backend exposes the contract used by the story editor's world-model sync flows.

- Validates request and response shapes with Pydantic models.
- Returns deterministic stub payloads so the frontend can integrate against stable API contracts.
- Normalizes index/detail markdown updates for events and elements.
- Wraps failures in a shared structured error envelope.

## Current status

Only stub mode is implemented today.

- `WORLD_MODEL_BACKEND_MODE=stub` works
- any other mode currently raises `NotImplementedError`

The frontend currently calls only `POST /harness/events-index/propose`, but the remaining routes are already scaffolded for later integration.

## Stack

- Python 3.10+
- FastAPI
- Pydantic v2
- Uvicorn
- Pytest

## Local setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e ".[test]"
```

## Run the API

```bash
cd backend
source .venv/bin/activate
WORLD_MODEL_BACKEND_MODE=stub uvicorn backend.main:app --reload
```

Service URLs after startup:

- API root: [http://localhost:8000](http://localhost:8000)
- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

## Frontend compatibility

The service currently enables CORS for:

- `http://localhost:5173`
- `http://127.0.0.1:5173`

If you move the frontend to another origin, update `ALLOWED_ORIGINS` in `src/backend/main.py`.

## Environment variables

- `WORLD_MODEL_BACKEND_MODE`: backend implementation selector. Defaults to `stub`.

## API surface

All endpoints are `POST` routes under `/harness`.

- `/harness/events-index/propose`: analyze a diff and return an events proposal
- `/harness/events-index/apply`: apply an events proposal to index/detail markdown
- `/harness/elements-index/propose`: analyze a diff and return an elements proposal
- `/harness/elements-index/apply`: apply an elements proposal to index/detail markdown
- `/harness/element-detail/propose`: propose an update for one element detail file
- `/harness/event-detail/propose`: propose an update for one event detail file

Request and response contracts live in `src/backend/schemas.py`.

## Error contract

Failures are returned in a shared JSON shape:

```json
{
  "error": "validation_error",
  "message": "Request payload validation failed.",
  "retryable": false,
  "details": []
}
```

The frontend client expects this envelope when it maps backend failures into `ApiClientError`.

## Project structure

- `src/backend/main.py`: app factory, CORS, exception handling, route registration
- `src/backend/routes/`: FastAPI route modules
- `src/backend/dependencies.py`: service selection by environment
- `src/backend/services/harness_service.py`: service protocol plus stub implementation
- `src/backend/services/stub_payloads.py`: deterministic stub proposal/apply helpers
- `src/backend/index_markdown.py`: markdown parsing and rendering helpers
- `src/backend/temp_storage.py`: layer validation and normalization utilities
- `tests/`: API, schema, dependency, storage, and story-fixture coverage

## Testing

From the repo root:

```bash
pytest
```

Or from inside `backend/`:

```bash
python -m pytest tests
```

The backend tests also read real markdown fixtures from the repo's `story/` directory, so they act as both contract tests and regression guards for the current story data.

## Useful implementation notes

- The stub responses are deterministic on purpose so frontend tests can assert exact payload shapes.
- Field ordering for rendered event indexes is shared with the frontend sync helpers.
- Validation is strict: models forbid unknown fields and sanitize empty string inputs where appropriate.
