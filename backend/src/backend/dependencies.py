from __future__ import annotations

from functools import lru_cache
import os
from pathlib import Path

from dotenv import load_dotenv

from backend.runtime_settings import RuntimeLlmSettingsStore
from backend.schemas import BackendMode
from backend.services.detail_review import OpenAICompatibleDetailProposalProvider
from backend.services.harness_service import HarnessService, RealHarnessService, StubHarnessService


load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)


@lru_cache(maxsize=1)
def get_runtime_llm_settings_store() -> RuntimeLlmSettingsStore:
    return RuntimeLlmSettingsStore()


@lru_cache(maxsize=1)
def get_harness_service() -> HarnessService:
    runtime_settings_store = get_runtime_llm_settings_store()
    if runtime_settings_store.has_override():
        runtime_settings = runtime_settings_store.get()
        backend_mode = runtime_settings.backend_mode.value
        if backend_mode == BackendMode.STUB.value:
            return StubHarnessService()
        if backend_mode == BackendMode.REAL.value:
            return RealHarnessService(
                detail_proposal_provider=OpenAICompatibleDetailProposalProvider.from_settings(
                    api_key=runtime_settings.api_key,
                    base_url=runtime_settings.base_url,
                    model=runtime_settings.model,
                    timeout_seconds=runtime_settings.timeout_seconds,
                    max_tokens=runtime_settings.max_tokens,
                )
            )
        raise NotImplementedError(
            f"WORLD_MODEL_BACKEND_MODE={backend_mode!r} is not implemented. Supported values are 'stub' and 'real'."
        )

    backend_mode = os.getenv("WORLD_MODEL_BACKEND_MODE", "stub").strip().lower()
    if backend_mode == BackendMode.STUB.value:
        return StubHarnessService()
    if backend_mode == BackendMode.REAL.value:
        return RealHarnessService(
            detail_proposal_provider=OpenAICompatibleDetailProposalProvider.from_env()
        )
    raise NotImplementedError(
        f"WORLD_MODEL_BACKEND_MODE={backend_mode!r} is not implemented. Supported values are 'stub' and 'real'."
    )
