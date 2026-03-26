from __future__ import annotations

import pytest

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
