import { describe, expect, it } from 'vitest'

import { WORKSPACE_TWO_FILES } from '../fixtures/diffEngine.js'
import { buildWorldModelFixture } from '../fixtures/worldModel.js'
import {
  applyCompletedSyncReviewResult,
  applyStagedIndexReviewResult,
  beginIndexReviewSession,
  buildSyncReviewSummary,
  buildElementDetailTargets,
  buildEventDetailTargets,
  countCompletedDetailTargets,
  createDetailReviewSession,
  createElementsIndexReviewSession,
  createIndexReviewSession,
  createReviewHistoryEntry,
  getReviewAttemptNumber,
  updateDiffPreviewSelection,
} from '../../src/utils/syncReview.js'
import { getElementsIndexMarkdown, getEventsIndexMarkdown } from '../../src/utils/worldSync.js'

describe('syncReview helpers', () => {
  it('builds a diff preview review session from the current workspace diff', () => {
    const reviewSession = createIndexReviewSession(
      WORKSPACE_TWO_FILES,
      {
        status: 'never_synced',
        lastSyncedAt: null,
        lastSyncedSnapshot: {},
      },
      null,
    )

    expect(reviewSession.step).toBe('diff-preview')
    expect(reviewSession.attemptNumber).toBe(0)
    expect(reviewSession.isLoading).toBe(false)
    expect(reviewSession.changedFiles).toHaveLength(3)
    expect(reviewSession.elementsMd).toBe('')
    expect(reviewSession.selectedFileIds).toHaveLength(3)
    expect(reviewSession.selectedFileIds).toEqual(
      expect.arrayContaining(['chapter-07', 'chapter-08', 'notes-file']),
    )
    expect(reviewSession.changedFiles[0]).toHaveProperty('diffText')
    expect(reviewSession.diffText).toContain('+++ b/story-structure/chapter-07.story')
  })

  it('recomputes diffText when diff preview selection changes', () => {
    const reviewSession = createIndexReviewSession(
      WORKSPACE_TWO_FILES,
      {
        status: 'never_synced',
        lastSyncedAt: null,
        lastSyncedSnapshot: {},
      },
      null,
    )

    const nextSession = updateDiffPreviewSelection(reviewSession, ['chapter-07', 'notes-file'])

    expect(nextSession.selectedFileIds).toEqual(['chapter-07', 'notes-file'])
    expect(nextSession.diffText).toContain('story-structure/chapter-07.story')
    expect(nextSession.diffText).toContain('notes.story')
    expect(nextSession.diffText).not.toContain('story-structure/chapter-08.story')
  })

  it('moves from diff preview into the first events review request state', () => {
    const reviewSession = createIndexReviewSession(
      WORKSPACE_TWO_FILES,
      {
        status: 'never_synced',
        lastSyncedAt: null,
        lastSyncedSnapshot: {},
      },
      null,
    )

    const nextSession = beginIndexReviewSession(reviewSession)

    expect(nextSession.step).toBe('events-index')
    expect(nextSession.attemptNumber).toBe(1)
    expect(nextSession.isLoading).toBe(true)
    expect(nextSession.loadingAction).toBe('proposal')
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
      [
        {
          uuid: 'evt_stub123',
          summary: 'Stub event',
          file: 'events/evt_stub123.md',
          delta_action: 'create',
          update_context: 'Create the event dossier.',
        },
      ],
    )

    expect(reviewSession.step).toBe('elements-index')
    expect(reviewSession.attemptNumber).toBe(1)
    expect(reviewSession.updatedEventsState.actions).toEqual(['Created event evt_stub123.'])
    expect(reviewSession.history).toEqual(carriedHistory)
    expect(reviewSession.historyBaseCount).toBe(1)
    expect(reviewSession.eventDetailTargets).toEqual([
      {
        uuid: 'evt_stub123',
        summary: 'Stub event',
        file: 'events/evt_stub123.md',
        delta_action: 'create',
        update_context: 'Create the event dossier.',
      },
    ])
    expect(reviewSession.isLoading).toBe(true)
  })

  it('computes attempt numbers relative to the current review stage', () => {
    expect(getReviewAttemptNumber([], 0)).toBe(1)
    expect(getReviewAttemptNumber([{ attempt_number: 1 }], 0)).toBe(2)
    expect(getReviewAttemptNumber([{ attempt_number: 1 }], 1)).toBe(1)
    expect(getReviewAttemptNumber([{ attempt_number: 1 }, { attempt_number: 2 }], 1)).toBe(2)
  })

  it('fails fast when creating a detail review session without any targets', () => {
    const currentSession = createIndexReviewSession(
      WORKSPACE_TWO_FILES,
      {
        status: 'never_synced',
        lastSyncedAt: null,
        lastSyncedSnapshot: {},
      },
      null,
    )

    expect(() => createDetailReviewSession(currentSession, {
      detailTargets: [],
      step: 'element-details',
    })).toThrow('Cannot create element-details review session without detail targets.')
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

  it('builds event detail targets from the approved events proposal and apply response', () => {
    const detailTargets = buildEventDetailTargets(
      '# Events\n\n## Entries\n',
      {
        actions: ['Created event evt_stub123.'],
        detail_files: {
          evt_stub123: '# Stub event\n\n## Core Understanding\nStub detail\n',
        },
        events_md: '# Events\n\n## Entries\n- evt_stub123 | June 28, 1998 | Chapter 8 | Stub event\n',
      },
      {
        deltas: [
          {
            action: 'create',
            when: 'June 28, 1998',
            chapters: 'Chapter 8',
            summary: 'Stub event',
            reason: 'Create the event dossier.',
          },
        ],
      },
    )

    expect(detailTargets).toEqual([
      {
        uuid: 'evt_stub123',
        summary: 'Stub event',
        file: 'events/evt_stub123.md',
        delta_action: 'create',
        update_context: 'Create the event dossier.',
      },
    ])
  })

  it('builds element detail targets from the approved elements proposal and apply response', () => {
    const detailTargets = buildElementDetailTargets(
      '# Elements\n\n## Entries\n',
      {
        actions: ['Created element elt_stub123: Cloth Bundle (item).'],
        detail_files: {
          elt_stub123: '# Cloth Bundle\n\n## Core Understanding\nStub detail\n',
        },
        elements_md: '# Elements\n\n## Entries\n- item | Cloth Bundle | elt_stub123 | cloth bundle | altar evidence\n',
      },
      {
        identified_elements: [
          {
            display_name: 'Cloth Bundle',
            kind: 'item',
            aliases: ['cloth bundle'],
            identification_keys: ['altar evidence'],
            update_instruction: 'Create the detail dossier.',
            is_new: true,
            matched_existing_uuid: null,
          },
        ],
      },
    )

    expect(detailTargets).toEqual([
      {
        uuid: 'elt_stub123',
        summary: 'Cloth Bundle',
        file: 'elements/elt_stub123.md',
        delta_action: 'create',
        update_context: 'Create the detail dossier.',
        kind: 'item',
      },
    ])
  })

  it('applies approved detail results only after the full review session completes', () => {
    const appliedReview = applyCompletedSyncReviewResult({
      currentSyncState: {
        status: 'never_synced',
        lastSyncedAt: null,
        lastSyncedSnapshot: {},
      },
      currentWorldModel: null,
      reviewSession: {
        detailResults: {
          elt_stub123: {
            action: 'approved',
            updatedMd: '# Cloth Bundle\n\n## Core Understanding\nApproved detail\n',
          },
          evt_stub123: {
            action: 'skipped',
          },
        },
        selectedFileIds: ['chapter-07'],
        updatedEventsState: {
          actions: ['Created event evt_stub123.'],
          detail_files: {
            evt_stub123: '# Stub event\n\n## Core Understanding\nOriginal stub detail\n',
          },
          events_md: '# Events\n\n## Entries\n- evt_stub123 | June 28, 1998 | Chapter 8 | Stub event\n',
        },
        updatedElementsState: {
          actions: ['Created element elt_stub123: Cloth Bundle (item).'],
          detail_files: {
            elt_stub123: '# Cloth Bundle\n\n## Core Understanding\nOriginal stub detail\n',
          },
          elements_md: '# Elements\n\n## Entries\n- item | Cloth Bundle | elt_stub123 | cloth bundle | altar evidence\n',
        },
      },
      workspace: WORKSPACE_TWO_FILES,
    })

    expect(appliedReview.worldModel.elements.details.elt_stub123).toContain('Approved detail')
    expect(appliedReview.worldModel.events.details.evt_stub123).toContain('Original stub detail')
    expect(appliedReview.syncState.status).toBe('synced')
  })

  it('counts only approved detail targets in the sidebar progress', () => {
    expect(countCompletedDetailTargets({
      detailResults: {
        elt_stub123: { action: 'approved', updatedMd: '# Approved detail' },
        elt_skipped456: { action: 'skipped' },
      },
      elementDetailTargets: [
        { uuid: 'elt_stub123' },
        { uuid: 'elt_skipped456' },
      ],
    }, 'element-details')).toBe(1)
  })

  it('builds sync summary counts from index actions and detailResults', () => {
    expect(buildSyncReviewSummary({
      detailResults: {
        elt_stub123: { action: 'approved', updatedMd: '# Approved detail' },
        detail_custom_elt: { action: 'skipped', targetType: 'element' },
        evt_stub123: { action: 'skipped' },
        detail_custom_evt: { action: 'approved', targetType: 'event', updatedMd: '# Approved event detail' },
      },
      elementDetailTargets: [
        { uuid: 'elt_stub123' },
        { uuid: 'detail_custom_elt' },
      ],
      eventDetailTargets: [
        { uuid: 'evt_stub123' },
        { uuid: 'detail_custom_evt' },
      ],
      updatedEventsState: {
        actions: [
          'Created event evt_stub123: Chapel arrival.',
          'Updated event evt_existing456: Procession begins.',
          'Deleted event evt_old789.',
        ],
      },
      updatedElementsState: {
        actions: [
          'Created element elt_stub123: Cloth Bundle (item).',
          'Updated element elt_existing456: Mira — merged aliases.',
        ],
      },
    })).toEqual({
      elementDetails: {
        approvedCount: 1,
        skippedCount: 1,
        totalCount: 2,
      },
      elements: {
        createdCount: 1,
        deletedCount: 0,
        updatedCount: 1,
      },
      eventDetails: {
        approvedCount: 1,
        skippedCount: 1,
        totalCount: 2,
      },
      events: {
        createdCount: 1,
        deletedCount: 1,
        updatedCount: 1,
      },
    })
  })

  it('routes approved detail markdown by explicit target type instead of UUID prefixes', () => {
    const appliedReview = applyCompletedSyncReviewResult({
      currentSyncState: {
        status: 'never_synced',
        lastSyncedAt: null,
        lastSyncedSnapshot: {},
      },
      currentWorldModel: null,
      reviewSession: {
        detailResults: {
          detail_custom_1: {
            action: 'approved',
            targetType: 'element',
            updatedMd: '# Custom element detail\n',
          },
          detail_custom_2: {
            action: 'approved',
            targetType: 'event',
            updatedMd: '# Custom event detail\n',
          },
        },
        elementDetailTargets: [{ uuid: 'detail_custom_1' }],
        eventDetailTargets: [{ uuid: 'detail_custom_2' }],
        selectedFileIds: ['chapter-07'],
        updatedEventsState: {
          actions: [],
          detail_files: {
            detail_custom_2: '# Original event detail\n',
          },
          events_md: '# Events\n\n## Entries\n- detail_custom_2 | June 28, 1998 | Chapter 8 | Stub event\n',
        },
        updatedElementsState: {
          actions: [],
          detail_files: {
            detail_custom_1: '# Original element detail\n',
          },
          elements_md: '# Elements\n\n## Entries\n- item | Cloth Bundle | detail_custom_1 | cloth bundle | altar evidence\n',
        },
      },
      workspace: WORKSPACE_TWO_FILES,
    })

    expect(appliedReview.worldModel.elements.details.detail_custom_1).toContain('Custom element detail')
    expect(appliedReview.worldModel.events.details.detail_custom_2).toContain('Custom event detail')
  })
})
