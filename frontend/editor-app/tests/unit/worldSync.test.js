import { describe, expect, it } from 'vitest'

import { createContentSnapshot } from '../../src/utils/diffEngine.js'
import {
  buildEventsIndexProposePayload,
  canStartWorldSync,
  getEventsIndexMarkdown,
  getWorldSyncButtonState,
} from '../../src/utils/worldSync.js'
import { WORKSPACE_TWO_FILES, WORKSPACE_TWO_FILES_MODIFIED } from '../fixtures/diffEngine.js'
import { buildWorldModelFixture } from '../fixtures/worldModel.js'

describe('worldSync helpers', () => {
  it('allows a first sync when the workspace has content and sync state is never_synced', () => {
    const canStartSync = canStartWorldSync(WORKSPACE_TWO_FILES, {
      status: 'never_synced',
      lastSyncedAt: null,
      lastSyncedSnapshot: {},
    })

    expect(canStartSync).toBe(true)
  })

  it('builds an events propose payload for first sync', () => {
    const payload = buildEventsIndexProposePayload(
      WORKSPACE_TWO_FILES,
      {
        status: 'never_synced',
        lastSyncedAt: null,
        lastSyncedSnapshot: {},
      },
      null,
    )

    expect(payload.eventsMd).toBe('')
    expect(payload.diffText).toContain('+++ b/story-structure/chapter-07.story')
    expect(payload.diffText).toContain('+++ b/notes.story')
  })

  it('builds an events propose payload from an existing world model', () => {
    const worldModel = buildWorldModelFixture()
    const syncState = {
      status: 'synced',
      lastSyncedAt: '2026-03-25T12:00:00.000Z',
      lastSyncedSnapshot: createContentSnapshot(WORKSPACE_TWO_FILES),
    }
    const payload = buildEventsIndexProposePayload(WORKSPACE_TWO_FILES_MODIFIED, syncState, worldModel)

    expect(payload.eventsMd).toContain('# Events')
    expect(payload.eventsMd).toContain('evt_f72bc8fe0f29')
    expect(payload.diffText).toContain('Saint Alder Chapel')
  })

  it('renders existing events markdown when a world model is present', () => {
    const eventsMarkdown = getEventsIndexMarkdown(buildWorldModelFixture())

    expect(eventsMarkdown).toContain('# Events')
    expect(eventsMarkdown).toContain('evt_f72bc8fe0f29')
  })

  it('derives CTA state for idle and loading flows', () => {
    const idleState = getWorldSyncButtonState(WORKSPACE_TWO_FILES, {
      status: 'never_synced',
      lastSyncedAt: null,
      lastSyncedSnapshot: {},
    }, false)
    const loadingState = getWorldSyncButtonState(WORKSPACE_TWO_FILES, {
      status: 'never_synced',
      lastSyncedAt: null,
      lastSyncedSnapshot: {},
    }, true)

    expect(idleState).toEqual({
      disabled: false,
      label: 'Sync World Model',
    })
    expect(loadingState).toEqual({
      disabled: true,
      label: 'Starting Sync...',
    })
  })
})
