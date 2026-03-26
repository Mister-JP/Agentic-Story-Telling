from __future__ import annotations

from pathlib import Path

import pytest

from backend.temp_storage import LayerContent, get_layer_file_paths, read_layer_content, temporary_story_workspace, write_layer_content


def test_layer_content_round_trip_preserves_index_and_details() -> None:
    layer_content = LayerContent(
        index_markdown="# Events\n\n## Entries\n- evt_123 | June 28, 1998 | Chapter 8 | Chapel door opens\n",
        detail_files={"evt_123": "# Chapel door opens\n\n## Identification\n- UUID: evt_123\n"},
    )

    with temporary_story_workspace() as workspace_root:
        write_layer_content(workspace_root, "events", layer_content)
        restored_content = read_layer_content(workspace_root, "events")

    assert restored_content.index_markdown == layer_content.index_markdown
    assert restored_content.detail_files == layer_content.detail_files


def test_get_layer_file_paths_raises_for_unknown_layer() -> None:
    with pytest.raises(ValueError):
        get_layer_file_paths(Path("."), "unknown")
