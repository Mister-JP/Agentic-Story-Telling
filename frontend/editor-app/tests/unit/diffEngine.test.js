import { describe, it, expect } from 'vitest';
import {
  htmlToMarkdown,
  createContentSnapshot,
  getChangedFiles,
  computeFileDiff,
  assembleCombinedDiff,
  updateSnapshotAfterSync,
} from '../../src/utils/diffEngine.js';
import {
  WORKSPACE_TWO_FILES,
  WORKSPACE_TWO_FILES_MODIFIED,
  WORKSPACE_WITH_ADDED_AND_DELETED,
} from '../fixtures/diffEngine.js';

// ── htmlToMarkdown ───────────────────────────────────────────────────────

describe('htmlToMarkdown', () => {
  it('converts a heading to ATX-style markdown', () => {
    const result = htmlToMarkdown('<h1>Opening scene</h1>');

    expect(result).toBe('# Opening scene');
  });

  it('converts a paragraph to plain text', () => {
    const result = htmlToMarkdown('<p>Start close to the character.</p>');

    expect(result).toBe('Start close to the character.');
  });

  it('converts bold text to markdown', () => {
    const result = htmlToMarkdown('<p><strong>Beginning:</strong> guarded.</p>');

    expect(result).toBe('**Beginning:** guarded.');
  });

  it('converts an unordered list to markdown', () => {
    const result = htmlToMarkdown('<ul><li>Hook the reader.</li><li>Reveal the problem.</li></ul>');

    expect(result).toContain('Hook the reader.');
    expect(result).toContain('Reveal the problem.');
  });

  it('converts a blockquote to markdown', () => {
    const result = htmlToMarkdown('<blockquote><p>A quote.</p></blockquote>');

    expect(result).toContain('> A quote.');
  });

  it('handles mixed heading and paragraph content', () => {
    const html = '<h1>Chapter 7</h1><p>The rain had stopped.</p>';
    const result = htmlToMarkdown(html);

    expect(result).toContain('# Chapter 7');
    expect(result).toContain('The rain had stopped.');
  });

  it('returns empty string for null input', () => {
    expect(htmlToMarkdown(null)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(htmlToMarkdown(undefined)).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(htmlToMarkdown('')).toBe('');
  });

  it('returns empty string for an empty Tiptap paragraph', () => {
    expect(htmlToMarkdown('<p></p>')).toBe('');
  });
});

// ── createContentSnapshot ────────────────────────────────────────────────

describe('createContentSnapshot', () => {
  it('extracts all 3 files from the workspace tree', () => {
    const snapshot = createContentSnapshot(WORKSPACE_TWO_FILES);
    const fileIds = Object.keys(snapshot);

    expect(fileIds).toHaveLength(3);
    expect(fileIds).toContain('chapter-07');
    expect(fileIds).toContain('chapter-08');
    expect(fileIds).toContain('notes-file');
  });

  it('each entry has name, path, and markdown fields', () => {
    const snapshot = createContentSnapshot(WORKSPACE_TWO_FILES);
    const chapter07 = snapshot['chapter-07'];

    expect(chapter07).toHaveProperty('name', 'chapter-07.story');
    expect(chapter07).toHaveProperty('path');
    expect(chapter07).toHaveProperty('markdown');
    expect(typeof chapter07.markdown).toBe('string');
  });

  it('resolves nested folder paths correctly', () => {
    const snapshot = createContentSnapshot(WORKSPACE_TWO_FILES);

    expect(snapshot['chapter-07'].path).toBe('story-structure/chapter-07.story');
    expect(snapshot['chapter-08'].path).toBe('story-structure/chapter-08.story');
  });

  it('resolves root-level file paths without workspace prefix', () => {
    const snapshot = createContentSnapshot(WORKSPACE_TWO_FILES);

    expect(snapshot['notes-file'].path).toBe('notes.story');
  });

  it('converts HTML content to markdown in each snapshot entry', () => {
    const snapshot = createContentSnapshot(WORKSPACE_TWO_FILES);

    expect(snapshot['chapter-07'].markdown).toContain('# Chapter 7');
    expect(snapshot['chapter-07'].markdown).toContain('walked to the chapel');
  });

  it('returns empty object for null workspace', () => {
    expect(createContentSnapshot(null)).toEqual({});
  });

  it('returns empty object for undefined workspace', () => {
    expect(createContentSnapshot(undefined)).toEqual({});
  });
});

// ── getChangedFiles ──────────────────────────────────────────────────────

describe('getChangedFiles', () => {
  it('detects modified files when content differs', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const modified = createContentSnapshot(WORKSPACE_TWO_FILES_MODIFIED);
    const changes = getChangedFiles(modified, baseline);

    const modifiedEntries = changes.filter(change => change.status === 'modified');
    const modifiedIds = modifiedEntries.map(entry => entry.fileId);

    expect(modifiedEntries).toHaveLength(2);
    expect(modifiedIds).toContain('chapter-07');
    expect(modifiedIds).toContain('chapter-08');
  });

  it('does not report unchanged files', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const modified = createContentSnapshot(WORKSPACE_TWO_FILES_MODIFIED);
    const changes = getChangedFiles(modified, baseline);

    const changedIds = changes.map(entry => entry.fileId);

    expect(changedIds).not.toContain('notes-file');
  });

  it('detects added files that are not in the old snapshot', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const withAdded = createContentSnapshot(WORKSPACE_WITH_ADDED_AND_DELETED);
    const changes = getChangedFiles(withAdded, baseline);

    const addedEntries = changes.filter(change => change.status === 'added');

    expect(addedEntries).toHaveLength(1);
    expect(addedEntries[0].fileId).toBe('chapter-09');
    expect(addedEntries[0].fileName).toBe('chapter-09.story');
  });

  it('ignores newly added files whose markdown is empty', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const withEmptyAdded = createContentSnapshot({
      ...WORKSPACE_TWO_FILES,
      children: [
        ...WORKSPACE_TWO_FILES.children,
        {
          id: 'empty-added-file',
          name: 'scratch.story',
          type: 'file',
          content: '<p></p>',
        },
      ],
    });
    const changes = getChangedFiles(withEmptyAdded, baseline);

    expect(changes.map(change => change.fileId)).not.toContain('empty-added-file');
  });

  it('ignores modified files whose markdown was cleared to empty', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const withClearedFile = createContentSnapshot({
      ...WORKSPACE_TWO_FILES,
      children: WORKSPACE_TWO_FILES.children.map((node) => {
        if (node.id !== 'story-folder') {
          return node;
        }

        return {
          ...node,
          children: node.children.map((child) => (
            child.id === 'chapter-07'
              ? { ...child, content: '<p></p>' }
              : child
          )),
        };
      }),
    });
    const changes = getChangedFiles(withClearedFile, baseline);

    expect(changes.map(change => change.fileId)).not.toContain('chapter-07');
  });

  it('detects deleted files that are in old snapshot but not current', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const withDeleted = createContentSnapshot(WORKSPACE_WITH_ADDED_AND_DELETED);
    const changes = getChangedFiles(withDeleted, baseline);

    const deletedEntries = changes.filter(change => change.status === 'deleted');

    expect(deletedEntries).toHaveLength(1);
    expect(deletedEntries[0].fileId).toBe('chapter-08');
    expect(deletedEntries[0].fileName).toBe('chapter-08.story');
  });

  it('treats all files as added when previous snapshot is empty', () => {
    const currentSnapshot = createContentSnapshot(WORKSPACE_TWO_FILES);
    const changes = getChangedFiles(currentSnapshot, {});

    const addedEntries = changes.filter(change => change.status === 'added');

    expect(addedEntries).toHaveLength(3);
  });

  it('returns empty array when both snapshots are identical', () => {
    const snapshot = createContentSnapshot(WORKSPACE_TWO_FILES);
    const changes = getChangedFiles(snapshot, snapshot);

    expect(changes).toHaveLength(0);
  });

  it('handles null snapshots gracefully', () => {
    expect(getChangedFiles(null, null)).toEqual([]);
    expect(getChangedFiles({}, null)).toEqual([]);
  });

  it('includes fileName and filePath in each result', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const modified = createContentSnapshot(WORKSPACE_TWO_FILES_MODIFIED);
    const changes = getChangedFiles(modified, baseline);

    for (const change of changes) {
      expect(change).toHaveProperty('fileName');
      expect(change).toHaveProperty('filePath');
      expect(typeof change.fileName).toBe('string');
      expect(typeof change.filePath).toBe('string');
    }
  });
});

// ── computeFileDiff ──────────────────────────────────────────────────────

describe('computeFileDiff', () => {
  it('produces a unified diff with --- and +++ headers', () => {
    const diff = computeFileDiff(
      '# Chapter 7\n\nShe walked to the chapel.',
      '# Chapter 7\n\nShe walked to Saint Alder Chapel.',
      'story-structure/chapter-07.story',
    );

    expect(diff).toContain('--- a/story-structure/chapter-07.story');
    expect(diff).toContain('+++ b/story-structure/chapter-07.story');
  });

  it('shows removed and added lines in the diff', () => {
    const diff = computeFileDiff(
      'She walked to the chapel.',
      'She walked to Saint Alder Chapel.',
      'test.story',
    );

    expect(diff).toContain('-She walked to the chapel.');
    expect(diff).toContain('+She walked to Saint Alder Chapel.');
  });

  it('handles added file with empty old content', () => {
    const diff = computeFileDiff('', '# New chapter\n\nContent here.', 'new.story');

    expect(diff).toContain('--- a/new.story');
    expect(diff).toContain('+++ b/new.story');
    expect(diff).toContain('+# New chapter');
  });

  it('handles deleted file with empty new content', () => {
    const diff = computeFileDiff('# Old content\n\nGoodbye.', '', 'deleted.story');

    expect(diff).toContain('-# Old content');
    expect(diff).toContain('-');
  });

  it('handles null inputs gracefully', () => {
    const diff = computeFileDiff(null, 'content', 'test.story');

    expect(diff).toContain('+content');
  });
});

// ── assembleCombinedDiff ─────────────────────────────────────────────────

describe('assembleCombinedDiff', () => {
  it('includes only selected files in the combined diff', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const modified = createContentSnapshot(WORKSPACE_TWO_FILES_MODIFIED);
    const changes = getChangedFiles(modified, baseline);
    const selectedIds = ['chapter-07'];

    const combined = assembleCombinedDiff(changes, selectedIds, modified, baseline);

    expect(combined).toContain('chapter-07.story');
    expect(combined).not.toContain('chapter-08.story');
  });

  it('excludes unselected files from the combined diff', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const modified = createContentSnapshot(WORKSPACE_TWO_FILES_MODIFIED);
    const changes = getChangedFiles(modified, baseline);
    const selectedIds = ['chapter-08'];

    const combined = assembleCombinedDiff(changes, selectedIds, modified, baseline);

    expect(combined).toContain('chapter-08.story');
    expect(combined).not.toContain('chapter-07.story');
  });

  it('combines diffs from multiple selected files', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const modified = createContentSnapshot(WORKSPACE_TWO_FILES_MODIFIED);
    const changes = getChangedFiles(modified, baseline);
    const selectedIds = ['chapter-07', 'chapter-08'];

    const combined = assembleCombinedDiff(changes, selectedIds, modified, baseline);

    expect(combined).toContain('chapter-07.story');
    expect(combined).toContain('chapter-08.story');
  });

  it('returns empty string when no files are selected', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const modified = createContentSnapshot(WORKSPACE_TWO_FILES_MODIFIED);
    const changes = getChangedFiles(modified, baseline);

    const combined = assembleCombinedDiff(changes, [], modified, baseline);

    expect(combined).toBe('');
  });

  it('returns empty string for null inputs', () => {
    expect(assembleCombinedDiff(null, null, {}, {})).toBe('');
  });

  it('includes proper diff content showing additions and removals', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const modified = createContentSnapshot(WORKSPACE_TWO_FILES_MODIFIED);
    const changes = getChangedFiles(modified, baseline);
    const selectedIds = ['chapter-07'];

    const combined = assembleCombinedDiff(changes, selectedIds, modified, baseline);

    expect(combined).toContain('-');
    expect(combined).toContain('+');
    expect(combined).toContain('Saint Alder Chapel');
  });
});

// ── updateSnapshotAfterSync ─────────────────────────────────────────────

describe('updateSnapshotAfterSync', () => {
  it('updates only selected files in the snapshot', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const modified = createContentSnapshot(WORKSPACE_TWO_FILES_MODIFIED);

    const result = updateSnapshotAfterSync(baseline, modified, ['chapter-07']);

    // chapter-07 should have the modified content
    expect(result['chapter-07'].markdown).toContain('Saint Alder Chapel');

    // chapter-08 should retain the original (unselected)
    expect(result['chapter-08'].markdown).not.toContain('bundle');
    expect(result['chapter-08'].markdown).toContain('Morning light');
  });

  it('retains unselected files at their previous snapshot values', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const modified = createContentSnapshot(WORKSPACE_TWO_FILES_MODIFIED);

    const result = updateSnapshotAfterSync(baseline, modified, ['chapter-08']);

    // chapter-07 should still have the old content
    expect(result['chapter-07'].markdown).toContain('walked to the chapel');
    expect(result['chapter-07'].markdown).not.toContain('Saint Alder');
  });

  it('removes entries for files that no longer exist in the workspace', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const withDeletedFile = createContentSnapshot(WORKSPACE_WITH_ADDED_AND_DELETED);

    const result = updateSnapshotAfterSync(baseline, withDeletedFile, ['chapter-07']);

    // chapter-08 was in the baseline but deleted from the workspace
    expect(result).not.toHaveProperty('chapter-08');

    // chapter-09 was added but not selected — should NOT appear
    expect(result).not.toHaveProperty('chapter-09');
  });

  it('adds selected new files to the snapshot', () => {
    const baseline = createContentSnapshot(WORKSPACE_TWO_FILES);
    const withNewFile = createContentSnapshot(WORKSPACE_WITH_ADDED_AND_DELETED);

    const result = updateSnapshotAfterSync(baseline, withNewFile, ['chapter-09']);

    expect(result).toHaveProperty('chapter-09');
    expect(result['chapter-09'].markdown).toContain('new chapter');
  });

  it('handles null inputs gracefully', () => {
    const current = createContentSnapshot(WORKSPACE_TWO_FILES);
    const allFileIds = Object.keys(current);

    // null previous + all files selected → result equals current snapshot
    expect(updateSnapshotAfterSync(null, current, allFileIds)).toEqual(current);
    // all nulls → empty object
    expect(updateSnapshotAfterSync(null, null, null)).toEqual({});
  });
});
