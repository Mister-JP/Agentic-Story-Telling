"""
pytest fixtures for the story/ world-model data.
These fixtures read the actual files from disk — they act as both test
helpers and live regression guards for the world-model markdown files.
"""
import sys
from pathlib import Path

import pytest

# Repo root is two levels up from backend/tests/: backend/tests -> backend -> repo root
REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_SRC = REPO_ROOT / "backend" / "src"
STORY_DIR = REPO_ROOT / "story"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))


@pytest.fixture(scope="session")
def story_dir() -> Path:
    """Absolute path to the story/ directory."""
    assert STORY_DIR.is_dir(), f"story/ directory not found at {STORY_DIR}"
    return STORY_DIR


@pytest.fixture(scope="session")
def elements_dir(story_dir: Path) -> Path:
    """Absolute path to story/elements/."""
    d = story_dir / "elements"
    assert d.is_dir(), f"story/elements/ not found at {d}"
    return d


@pytest.fixture(scope="session")
def events_dir(story_dir: Path) -> Path:
    """Absolute path to story/events/."""
    d = story_dir / "events"
    assert d.is_dir(), f"story/events/ not found at {d}"
    return d


@pytest.fixture(scope="session")
def elements_index_text(story_dir: Path) -> str:
    """Full text of story/elements.md."""
    p = story_dir / "elements.md"
    assert p.is_file(), f"elements.md not found at {p}"
    return p.read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def events_index_text(story_dir: Path) -> str:
    """Full text of story/events.md."""
    p = story_dir / "events.md"
    assert p.is_file(), f"events.md not found at {p}"
    return p.read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def mira_detail_text(elements_dir: Path) -> str:
    """Full text of story/elements/elt_45d617e4531b.md (Mira)."""
    p = elements_dir / "elt_45d617e4531b.md"
    assert p.is_file(), f"Mira detail file not found at {p}"
    return p.read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def letter_event_detail_text(events_dir: Path) -> str:
    """Full text of story/events/evt_f72bc8fe0f29.md (Mira receives letter)."""
    p = events_dir / "evt_f72bc8fe0f29.md"
    assert p.is_file(), f"Letter event detail file not found at {p}"
    return p.read_text(encoding="utf-8")


# ── Parsing helpers (used by tests) ──────────────────────────────────────

def parse_entry_lines(index_text: str) -> list[str]:
    """Return the pipe-delimited entry lines from an index file."""
    in_entries = False
    lines = []
    for line in index_text.splitlines():
        if line.strip() == "## Entries":
            in_entries = True
            continue
        if in_entries and line.startswith("- "):
            lines.append(line[2:].strip())
    return lines


@pytest.fixture(scope="session")
def element_entries(elements_index_text: str) -> list[dict]:
    """Parsed element index entries as dicts."""
    result = []
    for line in parse_entry_lines(elements_index_text):
        parts = [p.strip() for p in line.split("|")]
        result.append({
            "kind": parts[0] if len(parts) > 0 else "",
            "display_name": parts[1] if len(parts) > 1 else "",
            "uuid": parts[2] if len(parts) > 2 else "",
            "aliases": parts[3] if len(parts) > 3 else "",
            "identification_keys": parts[4] if len(parts) > 4 else "",
        })
    return result


@pytest.fixture(scope="session")
def event_entries(events_index_text: str) -> list[dict]:
    """Parsed event index entries as dicts."""
    result = []
    for line in parse_entry_lines(events_index_text):
        parts = [p.strip() for p in line.split("|")]
        result.append({
            "uuid": parts[0] if len(parts) > 0 else "",
            "when": parts[1] if len(parts) > 1 else "",
            "chapters": parts[2] if len(parts) > 2 else "",
            "summary": parts[3] if len(parts) > 3 else "",
        })
    return result
