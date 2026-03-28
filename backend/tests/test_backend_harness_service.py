from __future__ import annotations

import pytest

from backend.schemas import EventAgentOutput, EventsIndexProposeRequest
from backend.services.harness_service import normalize_detail_markdown, normalize_layer_content


def test_normalize_layer_content_sorts_detail_files_without_disk_round_trip() -> None:
    normalized_content = normalize_layer_content(
        "events",
        "# Events",
        {
            "evt_b": "# Event B",
            "evt_a": "# Event A",
        },
    )

    assert normalized_content.index_markdown == "# Events"
    assert list(normalized_content.detail_files) == ["evt_a", "evt_b"]


def test_normalize_layer_content_rejects_unknown_layers() -> None:
    with pytest.raises(ValueError, match="Unsupported layer"):
        normalize_layer_content("unknown", "", {})


def test_normalize_detail_markdown_validates_layer_and_preserves_content() -> None:
    detail_markdown = "# Element\n\n## Identification\n- UUID: elt_123\n"

    normalized_markdown = normalize_detail_markdown("elements", "elt_123", detail_markdown)

    assert normalized_markdown == detail_markdown


def test_real_harness_service_propose_events_index_delegates_to_provider() -> None:
    from backend.services.harness_service import RealHarnessService

    class RecordingProvider:
        def __init__(self) -> None:
            self.request: EventsIndexProposeRequest | None = None

        def propose_events_index(self, request: EventsIndexProposeRequest) -> EventAgentOutput:
            self.request = request
            return EventAgentOutput(scan_summary="LLM proposal", deltas=[])

        def propose_element_detail(self, request, prompt_context):  # pragma: no cover - protocol filler
            raise AssertionError("Not used in this test")

        def propose_event_detail(self, request, prompt_context):  # pragma: no cover - protocol filler
            raise AssertionError("Not used in this test")

    provider = RecordingProvider()
    service = RealHarnessService(detail_proposal_provider=provider)
    request = EventsIndexProposeRequest(diff_text="+ Mira opens the chapel.", events_md="# Events", history=[])

    response = service.propose_events_index(request)

    assert response.proposal.scan_summary == "LLM proposal"
    assert provider.request == request
