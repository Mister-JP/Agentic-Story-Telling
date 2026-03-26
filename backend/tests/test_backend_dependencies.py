from __future__ import annotations

import pytest

from backend.dependencies import get_harness_service
from backend.services.harness_service import StubHarnessService


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
    monkeypatch.setenv("WORLD_MODEL_BACKEND_MODE", "real")

    with pytest.raises(NotImplementedError, match="Only 'stub' is currently supported"):
        get_harness_service()
