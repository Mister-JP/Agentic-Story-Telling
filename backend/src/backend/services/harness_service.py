from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from backend.schemas import (
    ElementDetailProposeRequest,
    ElementDetailProposeResponse,
    ElementsIndexApplyRequest,
    ElementsIndexApplyResponse,
    ElementsIndexProposeRequest,
    ElementsIndexProposeResponse,
    EventDetailProposeRequest,
    EventDetailProposeResponse,
    EventsIndexApplyRequest,
    EventsIndexApplyResponse,
    EventsIndexProposeRequest,
    EventsIndexProposeResponse,
)
from backend.services.elements_index_logic import (
    apply_elements_proposal,
    propose_elements_index_with_audit,
)
from backend.services.stub_payloads import (
    build_element_detail_result,
    build_event_detail_result,
    build_events_apply_result,
    build_stub_event_agent_output,
)
from backend.temp_storage import LayerContent, validate_layer_name


class HarnessService(Protocol):
    def propose_events_index(self, request: EventsIndexProposeRequest) -> EventsIndexProposeResponse: ...

    def apply_events_index(self, request: EventsIndexApplyRequest) -> EventsIndexApplyResponse: ...

    def propose_elements_index(self, request: ElementsIndexProposeRequest) -> ElementsIndexProposeResponse: ...

    def apply_elements_index(self, request: ElementsIndexApplyRequest) -> ElementsIndexApplyResponse: ...

    def propose_element_detail(self, request: ElementDetailProposeRequest) -> ElementDetailProposeResponse: ...

    def propose_event_detail(self, request: EventDetailProposeRequest) -> EventDetailProposeResponse: ...


@dataclass(slots=True)
class StubHarnessService:
    def propose_events_index(self, request: EventsIndexProposeRequest) -> EventsIndexProposeResponse:
        proposal = build_stub_event_agent_output(request.diff_text)
        return EventsIndexProposeResponse(proposal=proposal)

    def apply_events_index(self, request: EventsIndexApplyRequest) -> EventsIndexApplyResponse:
        apply_result = build_events_apply_result(request.events_md, request.proposal)
        normalized_content = normalize_layer_content("events", apply_result.index_markdown, apply_result.detail_files)
        return EventsIndexApplyResponse(
            events_md=normalized_content.index_markdown,
            detail_files=normalized_content.detail_files,
            actions=apply_result.actions,
        )

    def propose_elements_index(self, request: ElementsIndexProposeRequest) -> ElementsIndexProposeResponse:
        proposal = propose_elements_index_with_audit(
            request.diff_text,
            request.elements_md,
            request.history,
        )
        return ElementsIndexProposeResponse(proposal=proposal)

    def apply_elements_index(self, request: ElementsIndexApplyRequest) -> ElementsIndexApplyResponse:
        apply_result = apply_elements_proposal(request.elements_md, request.proposal)
        normalized_content = normalize_layer_content("elements", apply_result.index_markdown, apply_result.detail_files)
        return ElementsIndexApplyResponse(
            elements_md=normalized_content.index_markdown,
            detail_files=normalized_content.detail_files,
            actions=apply_result.actions,
        )

    def propose_element_detail(self, request: ElementDetailProposeRequest) -> ElementDetailProposeResponse:
        proposal, detail_result = build_element_detail_result(
            request.target,
            request.current_detail_md,
            request.elements_md,
        )
        normalized_detail_markdown = normalize_detail_markdown("elements", request.target.uuid, detail_result.updated_detail_markdown)
        return ElementDetailProposeResponse(
            proposal=proposal,
            preview_diff=detail_result.preview_diff,
            updated_detail_md=normalized_detail_markdown,
        )

    def propose_event_detail(self, request: EventDetailProposeRequest) -> EventDetailProposeResponse:
        proposal, detail_result = build_event_detail_result(
            request.target,
            request.current_detail_md,
            request.events_md,
        )
        normalized_detail_markdown = normalize_detail_markdown("events", request.target.uuid, detail_result.updated_detail_markdown)
        return EventDetailProposeResponse(
            proposal=proposal,
            preview_diff=detail_result.preview_diff,
            updated_detail_md=normalized_detail_markdown,
        )


def normalize_layer_content(layer_name: str, index_markdown: str, detail_files: dict[str, str]) -> LayerContent:
    validate_layer_name(layer_name)
    # The storage round-trip only validated the layer name and made detail-file order deterministic.
    return LayerContent(
        index_markdown=index_markdown,
        detail_files={detail_uuid: detail_files[detail_uuid] for detail_uuid in sorted(detail_files)},
    )


def normalize_detail_markdown(layer_name: str, detail_uuid: str, detail_markdown: str) -> str:
    validate_layer_name(layer_name)
    return detail_markdown
