// Diff engine for the world-model sync pipeline.
// Converts Tiptap HTML → Markdown, snapshots workspace file content,
// detects changed files, and assembles unified diffs for the agentic harness.

import TurndownService from 'turndown';
import { createTwoFilesPatch } from 'diff';

// ── HTML → Markdown ──────────────────────────────────────────────────────

const turndownInstance = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

/**
 * Convert a Tiptap HTML content string into clean Markdown.
 * Returns an empty string for falsy or empty input.
 *
 * @param {string} htmlString  Raw HTML from the Tiptap editor.
 * @returns {string}  Equivalent Markdown text.
 */
export function htmlToMarkdown(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') {
    return '';
  }

  const trimmed = htmlString.trim();
  if (trimmed === '' || trimmed === '<p></p>') {
    return '';
  }

  return turndownInstance.turndown(htmlString);
}

// ── Workspace snapshot ───────────────────────────────────────────────────

/**
 * Walk a workspace tree and build a snapshot of every file's content as Markdown.
 *
 * @param {object} workspace  The root workspace tree node.
 * @returns {Record<string, {name: string, path: string, markdown: string}>}
 *   Map of fileId → { name, path (display path), markdown (converted content) }.
 */
export function createContentSnapshot(workspace) {
  if (!workspace || typeof workspace !== 'object') {
    return {};
  }

  const snapshot = {};
  collectFiles(workspace, [], snapshot);
  return snapshot;
}

function collectFiles(node, pathSegments, snapshot) {
  if (node.type === 'file') {
    const filePath = [...pathSegments, node.name].join('/');
    snapshot[node.id] = {
      name: node.name,
      path: filePath,
      markdown: htmlToMarkdown(node.content ?? ''),
    };
    return;
  }

  if (node.type !== 'folder' || !Array.isArray(node.children)) {
    return;
  }

  // Skip the root "workspace" node from the display path
  const nextSegments = pathSegments.length === 0 && node.name === 'workspace'
    ? []
    : [...pathSegments, node.name];

  for (const child of node.children) {
    collectFiles(child, nextSegments, snapshot);
  }
}

// ── Changed-file detection ───────────────────────────────────────────────

/**
 * Compare a current snapshot against a previously synced snapshot.
 * Returns a list of files that have been added, modified, or deleted.
 *
 * @param {Record<string, {name: string, path: string, markdown: string}>} currentSnapshot
 * @param {Record<string, {name: string, path: string, markdown: string}>} lastSyncedSnapshot
 * @returns {Array<{fileId: string, fileName: string, filePath: string, status: 'added'|'modified'|'deleted'}>}
 */
export function getChangedFiles(currentSnapshot, lastSyncedSnapshot) {
  const current = currentSnapshot ?? {};
  const previous = lastSyncedSnapshot ?? {};
  const changedFiles = [];

  // Detect added and modified files
  for (const fileId of Object.keys(current)) {
    if (!(fileId in previous)) {
      changedFiles.push({
        fileId,
        fileName: current[fileId].name,
        filePath: current[fileId].path,
        status: 'added',
      });
      continue;
    }

    if (current[fileId].markdown !== previous[fileId].markdown) {
      changedFiles.push({
        fileId,
        fileName: current[fileId].name,
        filePath: current[fileId].path,
        status: 'modified',
      });
    }
  }

  // Detect deleted files
  for (const fileId of Object.keys(previous)) {
    if (!(fileId in current)) {
      changedFiles.push({
        fileId,
        fileName: previous[fileId].name,
        filePath: previous[fileId].path,
        status: 'deleted',
      });
    }
  }

  return changedFiles;
}

// ── Unified diff computation ─────────────────────────────────────────────

/**
 * Compute a unified diff between old and new content for a single file.
 *
 * @param {string} oldContent  Previous Markdown content (empty string for added files).
 * @param {string} newContent  Current Markdown content (empty string for deleted files).
 * @param {string} filePath    Display path used in diff headers (e.g. "story-structure/chapter-07.story").
 * @returns {string}  Unified diff text with standard `---`/`+++` headers.
 */
export function computeFileDiff(oldContent, newContent, filePath) {
  const safeOldContent = typeof oldContent === 'string' ? oldContent : '';
  const safeNewContent = typeof newContent === 'string' ? newContent : '';
  const safePath = typeof filePath === 'string' ? filePath : 'unknown';

  return createTwoFilesPatch(
    `a/${safePath}`,
    `b/${safePath}`,
    safeOldContent,
    safeNewContent,
    undefined,
    undefined,
    { context: 3 },
  );
}

// ── Combined diff assembly ───────────────────────────────────────────────

/**
 * Assemble a combined unified diff from the selected changed files.
 * Only files whose IDs appear in `selectedFileIds` are included.
 *
 * @param {Array<{fileId: string, status: string}>} changedFiles  Output of getChangedFiles().
 * @param {string[]} selectedFileIds  IDs of files the writer chose to include.
 * @param {Record<string, {path: string, markdown: string}>} currentSnapshot   Current snapshot.
 * @param {Record<string, {path: string, markdown: string}>} lastSyncedSnapshot  Previous snapshot.
 * @returns {string}  Concatenated unified diff text for all selected files.
 */
export function assembleCombinedDiff(
  changedFiles,
  selectedFileIds,
  currentSnapshot,
  lastSyncedSnapshot,
) {
  if (!Array.isArray(changedFiles) || !Array.isArray(selectedFileIds)) {
    return '';
  }

  const selectedSet = new Set(selectedFileIds);
  const current = currentSnapshot ?? {};
  const previous = lastSyncedSnapshot ?? {};
  const diffParts = [];

  for (const changedFile of changedFiles) {
    if (!selectedSet.has(changedFile.fileId)) {
      continue;
    }

    const filePath = current[changedFile.fileId]?.path
      ?? previous[changedFile.fileId]?.path
      ?? changedFile.fileId;

    const oldContent = previous[changedFile.fileId]?.markdown ?? '';
    const newContent = current[changedFile.fileId]?.markdown ?? '';

    diffParts.push(computeFileDiff(oldContent, newContent, filePath));
  }

  return diffParts.join('\n');
}

// ── Snapshot update after sync ───────────────────────────────────────────

/**
 * Build an updated snapshot after a partial sync completes.
 *
 * Only files included in `selectedFileIds` are refreshed from the current
 * snapshot. Files that no longer exist in `currentSnapshot` (deleted files)
 * are removed. Unselected files retain their previous snapshot values so
 * they continue to appear as "changed" in the next sync.
 *
 * @param {Record<string, object>} previousSnapshot   Snapshot from syncState.lastSyncedSnapshot.
 * @param {Record<string, object>} currentSnapshot    Snapshot of current workspace (from createContentSnapshot).
 * @param {string[]}               selectedFileIds    File IDs that were included in this sync.
 * @returns {Record<string, object>}  Merged snapshot to store as the new lastSyncedSnapshot.
 */
export function updateSnapshotAfterSync(
  previousSnapshot,
  currentSnapshot,
  selectedFileIds,
) {
  const safePrevious = previousSnapshot ?? {};
  const safeCurrent = currentSnapshot ?? {};
  const safeSelected = Array.isArray(selectedFileIds) ? selectedFileIds : [];

  const updatedSnapshot = { ...safePrevious };

  // Overwrite snapshot entries for each synced file
  const selectedSet = new Set(safeSelected);
  for (const fileId of selectedSet) {
    if (fileId in safeCurrent) {
      updatedSnapshot[fileId] = safeCurrent[fileId];
    }
  }

  // Remove entries for files that no longer exist in the workspace
  for (const fileId of Object.keys(updatedSnapshot)) {
    if (!(fileId in safeCurrent)) {
      delete updatedSnapshot[fileId];
    }
  }

  return updatedSnapshot;
}
