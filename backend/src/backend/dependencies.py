from __future__ import annotations

from functools import lru_cache
import os

from backend.services.harness_service import HarnessService, RealHarnessService, StubHarnessService


@lru_cache(maxsize=1)
def get_harness_service() -> HarnessService:
    backend_mode = os.getenv("WORLD_MODEL_BACKEND_MODE", "stub").strip().lower()
    if backend_mode == "stub":
        return StubHarnessService()
    if backend_mode == "real":
        return RealHarnessService.from_env()
    raise NotImplementedError(
        f"WORLD_MODEL_BACKEND_MODE={backend_mode!r} is not implemented. Supported values are 'stub' and 'real'."
    )
