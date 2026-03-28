from __future__ import annotations

import re

import pytest

from backend.dependencies import get_harness_service
from backend.errors import ApiError
from backend.services.detail_review import OpenAICompatibleDetailProposalProvider
from backend.services.harness_service import RealHarnessService, StubHarnessService


@pytest.fixture(autouse=True)
def clear_harness_service_cache() -> None:
    get_harness_service.cache_clear()
    yield
    get_harness_service.cache_clear()


def test_get_harness_service_defaults_to_stub(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("WORLD_MODEL_BACKEND_MODE", raising=False)

    service = get_harness_service()

    assert isinstance(service, StubHarnessService)


def test_get_harness_service_raises_for_unimplemented_backend(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WORLD_MODEL_BACKEND_MODE", "other")

    with pytest.raises(
        NotImplementedError,
        match=re.escape(
            "WORLD_MODEL_BACKEND_MODE='other' is not implemented. Supported values are 'stub' and 'real'."
        ),
    ):
        get_harness_service()


def test_get_harness_service_builds_real_mode_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WORLD_MODEL_BACKEND_MODE", "real")
    monkeypatch.setenv("WORLD_MODEL_LLM_API_KEY", "test-key")
    monkeypatch.setenv("WORLD_MODEL_LLM_MODEL", "test-model")
    monkeypatch.setenv("WORLD_MODEL_LLM_BASE_URL", "https://example.com/openai/v1")

    service = get_harness_service()

    assert isinstance(service, RealHarnessService)
    assert isinstance(service.detail_proposal_provider, OpenAICompatibleDetailProposalProvider)
    assert service.detail_proposal_provider.api_key == "test-key"
    assert service.detail_proposal_provider.model == "test-model"
    assert service.detail_proposal_provider.base_url == "https://example.com/openai/v1"
    assert service.detail_proposal_provider.timeout_seconds == 120


def test_get_harness_service_raises_api_error_for_missing_llm_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WORLD_MODEL_BACKEND_MODE", "real")
    monkeypatch.delenv("WORLD_MODEL_LLM_API_KEY", raising=False)
    monkeypatch.delenv("WORLD_MODEL_LLM_MODEL", raising=False)

    with pytest.raises(ApiError) as exc_info:
        get_harness_service()

    assert exc_info.value.error == "llm_configuration_error"
    assert exc_info.value.status_code == 500
    assert exc_info.value.retryable is False
    assert "WORLD_MODEL_LLM_API_KEY" in exc_info.value.message
    assert "WORLD_MODEL_LLM_MODEL" in exc_info.value.message


def test_get_harness_service_rejects_unsafe_llm_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WORLD_MODEL_BACKEND_MODE", "real")
    monkeypatch.setenv("WORLD_MODEL_LLM_API_KEY", "test-key")
    monkeypatch.setenv("WORLD_MODEL_LLM_MODEL", "test-model")
    monkeypatch.setenv("WORLD_MODEL_LLM_BASE_URL", "http://localhost:8000/openai/v1")

    with pytest.raises(ApiError) as exc_info:
        get_harness_service()

    assert exc_info.value.error == "llm_configuration_error"
    assert exc_info.value.status_code == 500
    assert exc_info.value.retryable is False
    assert "absolute https URL" in exc_info.value.message or "must not target localhost" in exc_info.value.message
