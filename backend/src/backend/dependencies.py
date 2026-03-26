from __future__ import annotations

from functools import lru_cache
import os

from backend.services.harness_service import HarnessService, StubHarnessService


@lru_cache(maxsize=1)
def get_harness_service() -> HarnessService:
    backend_mode = os.getenv("WORLD_MODEL_BACKEND_MODE", "stub").strip().lower()
    if backend_mode == "stub":
        return StubHarnessService()
    raise NotImplementedError(
        f"WORLD_MODEL_BACKEND_MODE={backend_mode!r} is not implemented. Only 'stub' is currently supported."
    )
