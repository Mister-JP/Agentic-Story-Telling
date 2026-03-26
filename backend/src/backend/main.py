from __future__ import annotations

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.errors import ApiError, build_internal_error
from backend.routes.element_detail import router as element_detail_router
from backend.routes.elements_index import router as elements_index_router
from backend.routes.event_detail import router as event_detail_router
from backend.routes.events_index import router as events_index_router
from backend.schemas import ErrorResponse

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def create_app() -> FastAPI:
    app = FastAPI(title="Agentic Story Telling Backend", version="0.1.0")
    configure_cors(app)
    configure_exception_handlers(app)
    register_routes(app)
    return app


def configure_cors(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )


def configure_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, handle_api_error)
    app.add_exception_handler(RequestValidationError, handle_request_validation_error)
    app.add_exception_handler(Exception, handle_unexpected_error)


def register_routes(app: FastAPI) -> None:
    app.include_router(events_index_router)
    app.include_router(elements_index_router)
    app.include_router(element_detail_router)
    app.include_router(event_detail_router)


def handle_api_error(_, error: ApiError) -> JSONResponse:
    error_response = ErrorResponse(
        error=error.error,
        message=error.message,
        retryable=error.retryable,
        details=error.details,
    )
    return JSONResponse(status_code=error.status_code, content=error_response.model_dump())


def handle_request_validation_error(_, error: RequestValidationError) -> JSONResponse:
    error_response = ErrorResponse(
        error="validation_error",
        message="Request payload validation failed.",
        retryable=False,
        details=error.errors(),
    )
    return JSONResponse(status_code=422, content=error_response.model_dump())


def handle_unexpected_error(_, __: Exception) -> JSONResponse:
    internal_error = build_internal_error()
    error_response = ErrorResponse(
        error=internal_error.error,
        message=internal_error.message,
        retryable=internal_error.retryable,
        details=None,
    )
    return JSONResponse(status_code=internal_error.status_code, content=error_response.model_dump())


app = create_app()
