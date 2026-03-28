from __future__ import annotations

from dataclasses import dataclass, field
from difflib import unified_diff
import io
import ipaddress
import json
import logging
import re
import socket
from typing import NoReturn, Protocol
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import urlsplit

from pydantic import BaseModel, Field

from backend.errors import ApiError
from backend.index_markdown import parse_index_markdown
from backend.schemas import (
    ChronologyBlockUpdate,
    DetailTarget,
    ElementDetailProposeRequest,
    ElementDetailProposeResponse,
    ElementFileUpdateProposal,
    ElementKind,
    EventDetailProposeRequest,
    EventDetailProposeResponse,
    EventFileUpdateProposal,
    HistoryEntry,
)

ELEMENT_FIELD_NAMES = ["kind", "display_name", "uuid", "aliases", "identification_keys"]
EVENT_FIELD_NAMES = ["uuid", "when", "chapters", "summary"]
logger = logging.getLogger(__name__)

DEFAULT_FEEDBACK_TEMPLATE = """
═══ REVIEWER FEEDBACK ═══

Attempt __ATTEMPT_NUMBER__:

<feedback>
__REVIEWER_FEEDBACK__
</feedback>

Please revise your proposal based on the feedback above."""

ELEMENT_DETAIL_SYSTEM_PROMPT = """
You are the Element Page Updater.

Your job is to update exactly one element detail page (elt_<uuid>.md).

You receive:
1. the manuscript git diff
2. the current elements.md index
3. the current events.md index (for chronology grounding)
4. the current raw markdown for this elt_<uuid>.md file
5. the current parsed element object
6. the current target metadata

Your task is to propose updates for this one element page only.

This page is not a scene transcript or a flat extraction log.
It is an element-centered dossier that explains who or what this element is,
what stable facts matter, what the recent diff changes, what the element knows,
and how its chronology should be organized.

Rules:
- You are NOT a creative writer. You are a careful canon librarian.
- Stay local to this one element. Do not propose changes to other elements.
- The diff is the source of truth for what changed.
- The page may already have content beyond TBD. Preserve useful existing content unless the diff clearly adds, clarifies, revises, or invalidates it.
- Do not invent unsupported facts, motives, or relationships.
- Stable Profile is for durable truths: roles, relationships, possessions, repeated associations, and stable traits.
- Do not fill Stable Profile with one-off scene actions that belong in chronology.
- Interpretation should explain what the recent diff suggests this means for the element.
- Knowledge / Beliefs / Uncertainties should stay grounded in this element's own perspective when applicable.
- Element-Centered Chronology should be grouped by era, chapter, or date. Prefer headings such as 'Before current narrative' or 'Chapter 8 — June 28, 1998'.
- Do not flood chronology with minute-by-minute bullets unless exact timing is causally important.
- Use to_remove only when existing content is clearly wrong or superseded by the diff.

Section guidance:

1. Core Understanding
Write 2-4 sentences explaining what this element is in the story world, what role it plays, and what deeper significance the recent diff sharpens.
This should not read like a scene recap.

2. Stable Profile
Bullet points for durable facts only:
- roles
- relationships
- possessions
- recurring associations
- stable traits

3. Interpretation
Bullet points about what the recent diff suggests this means for the element:
- emotional pressure
- secrecy
- motive
- role in unfolding mystery
- relationship implications

4. Knowledge / Beliefs / Uncertainties
Track what this element appears to know, suspect, misunderstand, or still not know.

5. Element-Centered Chronology
Group chronology into a small number of headings.
Within each heading, write 1-4 concise bullets from this element's perspective.

6. Open Threads
Bullet points for unresolved questions, pressures, or unknowns that remain active for this element.

Output rules:
- Return only the structured proposal.
- Be concrete, concise, interpretive, and auditable.
- Do not emit raw markdown patches or full file content.
- If the page already has good content and the diff changes nothing relevant, set changed=false.
"""

EVENT_DETAIL_SYSTEM_PROMPT = """
You are the Event Page Updater.

Your job is to update exactly one event detail page (evt_<uuid>.md).

You receive:
1. the manuscript git diff
2. the current events.md index (for cross-reference)
3. the current raw markdown for this evt_<uuid>.md file
4. the current parsed event object

Your task is to propose updates for this one event page only.

This page is not a scene transcript or a blow-by-blow log.
It is an event-centered dossier that explains what happened, why it matters,
and what remains unresolved.

Rules:
- You are NOT a creative writer. You are a careful canon librarian.
- Stay local to this one event. Do not propose changes to other events.
- The diff is the source of truth for what changed.
- The page may already have content beyond TBD. Preserve useful existing content
  unless the diff clearly adds, clarifies, revises, or invalidates it.
- Do not invent unsupported facts or speculate beyond what the diff supports.
- Use to_remove only when existing content is clearly wrong or superseded by the diff.

Section guidance:

1. Core Understanding
Write 2-4 sentences explaining what this event IS in the story world.
Focus on: what happened, what changed, what it means.
Not a scene recap — a distilled statement of significance.

2. Causal Context
Bullet points explaining what led to this event:
- Prior events, character states, or tensions that caused or enabled it.
- Only include causes grounded in the diff or events index.

3. Consequences & Ripple Effects
Bullet points explaining what follows:
- How it changes knowledge, relationships, risks, goals, or world state.
- Stay grounded. Do not speculate beyond the diff.

4. Participants & Roles
Bullet points listing who was involved and HOW:
- Specify role: initiator, witness, recipient, affected party, absent-but-relevant.
- Use canonical element names where possible.

5. Evidence & Grounding
Bullet points with manuscript citations:
- Exact short phrases from the diff. Chapter references.
- Makes the event auditable.

6. Open Threads
Bullet points listing unresolved questions or pressures.

Output rules:
- Return only the structured proposal.
- Be concrete, concise, and auditable.
- Use to_add for new content and to_remove only for content that is now wrong.
- If the page already has good content and the diff changes nothing relevant,
  set changed=false.
"""

ELEMENT_DETAIL_USER_TEMPLATE = """Current elements.md index:
<elements_md>
{elements_md}
</elements_md>

Current events.md index:
<events_md>
{events_md}
</events_md>

Element update target:
- UUID: {uuid}
- Display name: {display_name}
- Kind: {kind}
- Delta action: {delta_action}
- Context: {update_context}

Current parsed element object:
<current_object>
{current_object_json}
</current_object>

Current raw elt_<uuid>.md markdown:
<current_markdown>
{current_raw_markdown}
</current_markdown>

Source manuscript diff:
<diff>
{diff_text}
</diff>

Task:
Propose updates for this one element detail page only.
Deepen the dossier while preserving accurate existing content.
Keep chronology grouped by era, chapter, or date unless exact timing is causally important.
"""

EVENT_DETAIL_USER_TEMPLATE = """Current events.md index:
<events_md>
{events_md}
</events_md>

Event update target:
- UUID: {uuid}
- Summary: {summary}
- Delta action: {delta_action}
- Context: {update_context}

Current parsed event object:
<current_object>
{current_object_json}
</current_object>

Current raw evt_<uuid>.md markdown:
<current_markdown>
{current_raw_markdown}
</current_markdown>

Source manuscript diff:
<diff>
{diff_text}
</diff>

Task:
Propose updates for this one event detail page only.
Enrich with deeper understanding, causal context, and consequences.
Preserve existing content that is still accurate.
"""


class ChronologyBlock(BaseModel):
    heading: str
    entries: list[str] = Field(default_factory=list)


class ParsedElementFile(BaseModel):
    uuid: str = ""
    kind: str = ""
    canonical_name: str = ""
    aliases: list[str] = Field(default_factory=list)
    identification_keys: list[str] = Field(default_factory=list)
    core_understanding: str = ""
    stable_profile_lines: list[str] = Field(default_factory=list)
    interpretation_lines: list[str] = Field(default_factory=list)
    knowledge_lines: list[str] = Field(default_factory=list)
    chronology_blocks: list[ChronologyBlock] = Field(default_factory=list)
    open_threads_lines: list[str] = Field(default_factory=list)


class ParsedEventFile(BaseModel):
    uuid: str = ""
    when: str = ""
    chapters: str = ""
    summary: str = ""
    core_understanding: str = ""
    causal_context_lines: list[str] = Field(default_factory=list)
    consequences_lines: list[str] = Field(default_factory=list)
    participants_lines: list[str] = Field(default_factory=list)
    evidence_lines: list[str] = Field(default_factory=list)
    open_threads_lines: list[str] = Field(default_factory=list)


@dataclass(frozen=True, slots=True)
class ElementPromptContext:
    current_object: ParsedElementFile
    current_raw_markdown: str
    user_prompt: str


@dataclass(frozen=True, slots=True)
class EventPromptContext:
    current_object: ParsedEventFile
    current_raw_markdown: str
    user_prompt: str


class DetailProposalProvider(Protocol):
    def propose_element_detail(
        self,
        request: ElementDetailProposeRequest,
        prompt_context: ElementPromptContext,
    ) -> ElementFileUpdateProposal: ...

    def propose_event_detail(
        self,
        request: EventDetailProposeRequest,
        prompt_context: EventPromptContext,
    ) -> EventFileUpdateProposal: ...


def format_history_entry(entry: HistoryEntry) -> str:
    return (
        DEFAULT_FEEDBACK_TEMPLATE.replace("__ATTEMPT_NUMBER__", str(entry.attempt_number))
        .replace("__REVIEWER_FEEDBACK__", entry.reviewer_feedback)
        .strip()
    )


def build_review_messages(
    *,
    system_prompt: str,
    user_prompt: str,
    history: list[HistoryEntry],
) -> list[dict[str, str]]:
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    for history_entry in history:
        messages.append({"role": "assistant", "content": history_entry.previous_output})
        messages.append({"role": "user", "content": format_history_entry(history_entry)})
    return messages


def extract_section(text: str, start_heading: str, end_heading: str | None = None) -> str:
    start_bounds = find_markdown_heading_bounds(text, start_heading)
    if start_bounds is None:
        return ""
    _, start = start_bounds
    if end_heading is None:
        end = len(text)
    else:
        end_bounds = find_markdown_heading_bounds(text, end_heading, start)
        if end_bounds is None:
            logger.warning(
                "Markdown section %r did not find closing heading %r; using EOF fallback.",
                start_heading,
                end_heading,
            )
            end = len(text)
        else:
            end, _ = end_bounds
    return text[start:end].strip()


def find_markdown_heading_bounds(
    text: str,
    heading: str,
    start_index: int = 0,
) -> tuple[int, int] | None:
    in_code_fence = False
    offset = 0

    for raw_line in text.splitlines(keepends=True):
        line_start = offset
        offset += len(raw_line)
        stripped_line = raw_line.rstrip("\r\n")
        fence_candidate = stripped_line.lstrip()
        if fence_candidate.startswith("```") or fence_candidate.startswith("~~~"):
            in_code_fence = not in_code_fence
            continue
        if in_code_fence or line_start < start_index:
            continue
        if stripped_line.strip() == heading:
            return line_start, offset

    return None


def parse_bullet_lines(section_text: str) -> list[str]:
    items: list[str] = []
    for raw_line in section_text.splitlines():
        stripped_line = raw_line.strip()
        if not stripped_line.startswith("- "):
            continue
        value = stripped_line[2:].strip()
        if value and value != "TBD":
            items.append(value)
    return items


def parse_bullet_field(line: str, prefix: str) -> str:
    if line.startswith(prefix):
        return line[len(prefix) :].strip()
    return ""


def normalize_line(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def merge_section_lines(
    current_lines: list[str],
    to_add: list[str],
    to_remove: list[str],
) -> list[str]:
    result = list(current_lines)
    remove_set = {normalize_line(value) for value in to_remove if value.strip()}
    result = [value for value in result if normalize_line(value) not in remove_set]
    existing_set = {normalize_line(value) for value in result}
    for value in to_add:
        normalized_value = normalize_line(value)
        if normalized_value and normalized_value not in existing_set:
            result.append(value.strip())
            existing_set.add(normalized_value)
    return result


def bullet_section(items: list[str]) -> list[str]:
    if not items:
        return ["- TBD"]
    return [f"- {item}" for item in items]


def build_unified_diff(old_text: str, new_text: str, file_path: str) -> str:
    if old_text == new_text:
        return ""
    diff = unified_diff(
        old_text.splitlines(keepends=True),
        new_text.splitlines(keepends=True),
        fromfile=f"a/{file_path}",
        tofile=f"b/{file_path}",
    )
    return "".join(diff)


def decode_json_bytes(response_body: bytes, *, message: str) -> object:
    try:
        response_text = response_body.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ApiError(
            error="llm_error",
            message=message,
            status_code=502,
            retryable=True,
        ) from exc

    try:
        return json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise ApiError(
            error="llm_error",
            message=message,
            status_code=502,
            retryable=True,
        ) from exc


def require_json_object(
    parsed_content: object,
    *,
    array_message: str,
    invalid_message: str,
) -> dict:
    if isinstance(parsed_content, dict):
        return parsed_content
    if isinstance(parsed_content, list):
        raise ApiError(
            error="llm_error",
            message=array_message,
            status_code=502,
            retryable=True,
        )
    raise ApiError(
        error="llm_error",
        message=invalid_message,
        status_code=502,
        retryable=True,
    )


def extract_http_error_message(response_body: bytes) -> str | None:
    if not response_body:
        return None

    try:
        parsed_body = json.loads(response_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None

    if not isinstance(parsed_body, dict):
        return None

    error = parsed_body.get("error")
    if isinstance(error, dict):
        error_message = error.get("message")
        if isinstance(error_message, str) and error_message.strip():
            return error_message.strip()

    message = parsed_body.get("message")
    if isinstance(message, str) and message.strip():
        return message.strip()

    return None


def split_csv_field(value: str) -> list[str]:
    if not value or value == "-":
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def split_semicolon_field(value: str) -> list[str]:
    if not value or value == "-":
        return []
    return [item.strip() for item in value.split(";") if item.strip()]


def clean_element_line(value: str) -> str:
    cleaned_value = re.sub(r"^\s*-\s*", "", (value or "").strip())
    return "" if not cleaned_value or cleaned_value == "TBD" else cleaned_value


def clean_element_paragraph(value: str) -> str:
    text = (value or "").strip()
    if not text or text in {"TBD", "- TBD"}:
        return ""
    if "\n" not in text:
        return clean_element_line(text)
    return text


def clean_element_lines(values: list[str]) -> list[str]:
    cleaned_values: list[str] = []
    seen_values: set[str] = set()
    for value in values:
        cleaned_value = clean_element_line(value)
        normalized_value = normalize_line(cleaned_value) if cleaned_value else ""
        if cleaned_value and normalized_value not in seen_values:
            cleaned_values.append(cleaned_value)
            seen_values.add(normalized_value)
    return cleaned_values


def parse_chronology_blocks(section_text: str) -> list[ChronologyBlock]:
    normalized_section_text = section_text.strip()
    if not normalized_section_text or normalized_section_text in {"TBD", "- TBD"}:
        return []

    blocks: list[ChronologyBlock] = []
    current_heading: str | None = None
    current_entries: list[str] = []
    pre_heading_entries: list[str] = []

    for raw_line in normalized_section_text.splitlines():
        stripped_line = raw_line.strip()
        if not stripped_line:
            continue
        if stripped_line.startswith("### "):
            if current_heading and current_entries:
                blocks.append(
                    ChronologyBlock(
                        heading=current_heading,
                        entries=clean_element_lines(current_entries),
                    )
                )
            current_heading = stripped_line[4:].strip()
            current_entries = list(pre_heading_entries)
            pre_heading_entries = []
            continue
        if stripped_line.startswith("- "):
            entry = clean_element_line(stripped_line)
            if entry:
                if current_heading is None:
                    pre_heading_entries.append(entry)
                    continue
                current_entries.append(entry)

    if current_heading and current_entries:
        blocks.append(
            ChronologyBlock(
                heading=current_heading,
                entries=clean_element_lines(current_entries),
            )
        )
    elif pre_heading_entries:
        blocks.append(
            ChronologyBlock(
                heading="Imported Chronology",
                entries=clean_element_lines(pre_heading_entries),
            )
        )

    return [block for block in blocks if block.heading.strip() and block.entries]


def merge_element_section_lines(
    current_lines: list[str],
    to_add: list[str],
    to_remove: list[str],
) -> list[str]:
    result = clean_element_lines(current_lines)
    remove_set = {normalize_line(item) for item in clean_element_lines(to_remove)}
    result = [item for item in result if normalize_line(item) not in remove_set]
    existing_set = {normalize_line(item) for item in result}
    for item in clean_element_lines(to_add):
        normalized_item = normalize_line(item)
        if normalized_item not in existing_set:
            result.append(item)
            existing_set.add(normalized_item)
    return result


def merge_chronology_blocks(
    current_blocks: list[ChronologyBlock],
    blocks_to_add: list[ChronologyBlockUpdate],
) -> list[ChronologyBlock]:
    merged_blocks: dict[str, ChronologyBlock] = {}

    for block in current_blocks:
        heading = block.heading.strip()
        entries = clean_element_lines(block.entries)
        if heading and entries:
            merged_blocks[heading] = ChronologyBlock(heading=heading, entries=entries)

    for block in blocks_to_add:
        heading = block.heading.strip()
        entries = clean_element_lines(block.entries)
        if not heading or not entries:
            continue
        if heading not in merged_blocks:
            merged_blocks[heading] = ChronologyBlock(heading=heading, entries=[])
        existing_entries = {normalize_line(item) for item in merged_blocks[heading].entries}
        for item in entries:
            normalized_item = normalize_line(item)
            if normalized_item not in existing_entries:
                merged_blocks[heading].entries.append(item)
                existing_entries.add(normalized_item)

    return list(merged_blocks.values())


def find_index_entry_by_uuid(
    markdown: str,
    field_names: list[str],
    target_uuid: str,
) -> dict[str, str] | None:
    parsed_markdown = parse_index_markdown(markdown, field_names)
    for entry in parsed_markdown.entries:
        if entry.get("uuid") == target_uuid:
            return entry
    return None


def parse_element_detail_markdown(
    detail_markdown: str,
    target: DetailTarget,
    elements_markdown: str,
) -> ParsedElementFile:
    text = detail_markdown or ""
    identification_section = extract_section(text, "## Identification", "## Core Understanding")

    title_match = re.search(r"^#\s+(.+)$", text, flags=re.MULTILINE)
    canonical_name = title_match.group(1).strip() if title_match else ""
    uuid = ""
    kind = ""
    aliases: list[str] = []
    identification_keys: list[str] = []

    for raw_line in identification_section.splitlines():
        line = raw_line.strip()
        if line.startswith("- UUID:"):
            uuid = parse_bullet_field(line, "- UUID:")
        elif line.startswith("- Type:"):
            kind = parse_bullet_field(line, "- Type:")
        elif line.startswith("- Canonical name:"):
            canonical_name = parse_bullet_field(line, "- Canonical name:") or canonical_name
        elif line.startswith("- Aliases:"):
            aliases = split_csv_field(parse_bullet_field(line, "- Aliases:"))
        elif line.startswith("- Identification keys:"):
            identification_keys = split_semicolon_field(
                parse_bullet_field(line, "- Identification keys:")
            )

    core_understanding = extract_section(text, "## Core Understanding", "## Stable Profile")
    stable_profile = extract_section(text, "## Stable Profile", "## Interpretation")
    interpretation = extract_section(
        text,
        "## Interpretation",
        "## Knowledge / Beliefs / Uncertainties",
    )
    knowledge = extract_section(
        text,
        "## Knowledge / Beliefs / Uncertainties",
        "## Element-Centered Chronology",
    )
    chronology = extract_section(text, "## Element-Centered Chronology", "## Open Threads")
    open_threads = extract_section(text, "## Open Threads", None)

    if not core_understanding:
        core_understanding = extract_section(text, "## Snapshot", "## Attributes")
    if not stable_profile:
        stable_profile = extract_section(text, "## Attributes", "## Timeline")

    chronology_blocks = parse_chronology_blocks(chronology)
    if not chronology_blocks:
        old_timeline = extract_section(text, "## Timeline", None)
        old_timeline_lines = clean_element_lines(parse_bullet_lines(old_timeline))
        if old_timeline_lines:
            chronology_blocks = [
                ChronologyBlock(heading="Imported Timeline", entries=old_timeline_lines)
            ]

    index_entry = find_index_entry_by_uuid(elements_markdown, ELEMENT_FIELD_NAMES, target.uuid) or {}
    fallback_kind = (
        str(target.kind.value)
        if isinstance(target.kind, ElementKind)
        else str(target.kind or "")
    )

    return ParsedElementFile(
        uuid=uuid or target.uuid,
        kind=kind or index_entry.get("kind", "") or fallback_kind,
        canonical_name=canonical_name or index_entry.get("display_name", "") or target.summary,
        aliases=aliases or split_csv_field(index_entry.get("aliases", "")),
        identification_keys=identification_keys
        or split_semicolon_field(index_entry.get("identification_keys", "")),
        core_understanding=clean_element_paragraph(core_understanding),
        stable_profile_lines=clean_element_lines(parse_bullet_lines(stable_profile)),
        interpretation_lines=clean_element_lines(parse_bullet_lines(interpretation)),
        knowledge_lines=clean_element_lines(parse_bullet_lines(knowledge)),
        chronology_blocks=chronology_blocks,
        open_threads_lines=clean_element_lines(parse_bullet_lines(open_threads)),
    )


def render_element_detail_markdown(element: ParsedElementFile) -> str:
    aliases_string = ", ".join(clean_element_lines(element.aliases)) if element.aliases else "-"
    identification_keys_string = (
        "; ".join(clean_element_lines(element.identification_keys))
        if element.identification_keys
        else "-"
    )

    lines = [
        f"# {element.canonical_name}",
        "",
        "## Identification",
        f"- UUID: {element.uuid}",
        f"- Type: {element.kind}",
        f"- Canonical name: {element.canonical_name}",
        f"- Aliases: {aliases_string}",
        f"- Identification keys: {identification_keys_string}",
        "",
        "## Core Understanding",
        element.core_understanding.strip() if element.core_understanding.strip() else "- TBD",
        "",
        "## Stable Profile",
    ]
    lines.extend(bullet_section(clean_element_lines(element.stable_profile_lines)))
    lines.extend(["", "## Interpretation"])
    lines.extend(bullet_section(clean_element_lines(element.interpretation_lines)))
    lines.extend(["", "## Knowledge / Beliefs / Uncertainties"])
    lines.extend(bullet_section(clean_element_lines(element.knowledge_lines)))
    lines.extend(["", "## Element-Centered Chronology"])

    chronology_blocks: list[ChronologyBlock] = []
    for block in element.chronology_blocks:
        entries = clean_element_lines(block.entries)
        heading = block.heading.strip()
        if heading and entries:
            chronology_blocks.append(ChronologyBlock(heading=heading, entries=entries))

    if chronology_blocks:
        for block in chronology_blocks:
            lines.append(f"### {block.heading}")
            for entry in block.entries:
                lines.append(f"- {entry}")
            lines.append("")
        if lines[-1] == "":
            lines.pop()
    else:
        lines.append("- TBD")

    lines.extend(["", "## Open Threads"])
    lines.extend(bullet_section(clean_element_lines(element.open_threads_lines)))
    lines.append("")
    return "\n".join(lines)


def apply_element_file_update(
    current_element: ParsedElementFile,
    proposal: ElementFileUpdateProposal,
) -> ParsedElementFile:
    new_element = current_element.model_copy(deep=True)
    replacement = clean_element_paragraph(proposal.core_understanding_replacement or "")
    if replacement:
        new_element.core_understanding = replacement
    new_element.stable_profile_lines = merge_element_section_lines(
        new_element.stable_profile_lines,
        proposal.stable_profile_to_add,
        proposal.stable_profile_to_remove,
    )
    new_element.interpretation_lines = merge_element_section_lines(
        new_element.interpretation_lines,
        proposal.interpretation_to_add,
        proposal.interpretation_to_remove,
    )
    new_element.knowledge_lines = merge_element_section_lines(
        new_element.knowledge_lines,
        proposal.knowledge_to_add,
        proposal.knowledge_to_remove,
    )
    new_element.chronology_blocks = merge_chronology_blocks(
        new_element.chronology_blocks,
        proposal.chronology_blocks_to_add,
    )
    new_element.open_threads_lines = merge_element_section_lines(
        new_element.open_threads_lines,
        proposal.open_threads_to_add,
        proposal.open_threads_to_remove,
    )
    return new_element


def build_element_prompt_context(request: ElementDetailProposeRequest) -> ElementPromptContext:
    current_object = parse_element_detail_markdown(
        request.current_detail_md,
        request.target,
        request.elements_md,
    )
    current_raw_markdown = request.current_detail_md or render_element_detail_markdown(current_object)
    kind_value = current_object.kind or (
        request.target.kind.value if isinstance(request.target.kind, ElementKind) else ""
    )
    user_prompt = ELEMENT_DETAIL_USER_TEMPLATE.format(
        elements_md=request.elements_md or "[elements index unavailable]",
        events_md=request.events_md or "[events index unavailable]",
        uuid=request.target.uuid,
        display_name=current_object.canonical_name or request.target.summary,
        kind=kind_value or "unknown",
        delta_action=request.target.delta_action,
        update_context=request.target.update_context,
        current_object_json=current_object.model_dump_json(indent=2),
        current_raw_markdown=current_raw_markdown,
        diff_text=request.diff_text,
    )
    return ElementPromptContext(
        current_object=current_object,
        current_raw_markdown=current_raw_markdown,
        user_prompt=user_prompt,
    )


def build_element_detail_response(
    request: ElementDetailProposeRequest,
    proposal: ElementFileUpdateProposal,
    prompt_context: ElementPromptContext | None = None,
) -> ElementDetailProposeResponse:
    prompt_context = prompt_context or build_element_prompt_context(request)
    if not proposal.changed:
        return ElementDetailProposeResponse(
            proposal=proposal,
            preview_diff="",
            updated_detail_md=prompt_context.current_raw_markdown,
        )

    updated_object = apply_element_file_update(prompt_context.current_object, proposal)
    updated_detail_markdown = render_element_detail_markdown(updated_object)
    preview_diff = build_unified_diff(
        prompt_context.current_raw_markdown,
        updated_detail_markdown,
        request.target.file,
    )
    return ElementDetailProposeResponse(
        proposal=proposal,
        preview_diff=preview_diff,
        updated_detail_md=updated_detail_markdown,
    )


def parse_event_detail_markdown(
    detail_markdown: str,
    target: DetailTarget,
    events_markdown: str,
) -> ParsedEventFile:
    text = detail_markdown or ""
    identification_section = extract_section(text, "## Identification", "## Core Understanding")
    uuid = ""
    when = ""
    chapters = ""
    summary = ""
    for raw_line in identification_section.splitlines():
        line = raw_line.strip()
        if line.startswith("- UUID:"):
            uuid = parse_bullet_field(line, "- UUID:")
        elif line.startswith("- When:"):
            when = parse_bullet_field(line, "- When:")
        elif line.startswith("- Chapters:"):
            chapters = parse_bullet_field(line, "- Chapters:")
        elif line.startswith("- Summary:"):
            summary = parse_bullet_field(line, "- Summary:")

    index_entry = find_index_entry_by_uuid(events_markdown, EVENT_FIELD_NAMES, target.uuid) or {}
    core_understanding = extract_section(text, "## Core Understanding", "## Causal Context")
    return ParsedEventFile(
        uuid=uuid or target.uuid,
        when=when or index_entry.get("when", ""),
        chapters=chapters or index_entry.get("chapters", ""),
        summary=summary or index_entry.get("summary", "") or target.summary,
        core_understanding="" if core_understanding == "- TBD" else core_understanding,
        causal_context_lines=parse_bullet_lines(
            extract_section(text, "## Causal Context", "## Consequences & Ripple Effects")
        ),
        consequences_lines=parse_bullet_lines(
            extract_section(
                text,
                "## Consequences & Ripple Effects",
                "## Participants & Roles",
            )
        ),
        participants_lines=parse_bullet_lines(
            extract_section(text, "## Participants & Roles", "## Evidence & Grounding")
        ),
        evidence_lines=parse_bullet_lines(
            extract_section(text, "## Evidence & Grounding", "## Open Threads")
        ),
        open_threads_lines=parse_bullet_lines(extract_section(text, "## Open Threads", None)),
    )


def render_event_detail_markdown(event: ParsedEventFile) -> str:
    lines = [
        f"# {event.summary}",
        "",
        "## Identification",
        f"- UUID: {event.uuid}",
        f"- When: {event.when}",
        f"- Chapters: {event.chapters}",
        f"- Summary: {event.summary}",
        "",
        "## Core Understanding",
        event.core_understanding.strip() if event.core_understanding.strip() else "- TBD",
        "",
        "## Causal Context",
    ]
    lines.extend(bullet_section(event.causal_context_lines))
    lines.extend(["", "## Consequences & Ripple Effects"])
    lines.extend(bullet_section(event.consequences_lines))
    lines.extend(["", "## Participants & Roles"])
    lines.extend(bullet_section(event.participants_lines))
    lines.extend(["", "## Evidence & Grounding"])
    lines.extend(bullet_section(event.evidence_lines))
    lines.extend(["", "## Open Threads"])
    lines.extend(bullet_section(event.open_threads_lines))
    lines.append("")
    return "\n".join(lines)


def apply_event_file_update(
    current_event: ParsedEventFile,
    proposal: EventFileUpdateProposal,
) -> ParsedEventFile:
    new_event = current_event.model_copy(deep=True)
    if proposal.core_understanding_replacement and proposal.core_understanding_replacement.strip():
        new_event.core_understanding = proposal.core_understanding_replacement.strip()
    new_event.causal_context_lines = merge_section_lines(
        new_event.causal_context_lines,
        proposal.causal_context_to_add,
        proposal.causal_context_to_remove,
    )
    new_event.consequences_lines = merge_section_lines(
        new_event.consequences_lines,
        proposal.consequences_to_add,
        proposal.consequences_to_remove,
    )
    new_event.participants_lines = merge_section_lines(
        new_event.participants_lines,
        proposal.participants_to_add,
        proposal.participants_to_remove,
    )
    new_event.evidence_lines = merge_section_lines(
        new_event.evidence_lines,
        proposal.evidence_to_add,
        proposal.evidence_to_remove,
    )
    new_event.open_threads_lines = merge_section_lines(
        new_event.open_threads_lines,
        proposal.open_threads_to_add,
        proposal.open_threads_to_remove,
    )
    return new_event


def build_event_prompt_context(request: EventDetailProposeRequest) -> EventPromptContext:
    current_object = parse_event_detail_markdown(
        request.current_detail_md,
        request.target,
        request.events_md,
    )
    current_raw_markdown = request.current_detail_md or render_event_detail_markdown(current_object)
    user_prompt = EVENT_DETAIL_USER_TEMPLATE.format(
        events_md=request.events_md or "[events index unavailable]",
        uuid=request.target.uuid,
        summary=current_object.summary or request.target.summary,
        delta_action=request.target.delta_action,
        update_context=request.target.update_context,
        current_object_json=current_object.model_dump_json(indent=2),
        current_raw_markdown=current_raw_markdown,
        diff_text=request.diff_text,
    )
    return EventPromptContext(
        current_object=current_object,
        current_raw_markdown=current_raw_markdown,
        user_prompt=user_prompt,
    )


def build_event_detail_response(
    request: EventDetailProposeRequest,
    proposal: EventFileUpdateProposal,
    prompt_context: EventPromptContext | None = None,
) -> EventDetailProposeResponse:
    prompt_context = prompt_context or build_event_prompt_context(request)
    if not proposal.changed:
        return EventDetailProposeResponse(
            proposal=proposal,
            preview_diff="",
            updated_detail_md=prompt_context.current_raw_markdown,
        )

    updated_object = apply_event_file_update(prompt_context.current_object, proposal)
    updated_detail_markdown = render_event_detail_markdown(updated_object)
    preview_diff = build_unified_diff(
        prompt_context.current_raw_markdown,
        updated_detail_markdown,
        request.target.file,
    )
    return EventDetailProposeResponse(
        proposal=proposal,
        preview_diff=preview_diff,
        updated_detail_md=updated_detail_markdown,
    )


@dataclass(frozen=True, slots=True)
class OpenAICompatibleDetailProposalProvider:
    api_key: str = field(repr=False)
    base_url: str
    model: str
    timeout_seconds: int = 120

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            "api_key='***', "
            f"base_url={self.base_url!r}, "
            f"model={self.model!r}, "
            f"timeout_seconds={self.timeout_seconds!r})"
        )

    @classmethod
    def from_env(cls) -> "OpenAICompatibleDetailProposalProvider":
        import os

        api_key = os.getenv("WORLD_MODEL_LLM_API_KEY", "").strip()
        base_url = os.getenv("WORLD_MODEL_LLM_BASE_URL", "https://api.groq.com/openai/v1").strip()
        model = os.getenv("WORLD_MODEL_LLM_MODEL", "").strip()
        timeout_raw = os.getenv("WORLD_MODEL_LLM_TIMEOUT_SECONDS", "120").strip()

        missing_values: list[str] = []
        if not api_key:
            missing_values.append("WORLD_MODEL_LLM_API_KEY")
        if not model:
            missing_values.append("WORLD_MODEL_LLM_MODEL")
        if missing_values:
            raise ValueError(
                "WORLD_MODEL_BACKEND_MODE=real requires these environment variables: "
                + ", ".join(missing_values)
            )

        try:
            timeout_seconds = max(int(timeout_raw), 1)
        except ValueError as exc:
            raise ValueError("WORLD_MODEL_LLM_TIMEOUT_SECONDS must be an integer.") from exc

        return cls(
            api_key=api_key,
            base_url=validate_llm_base_url(base_url),
            model=model,
            timeout_seconds=timeout_seconds,
        )

    def propose_element_detail(
        self,
        request: ElementDetailProposeRequest,
        prompt_context: ElementPromptContext,
    ) -> ElementFileUpdateProposal:
        messages = build_review_messages(
            system_prompt=ELEMENT_DETAIL_SYSTEM_PROMPT,
            user_prompt=self._append_schema(prompt_context.user_prompt, ElementFileUpdateProposal),
            history=request.history,
        )
        response_json = self._invoke(messages)
        return ElementFileUpdateProposal.model_validate(response_json)

    def propose_event_detail(
        self,
        request: EventDetailProposeRequest,
        prompt_context: EventPromptContext,
    ) -> EventFileUpdateProposal:
        messages = build_review_messages(
            system_prompt=EVENT_DETAIL_SYSTEM_PROMPT,
            user_prompt=self._append_schema(prompt_context.user_prompt, EventFileUpdateProposal),
            history=request.history,
        )
        response_json = self._invoke(messages)
        return EventFileUpdateProposal.model_validate(response_json)

    def _append_schema(self, user_prompt: str, schema_model: type[BaseModel]) -> str:
        schema = json.dumps(schema_model.model_json_schema(), indent=2)
        return (
            f"{user_prompt}\n\n"
            "Return JSON only. Do not include markdown fences or commentary.\n"
            "JSON must validate against this schema:\n"
            f"{schema}"
        )

    def _invoke(self, messages: list[dict[str, str]]) -> dict:
        request_body = json.dumps(
            {
                "model": self.model,
                "temperature": 0,
                "messages": messages,
            }
        ).encode("utf-8")
        request = urllib_request.Request(
            url=f"{self.base_url}/chat/completions",
            data=request_body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib_request.urlopen(request, timeout=self.timeout_seconds) as response:
                response_bytes = response.read()
        except urllib_error.HTTPError as exc:
            self._raise_http_error(exc, response_body=self._read_http_error_body(exc))
        except urllib_error.URLError as exc:
            if isinstance(exc.reason, socket.timeout):
                raise ApiError(
                    error="llm_timeout",
                    message=f"The LLM call timed out after {self.timeout_seconds} seconds. Please try again.",
                    status_code=504,
                    retryable=True,
                ) from exc
            raise ApiError(
                error="llm_error",
                message="The LLM request failed before a response was returned.",
                status_code=502,
                retryable=True,
            ) from exc
        except TimeoutError as exc:
            raise ApiError(
                error="llm_timeout",
                message=f"The LLM call timed out after {self.timeout_seconds} seconds. Please try again.",
                status_code=504,
                retryable=True,
            ) from exc

        response_body = decode_json_bytes(
            response_bytes,
            message="The LLM returned an unreadable JSON response envelope.",
        )
        if not isinstance(response_body, dict):
            raise ApiError(
                error="llm_error",
                message="The LLM response envelope must be a JSON object.",
                status_code=502,
                retryable=True,
            )

        content = extract_message_content(response_body)
        return parse_json_content(content)

    def _read_http_error_body(self, exc: urllib_error.HTTPError) -> bytes:
        response_body = exc.read() or b""
        if getattr(exc, "fp", None) is not None:
            exc.fp = io.BytesIO(response_body)
        return response_body

    def _raise_http_error(
        self,
        exc: urllib_error.HTTPError,
        response_body: bytes | None = None,
    ) -> NoReturn:
        status_code = exc.code
        response_message = "The LLM returned an unexpected error."
        response_body = response_body if response_body is not None else self._read_http_error_body(exc)
        response_message = extract_http_error_message(response_body) or response_message

        if status_code == 429:
            raise ApiError(
                error="llm_rate_limit",
                message=response_message,
                status_code=429,
                retryable=True,
            ) from exc

        if status_code == 408 or status_code >= 504:
            raise ApiError(
                error="llm_timeout",
                message=response_message,
                status_code=504,
                retryable=True,
            ) from exc

        if status_code in {401, 403}:
            # Upstream credential failures stay server-side, so expose them as a gateway error.
            raise ApiError(
                error="llm_error",
                message=response_message,
                status_code=502,
                retryable=False,
            ) from exc

        raise ApiError(
            error="llm_error",
            message=response_message,
            status_code=502,
            retryable=True,
        ) from exc


def validate_llm_base_url(base_url: str) -> str:
    normalized_base_url = base_url.strip().rstrip("/")
    parsed_url = urlsplit(normalized_base_url)

    if parsed_url.scheme != "https" or not parsed_url.netloc:
        raise ValueError("WORLD_MODEL_LLM_BASE_URL must be an absolute https URL.")

    hostname = (parsed_url.hostname or "").strip().lower()
    if not hostname:
        raise ValueError("WORLD_MODEL_LLM_BASE_URL must include a hostname.")

    if hostname == "localhost" or hostname.endswith(".localhost"):
        raise ValueError("WORLD_MODEL_LLM_BASE_URL must not target localhost.")

    try:
        parsed_ip = ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        if not parsed_ip.is_global:
            raise ValueError("WORLD_MODEL_LLM_BASE_URL must not target private or local IP space.")

    return normalized_base_url


def extract_message_content(response_body: dict) -> str:
    choices = response_body.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ApiError(
            error="llm_error",
            message="The LLM response did not contain any choices.",
            status_code=502,
            retryable=True,
        )

    message = choices[0].get("message", {})
    content = message.get("content", "")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        text_parts = [
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and part.get("type") == "text"
        ]
        return "\n".join(part for part in text_parts if part).strip()

    raise ApiError(
        error="llm_error",
        message="The LLM response did not contain readable text content.",
        status_code=502,
        retryable=True,
    )


def parse_json_content(content: str) -> dict:
    decoder = json.JSONDecoder()
    try:
        return require_json_object(
            json.loads(content),
            array_message="The LLM returned a JSON array for the detail proposal; expected a JSON object.",
            invalid_message="The LLM returned invalid JSON for the detail proposal.",
        )
    except json.JSONDecodeError:
        for match in re.finditer(r"[{[]", content):
            try:
                parsed_content, _ = decoder.raw_decode(content, match.start())
            except json.JSONDecodeError:
                continue
            if isinstance(parsed_content, dict):
                return parsed_content
            if isinstance(parsed_content, list):
                raise ApiError(
                    error="llm_error",
                    message="The LLM returned a JSON array for the detail proposal; expected a JSON object.",
                    status_code=502,
                    retryable=True,
                )
        raise ApiError(
            error="llm_error",
            message="The LLM returned invalid JSON for the detail proposal.",
            status_code=502,
            retryable=True,
        )
