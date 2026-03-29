from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from backend.dependencies import get_harness_service, get_runtime_llm_settings_store
from backend.runtime_settings import RuntimeLlmSettingsStore
from backend.schemas import LlmSettingsResponse, LlmSettingsUpdateRequest

router = APIRouter(prefix="/harness/settings", tags=["settings"])


@router.get("/llm", response_model=LlmSettingsResponse)
def get_llm_settings(
    settings_store: Annotated[RuntimeLlmSettingsStore, Depends(get_runtime_llm_settings_store)],
) -> LlmSettingsResponse:
    return settings_store.get().to_response()


@router.post("/llm", response_model=LlmSettingsResponse)
def update_llm_settings(
    request: LlmSettingsUpdateRequest,
    settings_store: Annotated[RuntimeLlmSettingsStore, Depends(get_runtime_llm_settings_store)],
) -> LlmSettingsResponse:
    next_settings = settings_store.update(request)
    get_harness_service.cache_clear()
    return next_settings.to_response()
