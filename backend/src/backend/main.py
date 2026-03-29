from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.errors import ApiError, build_internal_error
from backend.logging_utils import (
    REQUEST_ID_HEADER,
    configure_logging,
    format_log_event,
    log_event,
    reset_request_id,
    set_request_id,
)
from backend.routes.element_detail import router as element_detail_router
from backend.routes.elements_index import router as elements_index_router
from backend.routes.event_detail import router as event_detail_router
from backend.routes.events_index import router as events_index_router
from backend.routes.settings import router as settings_router
from backend.schemas import ErrorResponse

LOCALHOST_ORIGIN_REGEX = r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title="Agentic Story Telling Backend", version="0.1.0")
    configure_cors(app)
    configure_request_context(app)
    configure_exception_handlers(app)
    register_routes(app)
    return app


def configure_cors(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[],
        allow_origin_regex=LOCALHOST_ORIGIN_REGEX,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )


def configure_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, handle_api_error)
    app.add_exception_handler(RequestValidationError, handle_request_validation_error)
    app.add_exception_handler(Exception, handle_unexpected_error)


def register_routes(app: FastAPI) -> None:
    app.include_router(settings_router)
    app.include_router(events_index_router)
    app.include_router(elements_index_router)
    app.include_router(element_detail_router)
    app.include_router(event_detail_router)


def configure_request_context(app: FastAPI) -> None:
    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        incoming_request_id = (request.headers.get(REQUEST_ID_HEADER, "") or "").strip()
        request_id = incoming_request_id or uuid4().hex[:12]
        request.state.request_id = request_id
        token = set_request_id(request_id)
        try:
            response = await call_next(request)
        finally:
            reset_request_id(token)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response


def handle_api_error(request: Request, error: ApiError) -> JSONResponse:
    log_level = logging.ERROR if error.status_code >= 500 else logging.WARNING
    log_event(
        logger,
        log_level,
        "api_error",
        method=request.method,
        path=request.url.path,
        status_code=error.status_code,
        error_code=error.error,
        retryable=error.retryable,
        details=error.details,
    )
    error_response = ErrorResponse(
        error=error.error,
        message=error.message,
        retryable=error.retryable,
        details=error.details,
    )
    return JSONResponse(status_code=error.status_code, content=error_response.model_dump())


def handle_request_validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
    log_event(
        logger,
        logging.WARNING,
        "validation_error",
        method=request.method,
        path=request.url.path,
        status_code=422,
        details=error.errors(),
    )
    error_response = ErrorResponse(
        error="validation_error",
        message="Request payload validation failed.",
        retryable=False,
        details=error.errors(),
    )
    return JSONResponse(status_code=422, content=error_response.model_dump())


def handle_unexpected_error(request: Request, error: Exception) -> JSONResponse:
    logger.exception(
        "Unhandled unexpected error while processing request. %s",
        format_log_event(
            "unexpected_error",
            method=request.method,
            path=request.url.path,
            error_type=type(error).__name__,
        ),
        exc_info=(type(error), error, error.__traceback__),
    )
    internal_error = build_internal_error()
    error_response = ErrorResponse(
        error=internal_error.error,
        message=internal_error.message,
        retryable=internal_error.retryable,
        details=None,
    )
    return JSONResponse(status_code=internal_error.status_code, content=error_response.model_dump())


app = create_app()
