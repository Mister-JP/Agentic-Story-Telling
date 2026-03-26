import { describe, it, expect } from 'vitest';
import {
  parseIndexMarkdown,
  renderIndexMarkdown,
  groupElementsByKind,
  groupEventsByChapter,
  extractDetailSummary,
  isDetailPopulated,
  createEmptyWorldModel,
} from '../../src/utils/worldModel.js';
import {
  ELEMENTS_INDEX_MD,
  EVENTS_INDEX_MD,
  ELEMENT_FIELD_NAMES,
  EVENT_FIELD_NAMES,
  POPULATED_ELEMENT_DETAIL_MD,
  TBD_ELEMENT_DETAIL_MD,
  POPULATED_EVENT_DETAIL_MD,
  TBD_EVENT_DETAIL_MD,
} from '../fixtures/worldModel.js';

// ── parseIndexMarkdown ───────────────────────────────────────────────────

describe('parseIndexMarkdown', () => {
  it('parses the elements index into 9 entries', () => {
    const result = parseIndexMarkdown(ELEMENTS_INDEX_MD, ELEMENT_FIELD_NAMES);

    expect(result.entries).toHaveLength(9);
    expect(result.indexPreamble).toContain('# Elements');
    expect(result.indexPreamble).not.toContain('## Entries');
  });

  it('maps element fields correctly for the first entry', () => {
    const { entries } = parseIndexMarkdown(ELEMENTS_INDEX_MD, ELEMENT_FIELD_NAMES);
    const mira = entries[0];

    expect(mira.kind).toBe('person');
    expect(mira.display_name).toBe('Mira');
    expect(mira.uuid).toBe('elt_45d617e4531b');
    expect(mira.aliases).toBe('Mira');
    expect(mira.identification_keys).toContain('carries the silver key');
  });

  it('parses the events index into 7 entries', () => {
    const result = parseIndexMarkdown(EVENTS_INDEX_MD, EVENT_FIELD_NAMES);

    expect(result.entries).toHaveLength(7);
    expect(result.indexPreamble).toContain('# Events');
  });

  it('maps event fields correctly for the first entry', () => {
    const { entries } = parseIndexMarkdown(EVENTS_INDEX_MD, EVENT_FIELD_NAMES);
    const firstEvent = entries[0];

    expect(firstEvent.uuid).toBe('evt_f72bc8fe0f29');
    expect(firstEvent.when).toBe('Late June, 1998, before sunrise');
    expect(firstEvent.chapters).toBe('Chapter 7');
    expect(firstEvent.summary).toContain('Mira receives a letter');
  });

  it('returns empty entries for markdown without ## Entries heading', () => {
    const result = parseIndexMarkdown('# Just a title\nSome content.', ELEMENT_FIELD_NAMES);

    expect(result.entries).toHaveLength(0);
    expect(result.indexPreamble).toBe('# Just a title\nSome content.');
  });

  it('returns empty structure for invalid inputs', () => {
    expect(parseIndexMarkdown(null, ELEMENT_FIELD_NAMES)).toEqual({ indexPreamble: '', entries: [] });
    expect(parseIndexMarkdown('foo', null)).toEqual({ indexPreamble: '', entries: [] });
    expect(parseIndexMarkdown('foo', [])).toEqual({ indexPreamble: '', entries: [] });
  });
});

// ── renderIndexMarkdown ──────────────────────────────────────────────────

describe('renderIndexMarkdown', () => {
  it('renders element entries back to pipe-delimited markdown', () => {
    const { indexPreamble, entries } = parseIndexMarkdown(ELEMENTS_INDEX_MD, ELEMENT_FIELD_NAMES);
    const rendered = renderIndexMarkdown(indexPreamble, entries, ELEMENT_FIELD_NAMES);

    expect(rendered).toContain('## Entries');
    expect(rendered).toContain('- person | Mira | elt_45d617e4531b');
    expect(rendered).toContain('- item | Cracked Watch | elt_e2bc7b804e58');
  });

  it('renders event entries back to pipe-delimited markdown', () => {
    const { indexPreamble, entries } = parseIndexMarkdown(EVENTS_INDEX_MD, EVENT_FIELD_NAMES);
    const rendered = renderIndexMarkdown(indexPreamble, entries, EVENT_FIELD_NAMES);

    expect(rendered).toContain('## Entries');
    expect(rendered).toContain('- evt_f72bc8fe0f29 | Late June, 1998, before sunrise');
  });

  it('handles empty entries gracefully', () => {
    const rendered = renderIndexMarkdown('# Title', [], ELEMENT_FIELD_NAMES);

    expect(rendered).toContain('# Title');
    expect(rendered).toContain('## Entries');
  });
});

// ── Round-trip ────────────────────────────────────────────────────────────

describe('round-trip parse → render → parse', () => {
  it('preserves all element entries through a round-trip', () => {
    const firstParse = parseIndexMarkdown(ELEMENTS_INDEX_MD, ELEMENT_FIELD_NAMES);
    const rendered = renderIndexMarkdown(firstParse.indexPreamble, firstParse.entries, ELEMENT_FIELD_NAMES);
    const secondParse = parseIndexMarkdown(rendered, ELEMENT_FIELD_NAMES);

    expect(secondParse.entries).toEqual(firstParse.entries);
  });

  it('preserves all event entries through a round-trip', () => {
    const firstParse = parseIndexMarkdown(EVENTS_INDEX_MD, EVENT_FIELD_NAMES);
    const rendered = renderIndexMarkdown(firstParse.indexPreamble, firstParse.entries, EVENT_FIELD_NAMES);
    const secondParse = parseIndexMarkdown(rendered, EVENT_FIELD_NAMES);

    expect(secondParse.entries).toEqual(firstParse.entries);
  });
});

// ── groupElementsByKind ──────────────────────────────────────────────────

describe('groupElementsByKind', () => {
  it('groups 9 entries into person, place, and item categories', () => {
    const { entries } = parseIndexMarkdown(ELEMENTS_INDEX_MD, ELEMENT_FIELD_NAMES);
    const groups = groupElementsByKind(entries);

    expect(Object.keys(groups)).toEqual(expect.arrayContaining(['person', 'place', 'item']));
    expect(groups.person).toHaveLength(4);
    expect(groups.place).toHaveLength(1);
    expect(groups.item).toHaveLength(4);
  });

  it('sorts entries alphabetically by display_name within each group', () => {
    const { entries } = parseIndexMarkdown(ELEMENTS_INDEX_MD, ELEMENT_FIELD_NAMES);
    const groups = groupElementsByKind(entries);
    const personNames = groups.person.map(entry => entry.display_name);

    expect(personNames).toEqual([...personNames].sort());
  });

  it('returns empty object for invalid input', () => {
    expect(groupElementsByKind(null)).toEqual({});
    expect(groupElementsByKind(undefined)).toEqual({});
  });
});

// ── groupEventsByChapter ─────────────────────────────────────────────────

describe('groupEventsByChapter', () => {
  it('groups 7 events into Chapter 7 and Chapter 8', () => {
    const { entries } = parseIndexMarkdown(EVENTS_INDEX_MD, EVENT_FIELD_NAMES);
    const groups = groupEventsByChapter(entries);

    expect(Object.keys(groups)).toEqual(expect.arrayContaining(['Chapter 7', 'Chapter 8']));
    expect(groups['Chapter 7']).toHaveLength(3);
    expect(groups['Chapter 8']).toHaveLength(4);
  });

  it('sorts events by "when" within each chapter', () => {
    const { entries } = parseIndexMarkdown(EVENTS_INDEX_MD, EVENT_FIELD_NAMES);
    const groups = groupEventsByChapter(entries);
    const chapter8Times = groups['Chapter 8'].map(entry => entry.when);

    expect(chapter8Times).toEqual([...chapter8Times].sort());
  });

  it('returns empty object for invalid input', () => {
    expect(groupEventsByChapter(null)).toEqual({});
  });
});

// ── extractDetailSummary ─────────────────────────────────────────────────

describe('extractDetailSummary', () => {
  it('returns Core Understanding text for a populated element', () => {
    const summary = extractDetailSummary(POPULATED_ELEMENT_DETAIL_MD);

    expect(summary).toContain('Mira is the primary investigator');
    expect(summary).not.toContain('## Core Understanding');
  });

  it('returns Core Understanding text for a populated event', () => {
    const summary = extractDetailSummary(POPULATED_EVENT_DETAIL_MD);

    expect(summary).toContain('Mira receives a letter from her mother at 11:40 p.m.');
  });

  it('returns null for a TBD element', () => {
    expect(extractDetailSummary(TBD_ELEMENT_DETAIL_MD)).toBeNull();
  });

  it('returns null for a TBD event', () => {
    expect(extractDetailSummary(TBD_EVENT_DETAIL_MD)).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(extractDetailSummary(null)).toBeNull();
    expect(extractDetailSummary('')).toBeNull();
  });
});

// ── isDetailPopulated ────────────────────────────────────────────────────

describe('isDetailPopulated', () => {
  it('returns true for Mira (populated element)', () => {
    expect(isDetailPopulated(POPULATED_ELEMENT_DETAIL_MD)).toBe(true);
  });

  it('returns true for populated event', () => {
    expect(isDetailPopulated(POPULATED_EVENT_DETAIL_MD)).toBe(true);
  });

  it('returns false for Saint Alder Chapel (all TBD element)', () => {
    expect(isDetailPopulated(TBD_ELEMENT_DETAIL_MD)).toBe(false);
  });

  it('returns false for TBD event', () => {
    expect(isDetailPopulated(TBD_EVENT_DETAIL_MD)).toBe(false);
  });

  it('returns false for empty or invalid input', () => {
    expect(isDetailPopulated(null)).toBe(false);
    expect(isDetailPopulated('')).toBe(false);
  });
});

// ── createEmptyWorldModel ────────────────────────────────────────────────

describe('createEmptyWorldModel', () => {
  it('creates a world model with empty entries and provided preambles', () => {
    const model = createEmptyWorldModel('# Elements preamble', '# Events preamble');

    expect(model.elements.indexPreamble).toBe('# Elements preamble');
    expect(model.elements.entries).toEqual([]);
    expect(model.elements.details).toEqual({});
    expect(model.events.indexPreamble).toBe('# Events preamble');
    expect(model.events.entries).toEqual([]);
    expect(model.events.details).toEqual({});
  });

  it('uses empty strings when preambles are omitted', () => {
    const model = createEmptyWorldModel();

    expect(model.elements.indexPreamble).toBe('');
    expect(model.events.indexPreamble).toBe('');
  });
});
