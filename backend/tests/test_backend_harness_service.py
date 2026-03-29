from __future__ import annotations

import pytest

from backend.schemas import EventAgentOutput, EventsIndexProposeRequest, ElementsIndexProposeRequest, ElementsProposal
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


def test_real_harness_service_propose_elements_index_delegates_to_provider_with_audit_retry() -> None:
    from backend.services.harness_service import RealHarnessService

    class RecordingProvider:
        def __init__(self) -> None:
            self.requests: list[ElementsIndexProposeRequest] = []

        def propose_elements_index(self, request: ElementsIndexProposeRequest) -> ElementsProposal:
            self.requests.append(request)
            if len(self.requests) == 1:
                return ElementsProposal(
                    diff_summary="First pass missed an existing person.",
                    rationale="Initial draft.",
                    identified_elements=[],
                    approval_message="Review the proposal.",
                )

            return ElementsProposal(
                diff_summary="Revised proposal includes the existing person.",
                rationale="Audit feedback incorporated.",
                identified_elements=[
                    {
                        "display_name": "Mira",
                        "kind": "person",
                        "aliases": [],
                        "identification_keys": [],
                        "snapshot": "Mira is explicitly active in the diff.",
                        "update_instruction": "Carry the new manuscript evidence for Mira into detail review.",
                        "evidence_from_diff": ["Mira opens the chapel."],
                        "matched_existing_display_name": "Mira",
                        "matched_existing_uuid": "elt_mira123",
                        "is_new": False,
                    }
                ],
                approval_message="Review the proposal.",
            )

        def propose_events_index(self, request):  # pragma: no cover - protocol filler
            raise AssertionError("Not used in this test")

        def propose_element_detail(self, request, prompt_context):  # pragma: no cover - protocol filler
            raise AssertionError("Not used in this test")

        def propose_event_detail(self, request, prompt_context):  # pragma: no cover - protocol filler
            raise AssertionError("Not used in this test")

    provider = RecordingProvider()
    service = RealHarnessService(detail_proposal_provider=provider)
    request = ElementsIndexProposeRequest(
        diff_text="+ Mira opens the chapel.",
        elements_md="# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | protagonist\n",
        history=[],
    )

    response = service.propose_elements_index(request)

    assert response.proposal.diff_summary == "Revised proposal includes the existing person."
    assert len(provider.requests) == 2
    assert provider.requests[0].history == []
    assert len(provider.requests[1].history) == 1
    assert "Coverage gap" in provider.requests[1].history[0].reviewer_feedback
