// Test fixtures for the diff engine.
// Provides deterministic workspace trees and snapshots for unit tests.

/**
 * A minimal workspace tree with two files for baseline testing.
 * Uses fixed IDs so tests can reference them reliably.
 */
export const WORKSPACE_TWO_FILES = {
  id: 'workspace-root',
  name: 'workspace',
  type: 'folder',
  children: [
    {
      id: 'story-structure',
      name: 'story-structure',
      type: 'folder',
      children: [
        {
          id: 'chapter-07',
          name: 'chapter-07.story',
          type: 'file',
          content:
            '<h1>Chapter 7</h1><p>The rain had stopped by the time she walked to the chapel.</p>',
        },
        {
          id: 'chapter-08',
          name: 'chapter-08.story',
          type: 'file',
          content:
            '<h2>Chapter 8</h2><p>Morning light filtered through stained glass.</p>',
        },
      ],
    },
    {
      id: 'notes-file',
      name: 'notes.story',
      type: 'file',
      content: '<p>Draft notes — not ready for sync.</p>',
    },
  ],
};

/**
 * A workspace tree identical to WORKSPACE_TWO_FILES but with
 * modified content in chapter-07 and chapter-08.
 */
export const WORKSPACE_TWO_FILES_MODIFIED = {
  id: 'workspace-root',
  name: 'workspace',
  type: 'folder',
  children: [
    {
      id: 'story-structure',
      name: 'story-structure',
      type: 'folder',
      children: [
        {
          id: 'chapter-07',
          name: 'chapter-07.story',
          type: 'file',
          content:
            '<h1>Chapter 7</h1><p>The rain had stopped by the time she walked to Saint Alder Chapel. The clock on the bell tower read 11:40 PM.</p>',
        },
        {
          id: 'chapter-08',
          name: 'chapter-08.story',
          type: 'file',
          content:
            '<h2>Chapter 8</h2><p>Morning light filtered through stained glass.</p><p>She noticed a bundle wrapped in stained cloth at the altar.</p>',
        },
      ],
    },
    {
      id: 'notes-file',
      name: 'notes.story',
      type: 'file',
      content: '<p>Draft notes — not ready for sync.</p>',
    },
  ],
};

/**
 * A workspace tree where chapter-08 has been deleted and a new file added.
 * Used to test added/deleted file detection.
 */
export const WORKSPACE_WITH_ADDED_AND_DELETED = {
  id: 'workspace-root',
  name: 'workspace',
  type: 'folder',
  children: [
    {
      id: 'story-structure',
      name: 'story-structure',
      type: 'folder',
      children: [
        {
          id: 'chapter-07',
          name: 'chapter-07.story',
          type: 'file',
          content:
            '<h1>Chapter 7</h1><p>The rain had stopped by the time she walked to the chapel.</p>',
        },
        {
          id: 'chapter-09',
          name: 'chapter-09.story',
          type: 'file',
          content:
            '<h1>Chapter 9</h1><p>A new chapter begins.</p>',
        },
      ],
    },
    {
      id: 'notes-file',
      name: 'notes.story',
      type: 'file',
      content: '<p>Draft notes — not ready for sync.</p>',
    },
  ],
};
