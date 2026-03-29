from __future__ import annotations

from dataclasses import dataclass
from difflib import unified_diff
from hashlib import sha1

from backend.index_markdown import parse_index_markdown, render_index_markdown
from backend.schemas import (
    ChronologyBlockUpdate,
    DetailFileAction,
    DetailTarget,
    ElementDecision,
    ElementFileUpdateProposal,
    ElementProposalAction,
    ElementsProposal,
    EventAgentOutput,
    EventDelta,
    EventDeltaAction,
    EventFileUpdateProposal,
)
from backend.services.provenance import ProvenanceReference, extract_affected_source_paths, render_provenance_section

# Keep this field order in sync with frontend/editor-app/src/utils/worldSync.js.
EVENT_FIELD_NAMES = ["uuid", "when", "chapters", "summary"]
ELEMENT_FIELD_NAMES = ["kind", "display_name", "uuid", "aliases", "identification_keys"]

EVENTS_INDEX_PREAMBLE = """# Events

Purpose:
This file is the canonical index of meaningful story events.

Format:
- uuid | when | chapters | summary
"""

ELEMENTS_INDEX_PREAMBLE = """# Elements

Purpose:
This file is the canonical index of stable, story-relevant elements in the world model.

Format:
- kind | display_name | uuid | aliases | identification_keys
"""

STUB_METADATA_UNAVAILABLE = "Not provided in stub input"


@dataclass(frozen=True, slots=True)
class LayerApplyResult:
    index_markdown: str
    detail_files: dict[str, str]
    actions: list[str]


@dataclass(frozen=True, slots=True)
class DetailProposalResult:
    updated_detail_markdown: str
    preview_diff: str


def build_stub_event_agent_output(diff_text: str) -> EventAgentOutput:
    return EventAgentOutput(
        scan_summary="Stub mode analyzed the diff and returned a deterministic events proposal.",
        deltas=[
            EventDelta(
                action=EventDeltaAction.CREATE,
                when="June 28, 1998, 7:15 a.m.",
                chapters="Chapter 8",
                summary="Stubbed altar discovery event for contract integration",
                reason="Stub mode creates one deterministic event delta so the frontend can integrate against a stable proposal shape.",
                evidence_from_diff=extract_evidence_lines(diff_text),
            ),
        ],
    )


def build_stub_elements_proposal(diff_text: str) -> ElementsProposal:
    return ElementsProposal(
        diff_summary="Stub mode found one deterministic element candidate in the diff.",
        rationale="Stub mode keeps the payload shape stable while real LLM wiring is deferred.",
        identified_elements=[
            ElementDecision(
                action=ElementProposalAction.CREATE,
                display_name="Stubbed Story Element",
                kind="concept",
                aliases=["stubbed element"],
                identification_keys=["contract integration", "deterministic fixture"],
                snapshot="A deterministic placeholder element used to validate frontend and backend integration.",
                update_instruction="Create a new placeholder element for stub-mode review flows.",
                evidence_from_diff=extract_evidence_lines(diff_text),
                matched_existing_display_name=None,
                matched_existing_uuid=None,
                is_new=True,
            ),
        ],
        approval_message="Stub mode would create one placeholder element.",
    )


def build_events_apply_result(
    existing_markdown: str,
    proposal: EventAgentOutput,
    diff_text: str = "",
) -> LayerApplyResult:
    parsed_markdown = parse_index_markdown(existing_markdown, EVENT_FIELD_NAMES)
    entries = list(parsed_markdown.entries)
    detail_files: dict[str, str] = {}
    actions: list[str] = []

    for delta in proposal.deltas:
        apply_event_delta(entries, detail_files, actions, delta, diff_text)

    index_preamble = parsed_markdown.index_preamble or EVENTS_INDEX_PREAMBLE
    index_markdown = render_index_markdown(index_preamble, entries, EVENT_FIELD_NAMES)
    return LayerApplyResult(index_markdown=index_markdown, detail_files=detail_files, actions=actions)


def build_elements_apply_result(existing_markdown: str, proposal: ElementsProposal) -> LayerApplyResult:
    parsed_markdown = parse_index_markdown(existing_markdown, ELEMENT_FIELD_NAMES)
    entries = list(parsed_markdown.entries)
    detail_files: dict[str, str] = {}
    actions: list[str] = []

    for decision in proposal.identified_elements:
        apply_element_decision(entries, detail_files, actions, decision)

    index_preamble = parsed_markdown.index_preamble or ELEMENTS_INDEX_PREAMBLE
    index_markdown = render_index_markdown(index_preamble, entries, ELEMENT_FIELD_NAMES)
    return LayerApplyResult(index_markdown=index_markdown, detail_files=detail_files, actions=actions)


def build_stub_element_detail_proposal(target: DetailTarget) -> ElementFileUpdateProposal:
    if target.delta_action == "delete":
        return ElementFileUpdateProposal(
            file_action=DetailFileAction.DELETE,
            rationale="Stub mode deletes the detail file when the target action is delete.",
            provenance_replacement=[],
            approval_message="Stub mode prepared a detail delete.",
        )
    return ElementFileUpdateProposal(
        file_action=DetailFileAction.UPDATE,
        rationale="Stub mode proposes one deterministic element-detail update.",
        core_understanding_replacement=f"{target.summary} is represented by a deterministic stub detail page until the real harness is connected.",
        stable_profile_to_add=["Visible in stub mode"],
        interpretation_to_add=["Demonstrates the contract for detail-page updates."],
        knowledge_to_add=["Awaiting real LLM-backed enrichment."],
        chronology_blocks_to_add=[
            ChronologyBlockUpdate(
                heading="Stub Mode",
                entries=["Backend contract handshake completed."],
            ),
        ],
        open_threads_to_add=["Replace stub detail generation with the real detail harness."],
        provenance_replacement=build_stub_provenance_replacement(target),
        approval_message="Stub mode prepared an element detail update.",
    )


def build_stub_event_detail_proposal(target: DetailTarget) -> EventFileUpdateProposal:
    if target.delta_action == "delete":
        return EventFileUpdateProposal(
            file_action=DetailFileAction.DELETE,
            rationale="Stub mode deletes the event detail file when the target action is delete.",
            provenance_replacement=[],
            approval_message="Stub mode prepared an event detail delete.",
        )
    return EventFileUpdateProposal(
        file_action=DetailFileAction.UPDATE,
        rationale="Stub mode proposes one deterministic event-detail update.",
        core_understanding_replacement=f"{target.summary} is represented by a deterministic stub event detail until the real harness is connected.",
        causal_context_to_add=["Triggered by a backend contract verification request."],
        consequences_to_add=["Confirms the frontend can consume detail-update responses."],
        participants_to_add=["Frontend integration layer", "Stub backend service"],
        evidence_to_add=["Deterministic stub response generated by the backend."],
        open_threads_to_add=["Replace stub event detail generation with the real detail harness."],
        provenance_replacement=build_stub_provenance_replacement(target),
        approval_message="Stub mode prepared an event detail update.",
    )


def build_element_detail_result(
    target: DetailTarget,
    current_detail_markdown: str,
    elements_markdown: str,
) -> tuple[ElementFileUpdateProposal, DetailProposalResult]:
    proposal = build_stub_element_detail_proposal(target)
    if proposal.file_action == DetailFileAction.DELETE:
        preview_diff = build_preview_diff(target.file, current_detail_markdown, "")
        return proposal, DetailProposalResult("", preview_diff)
    updated_detail_markdown = render_element_detail_markdown(
        target,
        proposal,
        resolve_element_aliases(target, current_detail_markdown, elements_markdown),
    )
    preview_diff = build_preview_diff(target.file, current_detail_markdown, updated_detail_markdown)
    return proposal, DetailProposalResult(updated_detail_markdown, preview_diff)


def build_event_detail_result(
    target: DetailTarget,
    current_detail_markdown: str,
    events_markdown: str,
) -> tuple[EventFileUpdateProposal, DetailProposalResult]:
    proposal = build_stub_event_detail_proposal(target)
    if proposal.file_action == DetailFileAction.DELETE:
        preview_diff = build_preview_diff(target.file, current_detail_markdown, "")
        return proposal, DetailProposalResult("", preview_diff)
    when_value, chapters_value = resolve_event_metadata(target, current_detail_markdown, events_markdown)
    updated_detail_markdown = render_event_detail_markdown(target, proposal, when_value, chapters_value)
    preview_diff = build_preview_diff(target.file, current_detail_markdown, updated_detail_markdown)
    return proposal, DetailProposalResult(updated_detail_markdown, preview_diff)


def extract_evidence_lines(diff_text: str) -> list[str]:
    evidence_lines: list[str] = []
    for line in diff_text.splitlines():
        if not line.startswith("+") or line.startswith("+++"):
            continue
        evidence_lines.append(line[1:].strip())
        if len(evidence_lines) == 2:
            return evidence_lines

    if evidence_lines:
        return evidence_lines

    return ["Deterministic stub evidence generated from the request diff."]


def apply_event_delta(
    entries: list[dict[str, str]],
    detail_files: dict[str, str],
    actions: list[str],
    delta: EventDelta,
    diff_text: str,
) -> None:
    if delta.action == EventDeltaAction.DELETE:
        remove_entry(entries, delta.existing_event_uuid or "")
        actions.append(f"Deleted event {delta.existing_event_uuid}: {delta.summary}.")
        return

    event_uuid = resolve_event_uuid(delta)
    event_entry = build_event_entry(event_uuid, delta)
    upsert_entry(entries, event_entry, "uuid")
    actions.append(build_event_action(delta.action, event_uuid, delta.summary))

    if delta.action == EventDeltaAction.CREATE:
        detail_files[event_uuid] = build_event_detail_file(event_uuid, delta, diff_text)


def apply_element_decision(
    entries: list[dict[str, str]],
    detail_files: dict[str, str],
    actions: list[str],
    decision: ElementDecision,
) -> None:
    if decision.action == ElementProposalAction.DELETE:
        remove_entry(entries, decision.matched_existing_uuid or "")
        actions.append(f"Deleted element {decision.matched_existing_uuid}: {decision.display_name}.")
        return
    element_uuid = resolve_element_uuid(decision)
    element_entry = build_element_entry(element_uuid, decision)
    upsert_entry(entries, element_entry, "uuid")

    if decision.action == ElementProposalAction.CREATE:
        detail_files[element_uuid] = build_element_detail_file(element_uuid, decision)
        actions.append(f"Created element {element_uuid}: {decision.display_name}.")
        return

    actions.append(f"Updated element {element_uuid}: {decision.display_name}.")


def remove_entry(entries: list[dict[str, str]], entry_uuid: str) -> None:
    entries[:] = [entry for entry in entries if entry.get("uuid") != entry_uuid]


def upsert_entry(entries: list[dict[str, str]], next_entry: dict[str, str], key_name: str) -> None:
    for index, current_entry in enumerate(entries):
        if current_entry.get(key_name) != next_entry.get(key_name):
            continue
        entries[index] = next_entry
        return

    entries.append(next_entry)


def build_event_action(action: EventDeltaAction, event_uuid: str, summary: str) -> str:
    action_label = action.value.capitalize()
    return f"{action_label} event {event_uuid}: {summary}."


def resolve_event_uuid(delta: EventDelta) -> str:
    if delta.action != EventDeltaAction.CREATE and delta.existing_event_uuid:
        return delta.existing_event_uuid
    return build_uuid("evt", delta.summary)


def resolve_element_uuid(decision: ElementDecision) -> str:
    if decision.matched_existing_uuid:
        return decision.matched_existing_uuid
    return build_uuid("elt", decision.kind.value, decision.display_name)


def build_uuid(prefix: str, *parts: str) -> str:
    digest = sha1("::".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"


def build_event_entry(event_uuid: str, delta: EventDelta) -> dict[str, str]:
    return {
        "uuid": event_uuid,
        "when": delta.when,
        "chapters": delta.chapters,
        "summary": delta.summary,
    }


def build_element_entry(element_uuid: str, decision: ElementDecision) -> dict[str, str]:
    return {
        "kind": decision.kind.value,
        "display_name": decision.display_name,
        "uuid": element_uuid,
        "aliases": ", ".join(decision.aliases),
        "identification_keys": "; ".join(decision.identification_keys),
    }


def build_event_detail_file(event_uuid: str, delta: EventDelta, diff_text: str) -> str:
    evidence_lines = "\n".join(f"- {line}" for line in delta.evidence_from_diff)
    provenance_lines = build_provenance_lines(
        target_summary=delta.summary,
        evidence_from_diff=delta.evidence_from_diff,
        diff_text=diff_text,
    )
    return f"""# {delta.summary}

## Identification
- UUID: {event_uuid}
- When: {delta.when}
- Chapters: {delta.chapters}
- Summary: {delta.summary}

## Core Understanding
Stub mode created this event detail file to validate apply responses.

## Causal Context
- Deterministic contract test

## Consequences & Ripple Effects
- Enables frontend integration before real LLM calls

## Participants & Roles
- Stub backend service

## Evidence & Grounding
{evidence_lines}

## Open Threads
- Replace stub event detail generation with the real harness

{provenance_lines}
"""


def build_element_detail_file(element_uuid: str, decision: ElementDecision) -> str:
    aliases = ", ".join(decision.aliases) or decision.display_name
    identification_keys = "; ".join(decision.identification_keys) or "-"
    provenance_lines = build_provenance_lines(
        target_summary=decision.display_name,
        evidence_from_diff=decision.evidence_from_diff,
        diff_text="",
    )
    return f"""# {decision.display_name}

## Identification
- UUID: {element_uuid}
- Type: {decision.kind.value}
- Canonical name: {decision.display_name}
- Aliases: {aliases}
- Identification keys: {identification_keys}

## Core Understanding
{decision.snapshot}

## Stable Profile
- Deterministic stub detail

## Interpretation
- Demonstrates the element apply response shape

## Knowledge / Beliefs / Uncertainties
- Awaiting real LLM-backed enrichment

## Element-Centered Chronology
### Stub Mode
- Placeholder detail generated for backend contract testing

## Open Threads
- Replace stub element detail generation with the real harness

{provenance_lines}
"""


def render_element_detail_markdown(
    target: DetailTarget,
    proposal: ElementFileUpdateProposal,
    aliases: str,
) -> str:
    chronology_lines = build_chronology_lines(proposal.chronology_blocks_to_add)
    stable_profile_lines = build_markdown_list(proposal.stable_profile_to_add)
    interpretation_lines = build_markdown_list(proposal.interpretation_to_add)
    knowledge_lines = build_markdown_list(proposal.knowledge_to_add)
    open_thread_lines = build_markdown_list(proposal.open_threads_to_add)
    target_kind = target.kind.value if target.kind is not None else "other"
    return f"""# {target.summary}

## Identification
- UUID: {target.uuid}
- Type: {target_kind}
- Canonical name: {target.summary}
- Aliases: {aliases}
- Identification keys: stub mode

## Core Understanding
{proposal.core_understanding_replacement or "Stub mode generated a placeholder element detail."}

## Stable Profile
{stable_profile_lines}

## Interpretation
{interpretation_lines}

## Knowledge / Beliefs / Uncertainties
{knowledge_lines}

## Element-Centered Chronology
{chronology_lines}

## Open Threads
{open_thread_lines}

## Provenance
### Support
{build_markdown_list(proposal.provenance_replacement)}
"""


def render_event_detail_markdown(
    target: DetailTarget,
    proposal: EventFileUpdateProposal,
    when_value: str,
    chapters_value: str,
) -> str:
    causal_context_lines = build_markdown_list(proposal.causal_context_to_add)
    consequence_lines = build_markdown_list(proposal.consequences_to_add)
    participant_lines = build_markdown_list(proposal.participants_to_add)
    evidence_lines = build_markdown_list(proposal.evidence_to_add)
    open_thread_lines = build_markdown_list(proposal.open_threads_to_add)
    return f"""# {target.summary}

## Identification
- UUID: {target.uuid}
- When: {when_value}
- Chapters: {chapters_value}
- Summary: {target.summary}

## Core Understanding
{proposal.core_understanding_replacement or "Stub mode generated a placeholder event detail."}

## Causal Context
{causal_context_lines}

## Consequences & Ripple Effects
{consequence_lines}

## Participants & Roles
{participant_lines}

## Evidence & Grounding
{evidence_lines}

## Open Threads
{open_thread_lines}

## Provenance
### Support
{build_markdown_list(proposal.provenance_replacement)}
"""


def build_markdown_list(values: list[str]) -> str:
    if not values:
        return "- TBD"
    return "\n".join(f"- {value}" for value in values)


def build_stub_provenance_replacement(target: DetailTarget) -> list[str]:
    return [
        f"OBJECT | {target.summary} | story/stub.story | \"{target.summary} stub evidence\"",
    ]


def build_provenance_lines(target_summary: str, evidence_from_diff: list[str], diff_text: str) -> str:
    affected_paths = extract_affected_source_paths(diff_text)
    source_path = affected_paths[0] if affected_paths else "story/stub.story"
    evidence_excerpt = evidence_from_diff[0] if evidence_from_diff else f"{target_summary} stub evidence"
    return "\n".join(
        render_provenance_section(
            [
                ProvenanceReference(
                    section="OBJECT",
                    claim=target_summary,
                    source_path=source_path,
                    evidence_excerpt=evidence_excerpt,
                )
            ]
        )
    )


def resolve_element_aliases(target: DetailTarget, current_detail_markdown: str, elements_markdown: str) -> str:
    index_entry = find_index_entry_by_uuid(elements_markdown, ELEMENT_FIELD_NAMES, target.uuid)
    if index_entry and index_entry.get("aliases"):
        return index_entry["aliases"]

    existing_aliases = extract_detail_metadata_value(current_detail_markdown, "Aliases")
    if existing_aliases:
        return existing_aliases

    return STUB_METADATA_UNAVAILABLE


def resolve_event_metadata(
    target: DetailTarget,
    current_detail_markdown: str,
    events_markdown: str,
) -> tuple[str, str]:
    index_entry = find_index_entry_by_uuid(events_markdown, EVENT_FIELD_NAMES, target.uuid)
    when_value = index_entry.get("when") if index_entry else ""
    chapters_value = index_entry.get("chapters") if index_entry else ""

    when_value = when_value or extract_detail_metadata_value(current_detail_markdown, "When") or STUB_METADATA_UNAVAILABLE
    chapters_value = (
        chapters_value
        or extract_detail_metadata_value(current_detail_markdown, "Chapters")
        or STUB_METADATA_UNAVAILABLE
    )

    return when_value, chapters_value


def find_index_entry_by_uuid(markdown: str, field_names: list[str], target_uuid: str) -> dict[str, str] | None:
    parsed_markdown = parse_index_markdown(markdown, field_names)
    for entry in parsed_markdown.entries:
        if entry.get("uuid") == target_uuid:
            return entry

    return None


def extract_detail_metadata_value(detail_markdown: str, field_name: str) -> str:
    if not detail_markdown:
        return ""

    field_prefix = f"- {field_name}:"
    for line in detail_markdown.splitlines():
        if line.startswith(field_prefix):
            return line[len(field_prefix) :].strip()

    return ""


def build_chronology_lines(blocks: list[ChronologyBlockUpdate]) -> str:
    if not blocks:
        return "- TBD"

    chronology_sections: list[str] = []
    for block in blocks:
        chronology_sections.append(f"### {block.heading}")
        chronology_sections.extend(f"- {entry}" for entry in block.entries)
    return "\n".join(chronology_sections)


def build_preview_diff(file_path: str, current_text: str, updated_text: str) -> str:
    diff_lines = unified_diff(
        current_text.splitlines(),
        updated_text.splitlines(),
        fromfile=f"a/{file_path}",
        tofile=f"b/{file_path}",
        lineterm="",
    )
    return "\n".join(diff_lines)
