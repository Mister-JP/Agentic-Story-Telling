from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Iterator

SUPPORTED_LAYER_NAMES = frozenset({"elements", "events"})


@dataclass(frozen=True, slots=True)
class LayerFilePaths:
    index_file: Path
    detail_directory: Path


@dataclass(frozen=True, slots=True)
class LayerContent:
    index_markdown: str
    detail_files: dict[str, str]


@contextmanager
def temporary_story_workspace() -> Iterator[Path]:
    with TemporaryDirectory() as temp_directory:
        workspace_root = Path(temp_directory)
        (workspace_root / "story").mkdir(parents=True, exist_ok=True)
        yield workspace_root


def validate_layer_name(layer_name: str) -> None:
    if layer_name not in SUPPORTED_LAYER_NAMES:
        raise ValueError(f"Unsupported layer: {layer_name}")


def get_layer_file_paths(storage_root: Path, layer_name: str) -> LayerFilePaths:
    validate_layer_name(layer_name)
    story_root = storage_root / "story"
    return LayerFilePaths(
        index_file=story_root / f"{layer_name}.md",
        detail_directory=story_root / layer_name,
    )


def write_layer_content(storage_root: Path, layer_name: str, layer_content: LayerContent) -> None:
    file_paths = get_layer_file_paths(storage_root, layer_name)
    file_paths.detail_directory.mkdir(parents=True, exist_ok=True)
    file_paths.index_file.write_text(layer_content.index_markdown, encoding="utf-8")
    write_detail_files(file_paths.detail_directory, layer_content.detail_files)


def write_detail_files(detail_directory: Path, detail_files: dict[str, str]) -> None:
    for uuid, markdown in detail_files.items():
        detail_path = detail_directory / f"{uuid}.md"
        detail_path.write_text(markdown, encoding="utf-8")


def read_layer_content(storage_root: Path, layer_name: str) -> LayerContent:
    file_paths = get_layer_file_paths(storage_root, layer_name)
    index_markdown = read_text_file(file_paths.index_file)
    detail_files = read_detail_files(file_paths.detail_directory)
    return LayerContent(index_markdown=index_markdown, detail_files=detail_files)


def read_text_file(file_path: Path) -> str:
    if not file_path.exists():
        return ""
    return file_path.read_text(encoding="utf-8")


def read_detail_files(detail_directory: Path) -> dict[str, str]:
    if not detail_directory.exists():
        return {}

    detail_files: dict[str, str] = {}
    for detail_path in sorted(detail_directory.glob("*.md")):
        detail_files[detail_path.stem] = detail_path.read_text(encoding="utf-8")
    return detail_files
