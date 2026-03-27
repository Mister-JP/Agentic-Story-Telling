from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha1
import re
from typing import Callable

from backend.errors import ApiError
from backend.index_markdown import parse_index_markdown, render_index_markdown
from backend.schemas import ElementDecision, ElementKind, ElementsProposal, HistoryEntry

ELEMENT_FIELD_NAMES = ["kind", "display_name", "uuid", "aliases", "identification_keys"]
ELEMENTS_INDEX_PREAMBLE = """# Elements

Purpose:
This file is the canonical index of stable, story-relevant elements in the world model.

Format:
- kind | display_name | uuid | aliases | identification_keys
"""
KINSHIP_CUE_PATTERN = re.compile(
    r"\b(mother|father|brother|sister|cousin|wife|husband|daughter|son|uncle|aunt|niece|nephew|grandmother|grandfather)\b",
    re.IGNORECASE,
)
AUDITABLE_ELEMENT_KINDS = ("person", "place", "group", "relationship", "concept", "item")


@dataclass(frozen=True, slots=True)
class ElementRecord:
    kind: str
    display_name: str
    uuid: str
    aliases: list[str]
    identification_keys: list[str]


@dataclass(frozen=True, slots=True)
class ParsedElementsIndex:
    index_preamble: str
    records_by_uuid: dict[str, ElementRecord]
    display_name_lookup: dict[str, ElementRecord]
    alias_lookup: dict[str, list[ElementRecord]]
    identification_key_lookup: dict[str, ElementRecord]


@dataclass(frozen=True, slots=True)
class LayerApplyResult:
    index_markdown: str
    detail_files: dict[str, str]
    actions: list[str]


@dataclass(frozen=True, slots=True)
class DeterministicCandidate:
    display_name: str
    kind: ElementKind
    aliases: tuple[str, ...]
    identification_keys: tuple[str, ...]
    patterns: tuple[str, ...]
    snapshot: str
    update_instruction: str


ProposalBuilder = Callable[[str, ParsedElementsIndex, list[HistoryEntry]], ElementsProposal]

ITEM_CANDIDATES = (
    DeterministicCandidate(
        display_name="Cloth Bundle",
        kind=ElementKind.ITEM,
        aliases=("cloth bundle", "stained bundle"),
        identification_keys=("found at the altar", "wrapped in stained cloth"),
        patterns=("cloth bundle", "stained cloth", "bundle"),
        snapshot=(
            "A bundle wrapped in stained cloth becomes materially relevant in the diff. "
            "It should be tracked as a portable piece of evidence in the world model."
        ),
        update_instruction=(
            "Track the cloth bundle as a durable item and carry the new altar evidence into downstream detail review."
        ),
    ),
    DeterministicCandidate(
        display_name="Silver Key",
        kind=ElementKind.ITEM,
        aliases=("silver key", "key"),
        identification_keys=("metal key", "story-significant key"),
        patterns=("silver key", " key "),
        snapshot=(
            "The diff materially updates the silver key. "
            "Its recurring role means the canonical item should remain synchronized."
        ),
        update_instruction=(
            "Merge the latest evidence about the silver key into the canonical item record."
        ),
    ),
    DeterministicCandidate(
        display_name="Cracked Watch",
        kind=ElementKind.ITEM,
        aliases=("cracked watch", "watch"),
        identification_keys=("damaged watch", "timekeeping evidence"),
        patterns=("cracked watch", "watch"),
        snapshot=(
            "A watch appears as durable evidence in the diff. "
            "It should stay linked to the canonical item if the story already tracks it."
        ),
        update_instruction=(
            "Record the new watch evidence in the canonical item entry for later detail review."
        ),
    ),
    DeterministicCandidate(
        display_name="Toll House Ledger Page",
        kind=ElementKind.ITEM,
        aliases=("ledger page", "toll house ledger", "ledger"),
        identification_keys=("written record", "paper evidence"),
        patterns=("ledger page", "toll house ledger", "ledger"),
        snapshot=(
            "A ledger page or ledger evidence remains materially relevant in the diff. "
            "It should stay attached to the canonical evidence item."
        ),
        update_instruction=(
            "Merge the ledger evidence into the canonical item entry for downstream review."
        ),
    ),
)


def normalize_lookup(text: str) -> str:
    normalized_text = re.sub(r"[^a-z0-9\s]+", " ", text.lower().strip())
    return re.sub(r"\s+", " ", normalized_text).strip()


def split_aliases(raw_value: str) -> list[str]:
    return [value.strip() for value in raw_value.split(",") if value.strip()]


def split_identification_keys(raw_value: str) -> list[str]:
    return [value.strip() for value in raw_value.split(";") if value.strip()]


def register_lookup_value(lookup: dict[str, ElementRecord], raw_value: str, record: ElementRecord) -> None:
    normalized_value = normalize_lookup(raw_value)
    if normalized_value == "" or normalized_value in lookup:
        return
    lookup[normalized_value] = record


def register_alias_lookup_value(
    lookup: dict[str, list[ElementRecord]],
    raw_value: str,
    record: ElementRecord,
) -> None:
    normalized_value = normalize_lookup(raw_value)
    if normalized_value == "":
        return

    existing_records = lookup.setdefault(normalized_value, [])
    if any(
        existing_record.uuid == record.uuid
        and existing_record.kind == record.kind
        and existing_record.display_name == record.display_name
        for existing_record in existing_records
    ):
        return

    existing_records.append(record)


def parse_elements_index(markdown: str) -> ParsedElementsIndex:
    parsed_markdown = parse_index_markdown(markdown, ELEMENT_FIELD_NAMES)
    records_by_uuid: dict[str, ElementRecord] = {}
    display_name_lookup: dict[str, ElementRecord] = {}
    alias_lookup: dict[str, list[ElementRecord]] = {}
    identification_key_lookup: dict[str, ElementRecord] = {}

    for entry_number, entry in enumerate(parsed_markdown.entries, start=1):
        record = ElementRecord(
            kind=entry.get("kind", "other"),
            display_name=entry.get("display_name", ""),
            uuid=entry.get("uuid", ""),
            aliases=split_aliases(entry.get("aliases", "")),
            identification_keys=split_identification_keys(entry.get("identification_keys", "")),
        )
        if record.uuid == "":
            entry_reference = (
                f'"{record.display_name}"' if record.display_name else str(entry_number)
            )
            raise ApiError(
                error="parse_error",
                message="Failed to parse elements index.",
                status_code=500,
                retryable=False,
                details=[f"Element index entry {entry_reference} is missing a UUID."],
            )
        records_by_uuid[record.uuid] = record
        register_lookup_value(display_name_lookup, record.display_name, record)
        for alias in record.aliases:
            register_alias_lookup_value(alias_lookup, alias, record)
        for identification_key in record.identification_keys:
            register_lookup_value(identification_key_lookup, identification_key, record)

    return ParsedElementsIndex(
        index_preamble=parsed_markdown.index_preamble,
        records_by_uuid=records_by_uuid,
        display_name_lookup=display_name_lookup,
        alias_lookup=alias_lookup,
        identification_key_lookup=identification_key_lookup,
    )


def text_explicitly_mentions(text: str, phrase: str) -> bool:
    sanitized_phrase = phrase.strip()
    if sanitized_phrase == "":
        return False
    pattern = rf"\b{re.escape(sanitized_phrase.lower())}\b"
    return re.search(pattern, text.lower()) is not None


def find_explicit_index_mentions(existing_index: ParsedElementsIndex, diff_text: str) -> dict[str, list[ElementRecord]]:
    mentions_by_kind: dict[str, list[ElementRecord]] = {}
    seen_uuids: set[str] = set()

    for record in existing_index.records_by_uuid.values():
        candidate_names = [record.display_name, *record.aliases]
        if not any(text_explicitly_mentions(diff_text, candidate_name) for candidate_name in candidate_names):
            continue
        if record.uuid in seen_uuids:
            continue
        mentions_by_kind.setdefault(record.kind, []).append(record)
        seen_uuids.add(record.uuid)

    return mentions_by_kind


def build_proposal_display_names(proposal: ElementsProposal) -> set[str]:
    return {normalize_lookup(decision.display_name) for decision in proposal.identified_elements}


def audit_elements_coverage(
    proposal: ElementsProposal,
    existing_index: ParsedElementsIndex,
    diff_text: str,
) -> list[str]:
    feedback_messages: list[str] = []
    mentions_by_kind = find_explicit_index_mentions(existing_index, diff_text)
    proposal_kinds = {str(decision.kind) for decision in proposal.identified_elements}

    for kind in AUDITABLE_ELEMENT_KINDS:
        mentioned_records = mentions_by_kind.get(kind, [])
        if not mentioned_records or kind in proposal_kinds:
            continue
        sample_names = ", ".join(record.display_name for record in mentioned_records[:4])
        feedback_messages.append(
            f"Coverage gap: the diff explicitly names existing {kind} element(s) {sample_names}, "
            "but the proposal returned no entries of that kind."
        )

    if KINSHIP_CUE_PATTERN.search(diff_text) and not proposal_includes_relationship_context(proposal):
        feedback_messages.append(
            "Coverage gap: the diff contains kinship or relationship revelations. "
            "Include the affected people or the durable relationship element."
        )

    summary_text = f"{proposal.diff_summary} {proposal.rationale}"
    present_display_names = build_proposal_display_names(proposal)
    named_in_summary = [
        record.display_name
        for record in existing_index.records_by_uuid.values()
        if text_explicitly_mentions(summary_text, record.display_name)
        and normalize_lookup(record.display_name) not in present_display_names
    ]
    if named_in_summary:
        sample_names = ", ".join(named_in_summary[:4])
        feedback_messages.append(
            f"Consistency gap: the summary or rationale names {sample_names}, but those elements are missing."
        )

    return feedback_messages


def proposal_includes_relationship_context(proposal: ElementsProposal) -> bool:
    return any(str(decision.kind) in {"person", "relationship"} for decision in proposal.identified_elements)


def should_include_existing_mentions(history: list[HistoryEntry]) -> bool:
    keywords = ("coverage gap", "consistency gap", "missing", "include", "existing")
    return any(any(keyword in entry.reviewer_feedback.lower() for keyword in keywords) for entry in history)


def extract_added_lines(diff_text: str) -> list[str]:
    added_lines: list[str] = []
    for line in diff_text.splitlines():
        if not line.startswith("+") or line.startswith("+++"):
            continue
        added_lines.append(line[1:].strip())
    return added_lines


def extract_matching_evidence(diff_text: str, terms: list[str], limit: int = 2) -> list[str]:
    matching_lines: list[str] = []
    normalized_terms = [normalize_lookup(term) for term in terms if normalize_lookup(term) != ""]

    for line in extract_added_lines(diff_text):
        normalized_line = normalize_lookup(line)
        if not any(term in normalized_line for term in normalized_terms):
            continue
        matching_lines.append(line)
        if len(matching_lines) == limit:
            return matching_lines

    return matching_lines or extract_default_evidence(diff_text)


def extract_default_evidence(diff_text: str) -> list[str]:
    added_lines = extract_added_lines(diff_text)
    if added_lines:
        return added_lines[:2]
    return ["Deterministic stub evidence generated from the request diff."]


def resolve_existing_element(
    existing_index: ParsedElementsIndex,
    decision: ElementDecision,
) -> ElementRecord | None:
    if decision.matched_existing_uuid:
        matched_by_uuid = existing_index.records_by_uuid.get(decision.matched_existing_uuid)
        if matched_by_uuid is not None:
            return matched_by_uuid

    matched_by_name = existing_index.display_name_lookup.get(normalize_lookup(decision.display_name))
    if matched_by_name is not None:
        return matched_by_name

    matched_by_alias = resolve_unique_alias_lookup(existing_index.alias_lookup, decision.aliases)
    if matched_by_alias is not None:
        return matched_by_alias

    return resolve_first_lookup(existing_index.identification_key_lookup, decision.identification_keys)


def resolve_first_lookup(lookup: dict[str, ElementRecord], values: list[str]) -> ElementRecord | None:
    for value in values:
        matched_record = lookup.get(normalize_lookup(value))
        if matched_record is not None:
            return matched_record
    return None


def resolve_unique_alias_lookup(
    lookup: dict[str, list[ElementRecord]],
    values: list[str],
) -> ElementRecord | None:
    for value in values:
        matched_records = lookup.get(normalize_lookup(value), [])
        if len(matched_records) == 1:
            return matched_records[0]
    return None


def build_elements_index_proposal(
    diff_text: str,
    existing_index: ParsedElementsIndex,
    history: list[HistoryEntry],
) -> ElementsProposal:
    decisions = build_item_candidate_decisions(diff_text, existing_index)
    if should_include_existing_mentions(history):
        decisions.extend(build_existing_mention_decisions(diff_text, existing_index))

    deduped_decisions = dedupe_decisions(decisions)
    return ElementsProposal(
        diff_summary=f"Deterministic stub analysis found {len(deduped_decisions)} element candidate(s) in the diff.",
        rationale="Deterministic stage-2 logic scans reusable item cues first, then broadens coverage when feedback requests it.",
        identified_elements=deduped_decisions,
        approval_message="Review the proposed element creations and updates before applying them.",
    )


def build_item_candidate_decisions(
    diff_text: str,
    existing_index: ParsedElementsIndex,
) -> list[ElementDecision]:
    decisions: list[ElementDecision] = []

    for candidate in ITEM_CANDIDATES:
        if not candidate_matches_diff(candidate, diff_text):
            continue
        decisions.append(build_candidate_decision(candidate, diff_text, existing_index))

    return decisions


def candidate_matches_diff(candidate: DeterministicCandidate, diff_text: str) -> bool:
    normalized_diff = f" {normalize_lookup(diff_text)} "
    return any(normalize_lookup(pattern) in normalized_diff for pattern in candidate.patterns)


def build_candidate_decision(
    candidate: DeterministicCandidate,
    diff_text: str,
    existing_index: ParsedElementsIndex,
) -> ElementDecision:
    provisional_decision = ElementDecision(
        display_name=candidate.display_name,
        kind=candidate.kind,
        aliases=list(candidate.aliases),
        identification_keys=list(candidate.identification_keys),
        snapshot=candidate.snapshot,
        update_instruction=candidate.update_instruction,
        evidence_from_diff=extract_matching_evidence(diff_text, [candidate.display_name, *candidate.aliases]),
        matched_existing_display_name=None,
        matched_existing_uuid=None,
        is_new=True,
    )
    matched_record = resolve_existing_element(existing_index, provisional_decision)
    if matched_record is None:
        return provisional_decision
    return provisional_decision.model_copy(
        update={
            "matched_existing_display_name": matched_record.display_name,
            "matched_existing_uuid": matched_record.uuid,
            "is_new": False,
        }
    )


def build_existing_mention_decisions(
    diff_text: str,
    existing_index: ParsedElementsIndex,
) -> list[ElementDecision]:
    decisions: list[ElementDecision] = []
    mentions_by_kind = find_explicit_index_mentions(existing_index, diff_text)

    for kind in AUDITABLE_ELEMENT_KINDS:
        for record in mentions_by_kind.get(kind, []):
            decisions.append(
                ElementDecision(
                    display_name=record.display_name,
                    kind=ElementKind(record.kind),
                    aliases=[],
                    identification_keys=[],
                    snapshot=(
                        f"{record.display_name} is an existing {record.kind} that the diff materially references again."
                    ),
                    update_instruction=(
                        f"Carry the new manuscript evidence for {record.display_name} into downstream detail review."
                    ),
                    evidence_from_diff=extract_matching_evidence(
                        diff_text,
                        [record.display_name, *record.aliases],
                    ),
                    matched_existing_display_name=record.display_name,
                    matched_existing_uuid=record.uuid,
                    is_new=False,
                )
            )

    return decisions


def dedupe_decisions(decisions: list[ElementDecision]) -> list[ElementDecision]:
    deduped_decisions: list[ElementDecision] = []
    seen_keys: set[str] = set()

    for decision in decisions:
        decision_key = build_decision_key(decision)
        if decision_key in seen_keys:
            continue
        deduped_decisions.append(decision)
        seen_keys.add(decision_key)

    return deduped_decisions


def build_decision_key(decision: ElementDecision) -> str:
    if decision.matched_existing_uuid:
        return decision.matched_existing_uuid
    return f"{str(decision.kind)}::{normalize_lookup(decision.display_name)}"


def propose_elements_index_with_audit(
    diff_text: str,
    elements_markdown: str,
    history: list[HistoryEntry],
    proposal_builder: ProposalBuilder | None = None,
) -> ElementsProposal:
    existing_index = parse_elements_index(elements_markdown)
    builder = proposal_builder or build_elements_index_proposal
    proposal = builder(diff_text, existing_index, history)
    audit_feedback = audit_elements_coverage(proposal, existing_index, diff_text)
    if not audit_feedback:
        return proposal

    retry_history = [
        *history,
        HistoryEntry(
            attempt_number=len(history) + 1,
            previous_output=proposal.model_dump_json(indent=2),
            reviewer_feedback="\n".join(audit_feedback),
        ),
    ]
    retry_proposal = builder(diff_text, existing_index, retry_history)
    retry_audit_feedback = audit_elements_coverage(retry_proposal, existing_index, diff_text)
    if retry_audit_feedback:
        raise ApiError(
            error="proposal_audit_failed",
            message="The elements proposal failed audit after retry.",
            status_code=500,
            retryable=False,
            details=retry_audit_feedback,
        )
    return retry_proposal


def apply_elements_proposal(elements_markdown: str, proposal: ElementsProposal) -> LayerApplyResult:
    current_index = parse_elements_index(elements_markdown)
    detail_files: dict[str, str] = {}
    actions: list[str] = []

    for decision in proposal.identified_elements:
        matched_record = resolve_existing_element(current_index, decision)
        if matched_record is None:
            current_index, new_uuid = create_element_record(current_index, decision, detail_files)
            actions.append(f"Created element {new_uuid}: {decision.display_name} ({decision.kind.value}).")
            continue

        current_index, action = update_element_record(current_index, matched_record, decision)
        actions.append(action)

    index_markdown = render_elements_index_markdown(current_index)
    return LayerApplyResult(index_markdown=index_markdown, detail_files=detail_files, actions=actions)


def create_element_record(
    current_index: ParsedElementsIndex,
    decision: ElementDecision,
    detail_files: dict[str, str],
) -> tuple[ParsedElementsIndex, str]:
    new_uuid = build_uuid("elt", decision.kind.value, decision.display_name)
    new_record = ElementRecord(
        kind=decision.kind.value,
        display_name=decision.display_name,
        uuid=new_uuid,
        aliases=decision.aliases,
        identification_keys=decision.identification_keys,
    )
    detail_files[new_uuid] = build_element_detail_file(new_record, decision.snapshot)
    return register_record(current_index, new_record), new_uuid


def update_element_record(
    current_index: ParsedElementsIndex,
    matched_record: ElementRecord,
    decision: ElementDecision,
) -> tuple[ParsedElementsIndex, str]:
    merged_aliases, aliases_changed = merge_unique_values(matched_record.aliases, decision.aliases)
    merged_identification_keys, identification_keys_changed = merge_unique_values(
        matched_record.identification_keys,
        decision.identification_keys,
    )
    updated_record = ElementRecord(
        kind=matched_record.kind,
        display_name=matched_record.display_name,
        uuid=matched_record.uuid,
        aliases=merged_aliases,
        identification_keys=merged_identification_keys,
    )
    next_index = replace_record(current_index, updated_record)
    action = build_update_action(updated_record, aliases_changed, identification_keys_changed)
    return next_index, action


def merge_unique_values(existing_values: list[str], incoming_values: list[str]) -> tuple[list[str], bool]:
    merged_values = list(existing_values)
    known_values = {normalize_lookup(value) for value in existing_values}
    changed = False

    for value in incoming_values:
        normalized_value = normalize_lookup(value)
        if normalized_value == "" or normalized_value in known_values:
            continue
        merged_values.append(value)
        known_values.add(normalized_value)
        changed = True

    return merged_values, changed


def build_update_action(
    updated_record: ElementRecord,
    aliases_changed: bool,
    identification_keys_changed: bool,
) -> str:
    merged_fields = []
    if aliases_changed:
        merged_fields.append("aliases")
    if identification_keys_changed:
        merged_fields.append("identification keys")
    if not merged_fields:
        return f"Updated element {updated_record.uuid}: {updated_record.display_name}."
    if len(merged_fields) == 2:
        field_copy = "aliases and identification keys"
    else:
        field_copy = merged_fields[0]
    return f"Updated element {updated_record.uuid}: {updated_record.display_name} — merged {field_copy}."


def replace_record(current_index: ParsedElementsIndex, updated_record: ElementRecord) -> ParsedElementsIndex:
    next_records = dict(current_index.records_by_uuid)
    next_records[updated_record.uuid] = updated_record
    return build_index_state(current_index.index_preamble, next_records)


def register_record(current_index: ParsedElementsIndex, new_record: ElementRecord) -> ParsedElementsIndex:
    next_records = dict(current_index.records_by_uuid)
    next_records[new_record.uuid] = new_record
    return build_index_state(current_index.index_preamble, next_records)


def build_index_state(index_preamble: str, records_by_uuid: dict[str, ElementRecord]) -> ParsedElementsIndex:
    display_name_lookup: dict[str, ElementRecord] = {}
    alias_lookup: dict[str, list[ElementRecord]] = {}
    identification_key_lookup: dict[str, ElementRecord] = {}

    for record in records_by_uuid.values():
        register_lookup_value(display_name_lookup, record.display_name, record)
        for alias in record.aliases:
            register_alias_lookup_value(alias_lookup, alias, record)
        for identification_key in record.identification_keys:
            register_lookup_value(identification_key_lookup, identification_key, record)

    return ParsedElementsIndex(
        index_preamble=index_preamble,
        records_by_uuid=records_by_uuid,
        display_name_lookup=display_name_lookup,
        alias_lookup=alias_lookup,
        identification_key_lookup=identification_key_lookup,
    )


def render_elements_index_markdown(current_index: ParsedElementsIndex) -> str:
    index_preamble = current_index.index_preamble or ELEMENTS_INDEX_PREAMBLE
    entries = [renderable_entry(record) for record in current_index.records_by_uuid.values()]
    return render_index_markdown(index_preamble, entries, ELEMENT_FIELD_NAMES)


def renderable_entry(record: ElementRecord) -> dict[str, str]:
    return {
        "kind": record.kind,
        "display_name": record.display_name,
        "uuid": record.uuid,
        "aliases": ", ".join(record.aliases),
        "identification_keys": "; ".join(record.identification_keys),
    }


def build_element_detail_file(record: ElementRecord, snapshot: str) -> str:
    aliases = ", ".join(record.aliases) or record.display_name
    identification_keys = "; ".join(record.identification_keys) or "-"
    return f"""# {record.display_name}

## Identification
- UUID: {record.uuid}
- Type: {record.kind}
- Canonical name: {record.display_name}
- Aliases: {aliases}
- Identification keys: {identification_keys}

## Core Understanding
{snapshot}

## Stable Profile
- TBD

## Interpretation
- TBD

## Knowledge / Beliefs / Uncertainties
- TBD

## Element-Centered Chronology
- TBD

## Open Threads
- TBD
"""


def build_uuid(prefix: str, *parts: str) -> str:
    digest = sha1("::".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"
