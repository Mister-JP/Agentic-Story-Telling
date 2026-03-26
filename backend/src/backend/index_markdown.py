from __future__ import annotations

from dataclasses import dataclass

ENTRIES_HEADING = "## Entries"
ENTRY_PREFIX = "- "
FIELD_SEPARATOR = " | "


@dataclass(frozen=True, slots=True)
class ParsedIndexMarkdown:
    index_preamble: str
    entries: list[dict[str, str]]


def parse_index_markdown(markdown: str, field_names: list[str]) -> ParsedIndexMarkdown:
    if not markdown.strip():
        return ParsedIndexMarkdown(index_preamble="", entries=[])

    heading_index = markdown.find(ENTRIES_HEADING)
    if heading_index == -1:
        return ParsedIndexMarkdown(index_preamble=markdown.strip(), entries=[])

    index_preamble = markdown[:heading_index].rstrip()
    entries_block = markdown[heading_index + len(ENTRIES_HEADING) :]
    entries = parse_entry_lines(entries_block, field_names)
    return ParsedIndexMarkdown(index_preamble=index_preamble, entries=entries)


def parse_entry_lines(entries_block: str, field_names: list[str]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for raw_line in entries_block.splitlines():
        stripped_line = raw_line.strip()
        if not stripped_line.startswith(ENTRY_PREFIX):
            continue
        entry = parse_entry_line(stripped_line[len(ENTRY_PREFIX) :], field_names)
        if entry:
            entries.append(entry)
    return entries


def parse_entry_line(raw_line: str, field_names: list[str]) -> dict[str, str] | None:
    parts = [part.strip() for part in raw_line.split("|")]
    if len(parts) < len(field_names):
        return None

    entry: dict[str, str] = {}
    for index, field_name in enumerate(field_names):
        entry[field_name] = parts[index]
    return entry


def render_index_markdown(
    index_preamble: str,
    entries: list[dict[str, str]],
    field_names: list[str],
) -> str:
    safe_preamble = index_preamble.rstrip()
    entry_lines = [render_entry_line(entry, field_names) for entry in entries]
    joined_entry_lines = "\n".join(line for line in entry_lines if line)
    return f"{safe_preamble}\n\n{ENTRIES_HEADING}\n{joined_entry_lines}\n"


def render_entry_line(entry: dict[str, str], field_names: list[str]) -> str:
    values = [entry.get(field_name, "").strip() for field_name in field_names]
    return f"{ENTRY_PREFIX}{FIELD_SEPARATOR.join(values)}"
