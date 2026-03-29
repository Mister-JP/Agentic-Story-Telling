from __future__ import annotations

from dataclasses import dataclass
import re


PROVENANCE_HEADING = "## Provenance"
PROVENANCE_SUPPORT_HEADING = "### Support"
PROVENANCE_TBD_LINE = "- TBD"
PROVENANCE_LINE_PATTERN = re.compile(r"^-\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$")
DIFF_PATH_PATTERN = re.compile(r"^\+\+\+\s+b/(.+?)\s*$", flags=re.MULTILINE)


@dataclass(frozen=True, slots=True)
class ProvenanceReference:
    section: str
    claim: str
    source_path: str
    evidence_excerpt: str


@dataclass(frozen=True, slots=True)
class DetailImpact:
    affected_paths: tuple[str, ...]
    impacted_references: tuple[ProvenanceReference, ...]
    unaffected_references: tuple[ProvenanceReference, ...]
    unsupported_claim_labels: tuple[str, ...]
    has_unaffected_object_support: bool
    summary: str


def normalize_provenance_value(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def normalize_provenance_section(value: str) -> str:
    return normalize_provenance_value(value).upper()


def extract_affected_source_paths(diff_text: str) -> list[str]:
    seen_paths: set[str] = set()
    affected_paths: list[str] = []

    for match in DIFF_PATH_PATTERN.finditer(diff_text or ""):
        path = match.group(1).strip()
        if not path or path in seen_paths:
            continue
        affected_paths.append(path)
        seen_paths.add(path)

    return affected_paths


def parse_provenance_references(detail_markdown: str) -> list[ProvenanceReference]:
    section_text = extract_section(detail_markdown or "", PROVENANCE_HEADING)
    if not section_text:
        return []

    support_section = extract_subsection(section_text, PROVENANCE_SUPPORT_HEADING)
    if not support_section:
        support_section = section_text

    references: list[ProvenanceReference] = []
    for raw_line in support_section.splitlines():
        stripped_line = raw_line.strip()
        if stripped_line in {"", PROVENANCE_TBD_LINE, "TBD"} or stripped_line.startswith("### "):
            continue
        match = PROVENANCE_LINE_PATTERN.match(stripped_line)
        if not match:
            continue
        references.append(
            ProvenanceReference(
                section=normalize_provenance_section(match.group(1)),
                claim=normalize_provenance_value(match.group(2)),
                source_path=normalize_provenance_value(match.group(3)),
                evidence_excerpt=normalize_provenance_value(match.group(4)),
            )
        )
    return references


def render_provenance_section(references: list[ProvenanceReference]) -> list[str]:
    lines = [PROVENANCE_HEADING, PROVENANCE_SUPPORT_HEADING]
    if not references:
        lines.append(PROVENANCE_TBD_LINE)
        return lines

    def sort_key(reference: ProvenanceReference) -> tuple[str, str, str, str]:
        return (
            normalize_provenance_section(reference.section).lower(),
            normalize_provenance_value(reference.claim).lower(),
            normalize_provenance_value(reference.source_path).lower(),
            normalize_provenance_value(reference.evidence_excerpt).lower(),
        )

    for reference in sorted(references, key=sort_key):
        lines.append(
            "- "
            f"{normalize_provenance_section(reference.section)}"
            f" | {reference.claim} | {reference.source_path} | {reference.evidence_excerpt}"
        )
    return lines


def scan_impacted_detail_files(
    detail_files: dict[str, str],
    diff_text: str,
) -> dict[str, DetailImpact]:
    affected_paths = extract_affected_source_paths(diff_text)
    if not affected_paths:
        return {}

    affected_set = set(affected_paths)
    impacts: dict[str, DetailImpact] = {}
    for uuid, detail_markdown in (detail_files or {}).items():
        references = parse_provenance_references(detail_markdown)
        if not references:
            continue

        impacted_references = tuple(
            reference for reference in references if reference.source_path in affected_set
        )
        if not impacted_references:
            continue

        unaffected_references = tuple(
            reference for reference in references if reference.source_path not in affected_set
        )
        unsupported_claim_labels = tuple(
            sorted({
                build_claim_label(reference)
                for reference in impacted_references
                if not any(
                    normalize_provenance_section(other_reference.section)
                    == normalize_provenance_section(reference.section)
                    and other_reference.claim == reference.claim
                    for other_reference in unaffected_references
                )
            })
        )
        has_unaffected_object_support = any(
            normalize_provenance_section(reference.section) == "OBJECT"
            for reference in unaffected_references
        )
        impacts[uuid] = DetailImpact(
            affected_paths=tuple(affected_paths),
            impacted_references=impacted_references,
            unaffected_references=unaffected_references,
            unsupported_claim_labels=unsupported_claim_labels,
            has_unaffected_object_support=has_unaffected_object_support,
            summary=build_impact_summary(
                affected_paths=affected_paths,
                impacted_references=impacted_references,
                unaffected_references=unaffected_references,
                unsupported_claim_labels=list(unsupported_claim_labels),
            ),
        )
    return impacts


def replace_provenance_references(
    current_references: list[ProvenanceReference],
    replacement_lines: list[str],
) -> list[ProvenanceReference]:
    if not replacement_lines:
        return list(current_references)
    replacement_text = "\n".join(f"- {line}" if not line.lstrip().startswith("- ") else line for line in replacement_lines)
    return parse_provenance_references(
        f"{PROVENANCE_HEADING}\n{PROVENANCE_SUPPORT_HEADING}\n{replacement_text}\n"
    )


def build_claim_label(reference: ProvenanceReference) -> str:
    return f"{normalize_provenance_section(reference.section)}: {reference.claim}"


def build_impact_summary(
    *,
    affected_paths: list[str],
    impacted_references: tuple[ProvenanceReference, ...],
    unaffected_references: tuple[ProvenanceReference, ...],
    unsupported_claim_labels: list[str],
) -> str:
    summary_parts = [f"Affected manuscript paths: {', '.join(affected_paths)}."]

    has_impacted_object_support = any(
        normalize_provenance_section(reference.section) == "OBJECT"
        for reference in impacted_references
    )
    has_unaffected_object_support = any(
        normalize_provenance_section(reference.section) == "OBJECT"
        for reference in unaffected_references
    )
    if has_impacted_object_support and not has_unaffected_object_support:
        summary_parts.append("All current OBJECT support comes from affected manuscript paths.")
    elif has_impacted_object_support and has_unaffected_object_support:
        summary_parts.append("This object still has OBJECT support in unaffected manuscript paths.")

    if unsupported_claim_labels:
        summary_parts.append(
            "Claims supported only by affected manuscript paths: "
            + "; ".join(unsupported_claim_labels[:6])
            + "."
        )
    else:
        summary_parts.append("Every impacted claim still has at least one unaffected support edge.")

    sample_evidence = [
        f"{reference.source_path}: {reference.evidence_excerpt}"
        for reference in impacted_references[:3]
    ]
    if sample_evidence:
        summary_parts.append("Impacted evidence: " + " | ".join(sample_evidence) + ".")

    return " ".join(summary_parts)


def extract_section(text: str, heading: str) -> str:
    lines = (text or "").splitlines()
    capture = False
    captured_lines: list[str] = []

    for line in lines:
        stripped_line = line.strip()
        if stripped_line == heading:
            capture = True
            continue
        if capture and stripped_line.startswith("## "):
            break
        if capture:
            captured_lines.append(line)

    return "\n".join(captured_lines).strip()


def extract_subsection(text: str, heading: str) -> str:
    lines = (text or "").splitlines()
    capture = False
    captured_lines: list[str] = []

    for line in lines:
        stripped_line = line.strip()
        if stripped_line == heading:
            capture = True
            continue
        if capture and stripped_line.startswith("### "):
            break
        if capture:
            captured_lines.append(line)

    return "\n".join(captured_lines).strip()
