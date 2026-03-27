import { describe, expect, it } from 'vitest'

import { WORKSPACE_TWO_FILES } from '../fixtures/diffEngine.js'
import { buildWorldModelFixture } from '../fixtures/worldModel.js'
import {
  applyStagedIndexReviewResult,
  createElementsIndexReviewSession,
  createIndexReviewSession,
  createReviewHistoryEntry,
  getReviewAttemptNumber,
} from '../../src/utils/syncReview.js'
import { getElementsIndexMarkdown, getEventsIndexMarkdown } from '../../src/utils/worldSync.js'

describe('syncReview helpers', () => {
  it('builds an events review session from the current workspace diff', () => {
    const reviewSession = createIndexReviewSession(
      WORKSPACE_TWO_FILES,
      {
        status: 'never_synced',
        lastSyncedAt: null,
        lastSyncedSnapshot: {},
      },
      null,
    )

    expect(reviewSession.step).toBe('events-index')
    expect(reviewSession.attemptNumber).toBe(1)
    expect(reviewSession.changedFiles).toHaveLength(3)
    expect(reviewSession.elementsMd).toBe('')
    expect(reviewSession.selectedFileIds).toHaveLength(3)
    expect(reviewSession.selectedFileIds).toEqual(
      expect.arrayContaining(['chapter-07', 'chapter-08', 'notes-file']),
    )
    expect(reviewSession.diffText).toContain('+++ b/story-structure/chapter-07.story')
  })

  it('serializes the rejected proposal into a history entry', () => {
    const historyEntry = createReviewHistoryEntry(
      {
        scan_summary: 'First attempt',
        deltas: [{ action: 'create', summary: 'Stub event' }],
      },
      '  tighten the chronology language  ',
      1,
    )

    expect(historyEntry).toEqual({
      attempt_number: 1,
      previous_output: JSON.stringify({
        scan_summary: 'First attempt',
        deltas: [{ action: 'create', summary: 'Stub event' }],
      }, null, 2),
      reviewer_feedback: 'tighten the chronology language',
    })
  })

  it('creates the stage-2 review session after events apply output is staged', () => {
    const currentSession = createIndexReviewSession(
      WORKSPACE_TWO_FILES,
      {
        status: 'never_synced',
        lastSyncedAt: null,
        lastSyncedSnapshot: {},
      },
      null,
    )
    const carriedHistory = [
      createReviewHistoryEntry(
        {
          scan_summary: 'First attempt',
          deltas: [{ action: 'create', summary: 'Stub event' }],
        },
        'Tighten the chronology language.',
        1,
      ),
    ]

    const reviewSession = createElementsIndexReviewSession(
      {
        ...currentSession,
        history: carriedHistory,
      },
      {
        actions: ['Created event evt_stub123.'],
        detail_files: {
          evt_stub123: '# Stub event\n\n## Core Understanding\nStub detail\n',
        },
        events_md: '# Events\n\n## Entries\n- evt_stub123 | June 28, 1998 | Chapter 8 | Stub event\n',
      },
    )

    expect(reviewSession.step).toBe('elements-index')
    expect(reviewSession.attemptNumber).toBe(1)
    expect(reviewSession.updatedEventsState.actions).toEqual(['Created event evt_stub123.'])
    expect(reviewSession.history).toEqual(carriedHistory)
    expect(reviewSession.historyBaseCount).toBe(1)
    expect(reviewSession.isLoading).toBe(true)
  })

  it('computes attempt numbers relative to the current review stage', () => {
    expect(getReviewAttemptNumber([], 0)).toBe(1)
    expect(getReviewAttemptNumber([{ attempt_number: 1 }], 0)).toBe(2)
    expect(getReviewAttemptNumber([{ attempt_number: 1 }], 1)).toBe(1)
    expect(getReviewAttemptNumber([{ attempt_number: 1 }, { attempt_number: 2 }], 1)).toBe(2)
  })

  it('applies staged events and elements output into a new world model and sync snapshot', () => {
    const appliedReview = applyStagedIndexReviewResult({
      currentSyncState: {
        status: 'never_synced',
        lastSyncedAt: null,
        lastSyncedSnapshot: {},
      },
      currentWorldModel: null,
      eventsApplyResponse: {
        actions: ['Created event evt_stub123.'],
        detail_files: {
          evt_stub123: '# Stub event\n\n## Core Understanding\nStub detail\n',
        },
        events_md: '# Events\n\n## Entries\n- evt_stub123 | June 28, 1998 | Chapter 8 | Stub event\n',
      },
      elementsApplyResponse: {
        actions: ['Created element elt_stub123: Cloth Bundle (item).'],
        detail_files: {
          elt_stub123: '# Cloth Bundle\n\n## Core Understanding\nStub detail\n',
        },
        elements_md: '# Elements\n\n## Entries\n- item | Cloth Bundle | elt_stub123 | cloth bundle | altar evidence\n',
      },
      selectedFileIds: ['chapter-07'],
      workspace: WORKSPACE_TWO_FILES,
    })

    expect(appliedReview.worldModel.elements.entries).toEqual([
      {
        kind: 'item',
        display_name: 'Cloth Bundle',
        uuid: 'elt_stub123',
        aliases: 'cloth bundle',
        identification_keys: 'altar evidence',
      },
    ])
    expect(appliedReview.worldModel.events.entries).toEqual([
      {
        uuid: 'evt_stub123',
        when: 'June 28, 1998',
        chapters: 'Chapter 8',
        summary: 'Stub event',
      },
    ])
    expect(appliedReview.worldModel.events.details.evt_stub123).toContain('Stub detail')
    expect(appliedReview.worldModel.elements.details.elt_stub123).toContain('Stub detail')
    expect(appliedReview.syncState.status).toBe('synced')
    expect(appliedReview.syncState.lastSyncedSnapshot).toEqual({
      'chapter-07': {
        name: 'chapter-07.story',
        path: 'story-structure/chapter-07.story',
        markdown: '# Chapter 7\n\nThe rain had stopped by the time she walked to the chapel.',
      },
    })
  })

  it('preserves events while replacing the elements layer from staged apply output', () => {
    const currentWorldModel = buildWorldModelFixture()

    const appliedReview = applyStagedIndexReviewResult({
      currentSyncState: {
        status: 'synced',
        lastSyncedAt: '2026-03-25T12:00:00.000Z',
        lastSyncedSnapshot: {},
      },
      currentWorldModel,
      eventsApplyResponse: {
        actions: [],
        detail_files: {},
        events_md: getEventsIndexMarkdown(currentWorldModel),
      },
      elementsApplyResponse: {
        actions: ['Updated element elt_45d617e4531b: Mira — merged aliases.'],
        detail_files: {},
        elements_md: '# Elements\n\n## Entries\n- person | Mira | elt_45d617e4531b | Mira, Mira Vale | carries the silver key\n',
      },
      selectedFileIds: ['chapter-07'],
      workspace: WORKSPACE_TWO_FILES,
    })

    expect(appliedReview.worldModel.events.entries).toHaveLength(currentWorldModel.events.entries.length)
    expect(appliedReview.worldModel.elements.entries).toEqual([
      {
        kind: 'person',
        display_name: 'Mira',
        uuid: 'elt_45d617e4531b',
        aliases: 'Mira, Mira Vale',
        identification_keys: 'carries the silver key',
      },
    ])
  })

  it('keeps the elements heading when staged apply output returns an empty index', () => {
    const appliedReview = applyStagedIndexReviewResult({
      currentSyncState: {
        status: 'never_synced',
        lastSyncedAt: null,
        lastSyncedSnapshot: {},
      },
      currentWorldModel: null,
      eventsApplyResponse: {
        actions: [],
        detail_files: {},
        events_md: '',
      },
      elementsApplyResponse: {
        actions: [],
        detail_files: {},
        elements_md: '',
      },
      selectedFileIds: ['chapter-07'],
      workspace: WORKSPACE_TWO_FILES,
    })

    expect(appliedReview.worldModel.elements.indexPreamble).toBe('# Elements')
    expect(getElementsIndexMarkdown(appliedReview.worldModel)).toContain('# Elements')
  })
})
