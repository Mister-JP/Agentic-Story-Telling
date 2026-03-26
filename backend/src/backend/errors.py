from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class ApiError(Exception):
    error: str
    message: str
    status_code: int
    retryable: bool
    details: Any | None = None


def build_internal_error() -> ApiError:
    return ApiError(
        error="internal_error",
        message="The backend encountered an unexpected error.",
        status_code=500,
        retryable=False,
    )
