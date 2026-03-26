// World-model markdown utilities.
// Enables the frontend to parse, render, group, and inspect the
// pipe-delimited index format used by the agentic harness.

const ENTRIES_HEADING = '## Entries';
const ENTRY_LINE_PREFIX = '- ';
const FIELD_SEPARATOR = ' | ';
const TBD_MARKER = '- TBD';

// ── Parsing ──────────────────────────────────────────────────────────────

/**
 * Split an index markdown file (elements.md / events.md) into its
 * preamble text and an array of parsed entry objects.
 *
 * @param {string} markdown  Full text of the index file.
 * @param {string[]} fieldNames  Ordered column names, e.g. ['kind','display_name','uuid','aliases','identification_keys'].
 * @returns {{ indexPreamble: string, entries: object[] }}
 */
export function parseIndexMarkdown(markdown, fieldNames) {
  if (typeof markdown !== 'string' || !Array.isArray(fieldNames) || fieldNames.length === 0) {
    return { indexPreamble: '', entries: [] };
  }

  const headingIndex = markdown.indexOf(ENTRIES_HEADING);
  if (headingIndex === -1) {
    return { indexPreamble: markdown.trimEnd(), entries: [] };
  }

  const indexPreamble = markdown.slice(0, headingIndex).trimEnd();
  const entriesBlock = markdown.slice(headingIndex + ENTRIES_HEADING.length);
  const entries = parseEntryLines(entriesBlock, fieldNames);

  return { indexPreamble, entries };
}

function parseEntryLines(block, fieldNames) {
  return block
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith(ENTRY_LINE_PREFIX))
    .map(line => parseOneEntry(line.slice(ENTRY_LINE_PREFIX.length), fieldNames))
    .filter(Boolean);
}

function parseOneEntry(rawLine, fieldNames) {
  const parts = rawLine.split('|').map(segment => segment.trim());
  if (parts.length < fieldNames.length) {
    return null;
  }

  const entry = {};
  for (let i = 0; i < fieldNames.length; i++) {
    entry[fieldNames[i]] = parts[i];
  }
  return entry;
}

// ── Rendering ────────────────────────────────────────────────────────────

/**
 * Render a preamble and entries array back into an index markdown string.
 *
 * @param {string} indexPreamble  The preamble text (everything before ## Entries).
 * @param {object[]} entries  Array of entry objects with keys matching fieldNames.
 * @param {string[]} fieldNames  Ordered column names.
 * @returns {string}
 */
export function renderIndexMarkdown(indexPreamble, entries, fieldNames) {
  const preamble = typeof indexPreamble === 'string' ? indexPreamble : '';
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeFields = Array.isArray(fieldNames) ? fieldNames : [];

  const entryLines = safeEntries
    .map(entry => renderOneEntry(entry, safeFields))
    .filter(Boolean);

  const entriesSection = `${ENTRIES_HEADING}\n${entryLines.join('\n')}`;
  return `${preamble}\n\n${entriesSection}\n`;
}

function renderOneEntry(entry, fieldNames) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const values = fieldNames.map(field => (entry[field] ?? '').toString());
  return `${ENTRY_LINE_PREFIX}${values.join(FIELD_SEPARATOR)}`;
}

// ── Grouping ─────────────────────────────────────────────────────────────

/**
 * Group element entries by their `kind` field.
 * Each group is sorted alphabetically by `display_name`.
 *
 * @param {object[]} entries  Parsed element index entries.
 * @returns {Record<string, object[]>}
 */
export function groupElementsByKind(entries) {
  if (!Array.isArray(entries)) {
    return {};
  }

  const groups = {};

  for (const entry of entries) {
    const kind = (entry.kind ?? 'other').toLowerCase();
    if (!groups[kind]) {
      groups[kind] = [];
    }
    groups[kind].push(entry);
  }

  for (const kind of Object.keys(groups)) {
    groups[kind].sort((a, b) =>
      (a.display_name ?? '').localeCompare(b.display_name ?? ''),
    );
  }

  return groups;
}

/**
 * Group event entries by their `chapters` field.
 * Events referencing multiple chapters (comma-separated) appear in each group.
 * Within each chapter group, events are sorted by `when`.
 *
 * @param {object[]} entries  Parsed event index entries.
 * @returns {Record<string, object[]>}
 */
export function groupEventsByChapter(entries) {
  if (!Array.isArray(entries)) {
    return {};
  }

  const groups = {};

  for (const entry of entries) {
    const chaptersRaw = entry.chapters ?? '';
    const chapters = chaptersRaw
      .split(',')
      .map(chapter => chapter.trim())
      .filter(Boolean);

    if (chapters.length === 0) {
      addToGroup(groups, 'Unknown', entry);
      continue;
    }
    for (const chapter of chapters) {
      addToGroup(groups, chapter, entry);
    }
  }

  for (const chapter of Object.keys(groups)) {
    groups[chapter].sort((a, b) =>
      (a.when ?? '').localeCompare(b.when ?? ''),
    );
  }

  return groups;
}

function addToGroup(groups, key, entry) {
  if (!groups[key]) {
    groups[key] = [];
  }
  groups[key].push(entry);
}

// ── Detail inspection ────────────────────────────────────────────────────

/**
 * Extract the "Core Understanding" section text from a detail markdown file.
 * Returns the first non-empty paragraph after the `## Core Understanding` heading.
 * Returns `null` when the section is TBD or absent.
 *
 * @param {string} detailMarkdown  Raw markdown of a detail file.
 * @returns {string | null}
 */
export function extractDetailSummary(detailMarkdown) {
  if (typeof detailMarkdown !== 'string') {
    return null;
  }

  const sectionContent = extractSectionContent(detailMarkdown, '## Core Understanding');
  if (!sectionContent) {
    return null;
  }

  const trimmed = sectionContent.trim();
  if (trimmed === TBD_MARKER || trimmed === 'TBD') {
    return null;
  }

  return trimmed;
}

// The Identification section is always populated with metadata (UUID, Type, etc.)
// and should not count toward the "has real content" check.
const METADATA_SECTION_HEADING = '## Identification';

/**
 * Determine whether a detail file has real content beyond TBD placeholders.
 * Returns `false` when every content section body (excluding Identification)
 * consists only of `- TBD`.
 *
 * @param {string} detailMarkdown  Raw markdown of a detail file.
 * @returns {boolean}
 */
export function isDetailPopulated(detailMarkdown) {
  if (typeof detailMarkdown !== 'string' || detailMarkdown.trim() === '') {
    return false;
  }

  const sections = splitIntoSections(detailMarkdown);

  const contentSections = sections.filter(
    section => section.heading.trim() !== METADATA_SECTION_HEADING,
  );

  if (contentSections.length === 0) {
    return false;
  }

  return contentSections.some(section => {
    const body = section.body.trim();
    return body !== '' && body !== TBD_MARKER && body !== 'TBD';
  });
}

/**
 * Split markdown into sections by `## ` headings.
 * Returns an array of { heading, body } objects.
 */
export function splitIntoSections(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let currentHeading = null;
  let currentBody = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentHeading !== null) {
        sections.push({ heading: currentHeading, body: currentBody.join('\n') });
      }
      currentHeading = line;
      currentBody = [];
      continue;
    }
    if (currentHeading !== null) {
      currentBody.push(line);
    }
  }

  if (currentHeading !== null) {
    sections.push({ heading: currentHeading, body: currentBody.join('\n') });
  }

  return sections;
}

/**
 * Extract the body text of a specific `## ` section from markdown.
 * Returns `null` if the section is not found.
 */
function extractSectionContent(markdown, sectionHeading) {
  const sections = splitIntoSections(markdown);
  const target = sections.find(section => section.heading.trim() === sectionHeading);
  return target ? target.body : null;
}

// ── Factory ──────────────────────────────────────────────────────────────

/**
 * Create an empty / initial world model state.
 *
 * @param {string} elementsPreamble  Preamble text for elements.md.
 * @param {string} eventsPreamble  Preamble text for events.md.
 * @returns {object}
 */
export function createEmptyWorldModel(elementsPreamble, eventsPreamble) {
  return {
    elements: {
      indexPreamble: elementsPreamble ?? '',
      entries: [],
      details: {},
    },
    events: {
      indexPreamble: eventsPreamble ?? '',
      entries: [],
      details: {},
    },
  };
}
