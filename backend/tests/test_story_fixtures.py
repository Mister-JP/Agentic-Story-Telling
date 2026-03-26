"""
Smoke tests for story/ world-model fixture data.

These tests validate that the markdown index files and detail files
are well-formed and match the expected counts. They act as regression
guards: if a commit accidentally corrupts the world-model data, these
tests will fail immediately.
"""
import re
import pytest
from pathlib import Path


# ── Index structure ───────────────────────────────────────────────────────

class TestElementsIndex:
    def test_has_elements_header(self, elements_index_text):
        assert "# Elements" in elements_index_text

    def test_has_entries_section(self, elements_index_text):
        assert "## Entries" in elements_index_text

    def test_has_exactly_9_entries(self, element_entries):
        assert len(element_entries) == 9, (
            f"Expected 9 element entries, got {len(element_entries)}"
        )

    def test_every_entry_has_5_fields(self, element_entries):
        for entry in element_entries:
            assert all(entry[k] for k in ("kind", "display_name", "uuid")), (
                f"Entry {entry} is missing required fields"
            )

    def test_all_uuids_are_unique(self, element_entries):
        uuids = [e["uuid"] for e in element_entries]
        assert len(uuids) == len(set(uuids)), "Duplicate UUIDs found in elements index"

    def test_uuids_match_elt_prefix(self, element_entries):
        for e in element_entries:
            assert e["uuid"].startswith("elt_"), (
                f"UUID {e['uuid']} does not start with 'elt_'"
            )

    def test_known_kinds_only(self, element_entries):
        allowed_kinds = {"person", "place", "item", "relationship", "group", "concept", "other"}
        for e in element_entries:
            assert e["kind"] in allowed_kinds, (
                f"Unknown kind '{e['kind']}' for element {e['display_name']}"
            )

    def test_mira_entry_exists(self, element_entries):
        names = [e["display_name"] for e in element_entries]
        assert "Mira" in names

    def test_expected_elements_present(self, element_entries):
        names = {e["display_name"] for e in element_entries}
        expected = {"Mira", "Arun", "Elias", "Sister Celine", "Saint Alder Chapel",
                    "Silver Key", "Toll House Ledger Page", "Cloth Bundle", "Cracked Watch"}
        assert expected.issubset(names), f"Missing elements: {expected - names}"


class TestEventsIndex:
    def test_has_events_header(self, events_index_text):
        assert "# Events" in events_index_text

    def test_has_entries_section(self, events_index_text):
        assert "## Entries" in events_index_text

    def test_has_exactly_7_entries(self, event_entries):
        assert len(event_entries) == 7, (
            f"Expected 7 event entries, got {len(event_entries)}"
        )

    def test_every_entry_has_4_fields(self, event_entries):
        for e in event_entries:
            assert all(e[k] for k in ("uuid", "when", "chapters", "summary")), (
                f"Event entry {e} is missing required fields"
            )

    def test_all_uuids_are_unique(self, event_entries):
        uuids = [e["uuid"] for e in event_entries]
        assert len(uuids) == len(set(uuids)), "Duplicate UUIDs in events index"

    def test_uuids_match_evt_prefix(self, event_entries):
        for e in event_entries:
            assert e["uuid"].startswith("evt_"), (
                f"UUID {e['uuid']} does not start with 'evt_'"
            )

    def test_chapters_reference_7_or_8(self, event_entries):
        for e in event_entries:
            assert re.search(r"Chapter [78]", e["chapters"]), (
                f"Unexpected chapter reference: {e['chapters']}"
            )


# ── Detail file directory counts ──────────────────────────────────────────

class TestDetailFileCounts:
    def test_elements_dir_has_9_detail_files(self, elements_dir: Path):
        md_files = [f for f in elements_dir.iterdir()
                    if f.suffix == ".md" and not f.name.startswith(".")]
        assert len(md_files) == 9, (
            f"Expected 9 element detail files, found {len(md_files)}: {[f.name for f in md_files]}"
        )

    def test_events_dir_has_7_detail_files(self, events_dir: Path):
        md_files = [f for f in events_dir.iterdir()
                    if f.suffix == ".md" and not f.name.startswith(".")]
        assert len(md_files) == 7, (
            f"Expected 7 event detail files, found {len(md_files)}: {[f.name for f in md_files]}"
        )

    def test_all_element_detail_filenames_match_index(self, element_entries, elements_dir: Path):
        """Every UUID in the index must have a corresponding detail file."""
        for e in element_entries:
            expected_file = elements_dir / f"{e['uuid']}.md"
            assert expected_file.is_file(), (
                f"Detail file missing for element {e['display_name']} ({e['uuid']})"
            )

    def test_all_event_detail_filenames_match_index(self, event_entries, events_dir: Path):
        """Every UUID in the index must have a corresponding detail file."""
        for e in event_entries:
            expected_file = events_dir / f"{e['uuid']}.md"
            assert expected_file.is_file(), (
                f"Detail file missing for event {e['uuid']}"
            )


# ── Detail file structure — Mira (element) ────────────────────────────────

class TestMiraDetailFile:
    REQUIRED_SECTIONS = [
        "## Identification",
        "## Core Understanding",
        "## Element-Centered Chronology",
        "## Open Threads",
    ]

    def test_starts_with_h1_title(self, mira_detail_text):
        assert mira_detail_text.startswith("# Mira"), (
            "Mira detail file must start with '# Mira'"
        )

    def test_has_identification_section(self, mira_detail_text):
        assert "## Identification" in mira_detail_text

    def test_has_uuid_in_identification(self, mira_detail_text):
        assert "elt_45d617e4531b" in mira_detail_text

    def test_has_core_understanding_section(self, mira_detail_text):
        assert "## Core Understanding" in mira_detail_text

    def test_has_chronology_section(self, mira_detail_text):
        assert "## Element-Centered Chronology" in mira_detail_text

    def test_has_open_threads_section(self, mira_detail_text):
        assert "## Open Threads" in mira_detail_text

    def test_chronology_has_chapter_7(self, mira_detail_text):
        assert "Chapter 7" in mira_detail_text

    def test_chronology_has_chapter_8(self, mira_detail_text):
        assert "Chapter 8" in mira_detail_text

    def test_all_required_sections_present(self, mira_detail_text):
        for section in self.REQUIRED_SECTIONS:
            assert section in mira_detail_text, f"Missing section: {section}"


# ── Detail file structure — Letter event ─────────────────────────────────

class TestLetterEventDetailFile:
    REQUIRED_SECTIONS = [
        "## Identification",
        "## Core Understanding",
        "## Participants & Roles",
        "## Evidence & Grounding",
        "## Open Threads",
    ]

    def test_starts_with_h1_title(self, letter_event_detail_text):
        first_line = letter_event_detail_text.splitlines()[0]
        assert first_line.startswith("# "), (
            f"Event detail must start with h1, got: {first_line!r}"
        )

    def test_has_uuid_in_identification(self, letter_event_detail_text):
        assert "evt_f72bc8fe0f29" in letter_event_detail_text

    def test_all_required_sections_present(self, letter_event_detail_text):
        for section in self.REQUIRED_SECTIONS:
            assert section in letter_event_detail_text, f"Missing section: {section}"

    def test_has_chapter_7_reference(self, letter_event_detail_text):
        assert "Chapter 7" in letter_event_detail_text


# ── All detail files start with h1 ───────────────────────────────────────

class TestAllDetailFilesWellFormed:
    def test_all_element_details_start_with_h1(self, elements_dir: Path):
        for f in sorted(elements_dir.glob("*.md")):
            text = f.read_text(encoding="utf-8")
            assert text.startswith("# "), (
                f"{f.name} does not start with an h1 heading"
            )

    def test_all_event_details_start_with_h1(self, events_dir: Path):
        for f in sorted(events_dir.glob("*.md")):
            text = f.read_text(encoding="utf-8")
            assert text.startswith("# "), (
                f"{f.name} does not start with an h1 heading"
            )

    def test_all_element_details_have_identification(self, elements_dir: Path):
        for f in sorted(elements_dir.glob("*.md")):
            text = f.read_text(encoding="utf-8")
            assert "## Identification" in text, (
                f"{f.name} is missing ## Identification section"
            )

    def test_all_event_details_have_identification(self, events_dir: Path):
        for f in sorted(events_dir.glob("*.md")):
            text = f.read_text(encoding="utf-8")
            assert "## Identification" in text, (
                f"{f.name} is missing ## Identification section"
            )
