from __future__ import annotations

from contextvars import ContextVar, Token
import json
import logging
import os
from typing import Any

REQUEST_ID_HEADER = "X-Request-ID"
_request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
_DEFAULT_LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"
_TRUNCATED_SUFFIX = "...[truncated]"


def configure_logging() -> None:
    level_name = (os.getenv("WORLD_MODEL_LOG_LEVEL", "INFO").strip() or "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    root_logger = logging.getLogger()

    if not root_logger.handlers:
        logging.basicConfig(level=level, format=_DEFAULT_LOG_FORMAT)

    root_logger.setLevel(level)


def set_request_id(request_id: str) -> Token[str]:
    return _request_id_var.set(request_id or "-")


def reset_request_id(token: Token[str]) -> None:
    _request_id_var.reset(token)


def get_request_id() -> str:
    return _request_id_var.get()


def format_log_event(event: str, **fields: Any) -> str:
    payload: dict[str, Any] = {"event": event, "request_id": get_request_id()}
    payload.update({key: value for key, value in fields.items() if value is not None})
    return " ".join(f"{key}={_serialize_log_value(value)}" for key, value in payload.items())


def log_event(logger: logging.Logger, level: int, event: str, **fields: Any) -> None:
    logger.log(level, format_log_event(event, **fields))


def _serialize_log_value(value: Any) -> str:
    if isinstance(value, str):
        return json.dumps(_truncate(value, max_chars=240))

    if isinstance(value, (bool, int, float)) or value is None:
        return json.dumps(value)

    try:
        serialized = json.dumps(value, ensure_ascii=True, sort_keys=True, default=str)
    except TypeError:
        serialized = json.dumps(str(value), ensure_ascii=True)
    return _truncate(serialized, max_chars=600)


def _truncate(value: str, *, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    cutoff = max_chars - len(_TRUNCATED_SUFFIX)
    if cutoff <= 0:
        return _TRUNCATED_SUFFIX[:max_chars]
    return f"{value[:cutoff]}{_TRUNCATED_SUFFIX}"
