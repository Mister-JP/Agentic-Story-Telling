import { describe, expect, it } from 'vitest'

import { WORKSPACE_TWO_FILES } from '../fixtures/diffEngine.js'
import { buildWorldModelFixture } from '../fixtures/worldModel.js'
import {
  applyEventsIndexReviewResult,
  createEventsIndexReviewSession,
  createReviewHistoryEntry,
} from '../../src/utils/syncReview.js'
import { getEventsIndexMarkdown } from '../../src/utils/worldSync.js'

describe('syncReview helpers', () => {
  it('builds an events review session from the current workspace diff', () => {
    const reviewSession = createEventsIndexReviewSession(
      WORKSPACE_TWO_FILES,
      {
        status: 'never_synced',
        lastSyncedAt: null,
        lastSyncedSnapshot: {},
      },
      null,
    )

    expect(reviewSession.step).toBe('events-index')
    expect(reviewSession.changedFiles).toHaveLength(3)
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

  it('applies events review output into a new world model and sync snapshot', () => {
    const appliedReview = applyEventsIndexReviewResult({
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
      selectedFileIds: ['chapter-07'],
      workspace: WORKSPACE_TWO_FILES,
    })

    expect(appliedReview.worldModel.elements.entries).toEqual([])
    expect(appliedReview.worldModel.events.entries).toEqual([
      {
        uuid: 'evt_stub123',
        when: 'June 28, 1998',
        chapters: 'Chapter 8',
        summary: 'Stub event',
      },
    ])
    expect(appliedReview.worldModel.events.details.evt_stub123).toContain('Stub detail')
    expect(appliedReview.syncState.status).toBe('synced')
    expect(appliedReview.syncState.lastSyncedSnapshot).toEqual({
      'chapter-07': {
        name: 'chapter-07.story',
        path: 'story-structure/chapter-07.story',
        markdown: '# Chapter 7\n\nThe rain had stopped by the time she walked to the chapel.',
      },
    })
  })

  it('preserves elements while replacing the events layer from apply output', () => {
    const currentWorldModel = buildWorldModelFixture()

    const appliedReview = applyEventsIndexReviewResult({
      currentSyncState: {
        status: 'synced',
        lastSyncedAt: '2026-03-25T12:00:00.000Z',
        lastSyncedSnapshot: {},
      },
      currentWorldModel,
      eventsApplyResponse: {
        actions: ['Updated event evt_f72bc8fe0f29.'],
        detail_files: {},
        events_md: '# Events\n\n## Entries\n- evt_f72bc8fe0f29 | Late June, 1998, before sunrise | Chapter 7 | Revised event summary\n',
      },
      selectedFileIds: ['chapter-07'],
      workspace: WORKSPACE_TWO_FILES,
    })

    expect(appliedReview.worldModel.elements.entries).toHaveLength(currentWorldModel.elements.entries.length)
    expect(appliedReview.worldModel.events.entries).toEqual([
      {
        uuid: 'evt_f72bc8fe0f29',
        when: 'Late June, 1998, before sunrise',
        chapters: 'Chapter 7',
        summary: 'Revised event summary',
      },
    ])
  })

  it('keeps the events heading when apply output returns an empty index', () => {
    const appliedReview = applyEventsIndexReviewResult({
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
      selectedFileIds: ['chapter-07'],
      workspace: WORKSPACE_TWO_FILES,
    })

    expect(appliedReview.worldModel.events.indexPreamble).toBe('# Events')
    expect(getEventsIndexMarkdown(appliedReview.worldModel)).toContain('# Events')
  })
})
