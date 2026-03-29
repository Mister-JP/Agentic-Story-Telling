from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Protocol, runtime_checkable

from backend.index_markdown import parse_index_markdown
from backend.logging_utils import log_event
from backend.schemas import (
    DetailTarget,
    ElementProposalAction,
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
from backend.services.detail_review import (
    DetailProposalProvider,
    OpenAICompatibleDetailProposalProvider,
    build_element_detail_response,
    build_element_prompt_context,
    build_event_detail_response,
    build_event_prompt_context,
)
from backend.services.elements_index_logic import (
    apply_elements_proposal,
    propose_elements_index_with_audit,
)
from backend.services.provenance import scan_impacted_detail_files
from backend.services.stub_payloads import (
    build_element_detail_result,
    build_event_detail_result,
    build_events_apply_result,
    build_stub_event_agent_output,
)
from backend.temp_storage import LayerContent, validate_layer_name

ELEMENT_FIELD_NAMES = ["kind", "display_name", "uuid", "aliases", "identification_keys"]
EVENT_FIELD_NAMES = ["uuid", "when", "chapters", "summary"]
logger = logging.getLogger(__name__)


@runtime_checkable
class HarnessService(Protocol):
    def propose_events_index(self, request: EventsIndexProposeRequest) -> EventsIndexProposeResponse: ...

    def apply_events_index(self, request: EventsIndexApplyRequest) -> EventsIndexApplyResponse: ...

    def propose_elements_index(self, request: ElementsIndexProposeRequest) -> ElementsIndexProposeResponse: ...

    def apply_elements_index(self, request: ElementsIndexApplyRequest) -> ElementsIndexApplyResponse: ...

    def propose_element_detail(self, request: ElementDetailProposeRequest) -> ElementDetailProposeResponse: ...

    def propose_event_detail(self, request: EventDetailProposeRequest) -> EventDetailProposeResponse: ...


def _log_success(event: str, *, backend_mode: str, **fields) -> None:
    log_event(logger, logging.INFO, event, backend_mode=backend_mode, **fields)


def normalize_lookup(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


def parse_entries(markdown: str, field_names: list[str]) -> list[dict[str, str]]:
    return parse_index_markdown(markdown, field_names).entries


def get_added_entries(before_markdown: str, after_markdown: str, field_names: list[str]) -> list[dict[str, str]]:
    before_entries = parse_entries(before_markdown, field_names)
    after_entries = parse_entries(after_markdown, field_names)
    before_uuids = {entry.get("uuid", "") for entry in before_entries}
    return [entry for entry in after_entries if entry.get("uuid", "") not in before_uuids]


def build_event_target_summary(uuid: str, before_markdown: str, after_markdown: str, fallback_summary: str) -> str:
    for entry in parse_entries(after_markdown, EVENT_FIELD_NAMES) + parse_entries(before_markdown, EVENT_FIELD_NAMES):
        if entry.get("uuid") == uuid:
            return entry.get("summary", "") or fallback_summary or uuid
    return fallback_summary or uuid


def build_element_target_summary(uuid: str, before_markdown: str, after_markdown: str, fallback_summary: str) -> tuple[str, str | None]:
    for entry in parse_entries(after_markdown, ELEMENT_FIELD_NAMES) + parse_entries(before_markdown, ELEMENT_FIELD_NAMES):
        if entry.get("uuid") == uuid:
            return entry.get("display_name", "") or fallback_summary or uuid, entry.get("kind") or None
    return fallback_summary or uuid, None


def resolve_created_event_uuid(delta, added_entries: list[dict[str, str]], claimed_uuids: set[str]) -> str | None:
    for entry in added_entries:
        uuid = entry.get("uuid", "")
        if uuid in claimed_uuids:
            continue
        if (
            normalize_lookup(entry.get("summary")) == normalize_lookup(delta.summary)
            and normalize_lookup(entry.get("when")) == normalize_lookup(delta.when)
            and normalize_lookup(entry.get("chapters")) == normalize_lookup(delta.chapters)
        ):
            return uuid

    best_uuid: str | None = None
    best_score = -1
    for entry in added_entries:
        uuid = entry.get("uuid", "")
        if uuid in claimed_uuids:
            continue
        score = 0
        if normalize_lookup(entry.get("summary")) == normalize_lookup(delta.summary):
            score += 1
        if normalize_lookup(entry.get("when")) == normalize_lookup(delta.when):
            score += 1
        if normalize_lookup(entry.get("chapters")) == normalize_lookup(delta.chapters):
            score += 1
        if score > best_score:
            best_uuid = uuid
            best_score = score
    return best_uuid


def resolve_created_element_uuid(decision, added_entries: list[dict[str, str]], claimed_uuids: set[str]) -> str | None:
    for entry in added_entries:
        uuid = entry.get("uuid", "")
        if uuid in claimed_uuids:
            continue
        if (
            normalize_lookup(entry.get("display_name")) == normalize_lookup(decision.display_name)
            and normalize_lookup(entry.get("kind")) == normalize_lookup(str(decision.kind))
        ):
            return uuid

    best_uuid: str | None = None
    best_score = -1
    for entry in added_entries:
        uuid = entry.get("uuid", "")
        if uuid in claimed_uuids:
            continue
        score = 0
        if normalize_lookup(entry.get("display_name")) == normalize_lookup(decision.display_name):
            score += 1
        if normalize_lookup(entry.get("kind")) == normalize_lookup(str(decision.kind)):
            score += 1
        if score > best_score:
            best_uuid = uuid
            best_score = score
    return best_uuid


def annotate_event_proposal_with_impacts(proposal, current_detail_files: dict[str, str], diff_text: str):
    impacts = scan_impacted_detail_files(current_detail_files, diff_text)
    deltas = []
    for delta in proposal.deltas:
        if delta.existing_event_uuid and delta.existing_event_uuid in impacts:
            deltas.append(delta.model_copy(update={"provenance_summary": impacts[delta.existing_event_uuid].summary}))
            continue
        deltas.append(delta)
    return proposal.model_copy(update={"deltas": deltas})


def annotate_element_proposal_with_impacts(proposal, current_detail_files: dict[str, str], diff_text: str):
    impacts = scan_impacted_detail_files(current_detail_files, diff_text)
    decisions = []
    for decision in proposal.identified_elements:
        if decision.matched_existing_uuid and decision.matched_existing_uuid in impacts:
            decisions.append(
                decision.model_copy(update={"provenance_summary": impacts[decision.matched_existing_uuid].summary})
            )
            continue
        decisions.append(decision)
    return proposal.model_copy(update={"identified_elements": decisions})


def build_event_detail_targets(
    *,
    previous_events_md: str,
    next_events_md: str,
    proposal,
    current_detail_files: dict[str, str],
    diff_text: str,
) -> list[DetailTarget]:
    impacts = scan_impacted_detail_files(current_detail_files, diff_text)
    added_entries = get_added_entries(previous_events_md, next_events_md, EVENT_FIELD_NAMES)
    claimed_uuids: set[str] = set()
    targets: list[DetailTarget] = []

    for delta in proposal.deltas:
        if delta.action.value == "create":
            resolved_uuid = resolve_created_event_uuid(delta, added_entries, claimed_uuids)
        else:
            resolved_uuid = delta.existing_event_uuid

        if not resolved_uuid:
            continue

        claimed_uuids.add(resolved_uuid)
        impact = impacts.get(resolved_uuid)
        targets.append(
            DetailTarget(
                uuid=resolved_uuid,
                summary=build_event_target_summary(resolved_uuid, previous_events_md, next_events_md, delta.summary),
                file=f"events/{resolved_uuid}.md",
                delta_action=delta.action.value,
                update_context=delta.reason,
                provenance_summary=(impact.summary if impact else delta.provenance_summary),
            )
        )

    for uuid, impact in sorted(impacts.items()):
        if uuid in claimed_uuids:
            continue
        targets.append(
            DetailTarget(
                uuid=uuid,
                summary=build_event_target_summary(uuid, previous_events_md, next_events_md, uuid),
                file=f"events/{uuid}.md",
                delta_action="review",
                update_context="Review impacted claims after manuscript changes touched this event's provenance.",
                provenance_summary=impact.summary,
            )
        )

    return targets


def build_element_detail_targets(
    *,
    previous_elements_md: str,
    next_elements_md: str,
    proposal,
    current_detail_files: dict[str, str],
    diff_text: str,
) -> list[DetailTarget]:
    impacts = scan_impacted_detail_files(current_detail_files, diff_text)
    added_entries = get_added_entries(previous_elements_md, next_elements_md, ELEMENT_FIELD_NAMES)
    claimed_uuids: set[str] = set()
    targets: list[DetailTarget] = []

    for decision in proposal.identified_elements:
        if decision.action == ElementProposalAction.CREATE:
            resolved_uuid = resolve_created_element_uuid(decision, added_entries, claimed_uuids)
        else:
            resolved_uuid = decision.matched_existing_uuid

        if not resolved_uuid:
            continue

        claimed_uuids.add(resolved_uuid)
        summary, kind = build_element_target_summary(
            resolved_uuid,
            previous_elements_md,
            next_elements_md,
            decision.display_name,
        )
        impact = impacts.get(resolved_uuid)
        targets.append(
            DetailTarget(
                uuid=resolved_uuid,
                summary=summary,
                file=f"elements/{resolved_uuid}.md",
                delta_action=decision.action.value,
                update_context=decision.update_instruction,
                kind=kind,
                provenance_summary=(impact.summary if impact else decision.provenance_summary),
            )
        )

    for uuid, impact in sorted(impacts.items()):
        if uuid in claimed_uuids:
            continue
        summary, kind = build_element_target_summary(uuid, previous_elements_md, next_elements_md, uuid)
        targets.append(
            DetailTarget(
                uuid=uuid,
                summary=summary,
                file=f"elements/{uuid}.md",
                delta_action="review",
                update_context="Review impacted claims after manuscript changes touched this element's provenance.",
                kind=kind,
                provenance_summary=impact.summary,
            )
        )

    return targets


@dataclass(slots=True)
class StubHarnessService:
    def propose_events_index(self, request: EventsIndexProposeRequest) -> EventsIndexProposeResponse:
        proposal = annotate_event_proposal_with_impacts(
            build_stub_event_agent_output(request.diff_text),
            request.current_detail_files,
            request.diff_text,
        )
        _log_success(
            "events_index_proposed",
            backend_mode="stub",
            delta_count=len(proposal.deltas),
        )
        return EventsIndexProposeResponse(proposal=proposal)

    def apply_events_index(self, request: EventsIndexApplyRequest) -> EventsIndexApplyResponse:
        apply_result = build_events_apply_result(request.events_md, request.proposal, request.diff_text)
        normalized_content = normalize_layer_content("events", apply_result.index_markdown, apply_result.detail_files)
        response = EventsIndexApplyResponse(
            events_md=normalized_content.index_markdown,
            detail_files=normalized_content.detail_files,
            detail_targets=build_event_detail_targets(
                previous_events_md=request.events_md,
                next_events_md=normalized_content.index_markdown,
                proposal=request.proposal,
                current_detail_files=request.current_detail_files,
                diff_text=request.diff_text,
            ),
            actions=apply_result.actions,
        )
        _log_success(
            "events_index_applied",
            backend_mode="stub",
            delta_count=len(request.proposal.deltas),
            action_count=len(response.actions),
            detail_file_count=len(response.detail_files),
            detail_target_count=len(response.detail_targets),
        )
        return response

    def propose_elements_index(self, request: ElementsIndexProposeRequest) -> ElementsIndexProposeResponse:
        proposal = annotate_element_proposal_with_impacts(
            propose_elements_index_with_audit(
                request.diff_text,
                request.elements_md,
                request.history,
            ),
            request.current_detail_files,
            request.diff_text,
        )
        _log_success(
            "elements_index_proposed",
            backend_mode="stub",
            identified_count=len(proposal.identified_elements),
        )
        return ElementsIndexProposeResponse(proposal=proposal)

    def apply_elements_index(self, request: ElementsIndexApplyRequest) -> ElementsIndexApplyResponse:
        apply_result = apply_elements_proposal(request.elements_md, request.proposal, request.diff_text)
        normalized_content = normalize_layer_content("elements", apply_result.index_markdown, apply_result.detail_files)
        response = ElementsIndexApplyResponse(
            elements_md=normalized_content.index_markdown,
            detail_files=normalized_content.detail_files,
            detail_targets=build_element_detail_targets(
                previous_elements_md=request.elements_md,
                next_elements_md=normalized_content.index_markdown,
                proposal=request.proposal,
                current_detail_files=request.current_detail_files,
                diff_text=request.diff_text,
            ),
            actions=apply_result.actions,
        )
        _log_success(
            "elements_index_applied",
            backend_mode="stub",
            decision_count=len(request.proposal.identified_elements),
            action_count=len(response.actions),
            detail_file_count=len(response.detail_files),
            detail_target_count=len(response.detail_targets),
        )
        return response

    def propose_element_detail(self, request: ElementDetailProposeRequest) -> ElementDetailProposeResponse:
        proposal, detail_result = build_element_detail_result(
            request.target,
            request.current_detail_md,
            request.elements_md,
        )
        normalized_detail_markdown = normalize_detail_markdown(
            "elements",
            request.target.uuid,
            detail_result.updated_detail_markdown,
        )
        response = ElementDetailProposeResponse(
            proposal=proposal,
            preview_diff=detail_result.preview_diff,
            updated_detail_md=normalized_detail_markdown,
        )
        _log_success(
            "element_detail_proposed",
            backend_mode="stub",
            target_uuid=request.target.uuid,
            file_action=proposal.file_action.value,
            changed=bool(response.preview_diff),
        )
        return response

    def propose_event_detail(self, request: EventDetailProposeRequest) -> EventDetailProposeResponse:
        proposal, detail_result = build_event_detail_result(
            request.target,
            request.current_detail_md,
            request.events_md,
        )
        normalized_detail_markdown = normalize_detail_markdown(
            "events",
            request.target.uuid,
            detail_result.updated_detail_markdown,
        )
        response = EventDetailProposeResponse(
            proposal=proposal,
            preview_diff=detail_result.preview_diff,
            updated_detail_md=normalized_detail_markdown,
        )
        _log_success(
            "event_detail_proposed",
            backend_mode="stub",
            target_uuid=request.target.uuid,
            file_action=proposal.file_action.value,
            changed=bool(response.preview_diff),
        )
        return response


@dataclass(slots=True)
class RealHarnessService:
    detail_proposal_provider: DetailProposalProvider

    @classmethod
    def from_env(cls) -> "RealHarnessService":
        return cls(detail_proposal_provider=OpenAICompatibleDetailProposalProvider.from_env())

    def propose_events_index(self, request: EventsIndexProposeRequest) -> EventsIndexProposeResponse:
        proposal = annotate_event_proposal_with_impacts(
            self.detail_proposal_provider.propose_events_index(request),
            request.current_detail_files,
            request.diff_text,
        )
        _log_success(
            "events_index_proposed",
            backend_mode="real",
            delta_count=len(proposal.deltas),
        )
        return EventsIndexProposeResponse(proposal=proposal)

    def apply_events_index(self, request: EventsIndexApplyRequest) -> EventsIndexApplyResponse:
        apply_result = build_events_apply_result(request.events_md, request.proposal, request.diff_text)
        normalized_content = normalize_layer_content("events", apply_result.index_markdown, apply_result.detail_files)
        response = EventsIndexApplyResponse(
            events_md=normalized_content.index_markdown,
            detail_files=normalized_content.detail_files,
            detail_targets=build_event_detail_targets(
                previous_events_md=request.events_md,
                next_events_md=normalized_content.index_markdown,
                proposal=request.proposal,
                current_detail_files=request.current_detail_files,
                diff_text=request.diff_text,
            ),
            actions=apply_result.actions,
        )
        _log_success(
            "events_index_applied",
            backend_mode="real",
            delta_count=len(request.proposal.deltas),
            action_count=len(response.actions),
            detail_file_count=len(response.detail_files),
            detail_target_count=len(response.detail_targets),
        )
        return response

    def propose_elements_index(self, request: ElementsIndexProposeRequest) -> ElementsIndexProposeResponse:
        proposal = annotate_element_proposal_with_impacts(
            propose_elements_index_with_audit(
                request.diff_text,
                request.elements_md,
                request.history,
                proposal_builder=lambda diff_text, _existing_index, history: self.detail_proposal_provider.propose_elements_index(
                    request.model_copy(update={"diff_text": diff_text, "history": history})
                ),
            ),
            request.current_detail_files,
            request.diff_text,
        )
        _log_success(
            "elements_index_proposed",
            backend_mode="real",
            identified_count=len(proposal.identified_elements),
        )
        return ElementsIndexProposeResponse(proposal=proposal)

    def apply_elements_index(self, request: ElementsIndexApplyRequest) -> ElementsIndexApplyResponse:
        apply_result = apply_elements_proposal(request.elements_md, request.proposal, request.diff_text)
        normalized_content = normalize_layer_content("elements", apply_result.index_markdown, apply_result.detail_files)
        response = ElementsIndexApplyResponse(
            elements_md=normalized_content.index_markdown,
            detail_files=normalized_content.detail_files,
            detail_targets=build_element_detail_targets(
                previous_elements_md=request.elements_md,
                next_elements_md=normalized_content.index_markdown,
                proposal=request.proposal,
                current_detail_files=request.current_detail_files,
                diff_text=request.diff_text,
            ),
            actions=apply_result.actions,
        )
        _log_success(
            "elements_index_applied",
            backend_mode="real",
            decision_count=len(request.proposal.identified_elements),
            action_count=len(response.actions),
            detail_file_count=len(response.detail_files),
            detail_target_count=len(response.detail_targets),
        )
        return response

    def propose_element_detail(self, request: ElementDetailProposeRequest) -> ElementDetailProposeResponse:
        prompt_context = build_element_prompt_context(request)
        proposal = self.detail_proposal_provider.propose_element_detail(request, prompt_context)
        detail_result = build_element_detail_response(request, proposal, prompt_context=prompt_context)
        normalized_detail_markdown = normalize_detail_markdown(
            "elements",
            request.target.uuid,
            detail_result.updated_detail_md,
        )
        response = ElementDetailProposeResponse(
            proposal=detail_result.proposal,
            preview_diff=detail_result.preview_diff,
            updated_detail_md=normalized_detail_markdown,
        )
        _log_success(
            "element_detail_proposed",
            backend_mode="real",
            target_uuid=request.target.uuid,
            file_action=detail_result.proposal.file_action.value,
            changed=bool(response.preview_diff),
        )
        return response

    def propose_event_detail(self, request: EventDetailProposeRequest) -> EventDetailProposeResponse:
        prompt_context = build_event_prompt_context(request)
        proposal = self.detail_proposal_provider.propose_event_detail(request, prompt_context)
        detail_result = build_event_detail_response(request, proposal, prompt_context=prompt_context)
        normalized_detail_markdown = normalize_detail_markdown(
            "events",
            request.target.uuid,
            detail_result.updated_detail_md,
        )
        response = EventDetailProposeResponse(
            proposal=detail_result.proposal,
            preview_diff=detail_result.preview_diff,
            updated_detail_md=normalized_detail_markdown,
        )
        _log_success(
            "event_detail_proposed",
            backend_mode="real",
            target_uuid=request.target.uuid,
            file_action=detail_result.proposal.file_action.value,
            changed=bool(response.preview_diff),
        )
        return response


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
