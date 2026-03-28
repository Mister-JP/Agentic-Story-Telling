from __future__ import annotations

import re

import pytest

from backend.dependencies import get_harness_service
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


def test_get_harness_service_rejects_unsafe_llm_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WORLD_MODEL_BACKEND_MODE", "real")
    monkeypatch.setenv("WORLD_MODEL_LLM_API_KEY", "test-key")
    monkeypatch.setenv("WORLD_MODEL_LLM_MODEL", "test-model")
    monkeypatch.setenv("WORLD_MODEL_LLM_BASE_URL", "http://localhost:8000/openai/v1")

    with pytest.raises(ValueError, match="absolute https URL|must not target localhost"):
        get_harness_service()
