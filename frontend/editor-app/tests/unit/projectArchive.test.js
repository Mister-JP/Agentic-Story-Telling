import { beforeEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'

vi.mock('browser-fs-access', () => ({
  fileOpen: vi.fn(),
  fileSave: vi.fn(),
}))

import { fileOpen, fileSave } from 'browser-fs-access'
import { createContentSnapshot } from '../../src/utils/diffEngine.js'
import {
  checkSyncBeforeDownload,
  exportProjectZip,
  importProjectZip,
  isProjectArchiveAbortError,
} from '../../src/utils/projectArchive.js'
import {
  WORKSPACE_TWO_FILES,
  WORKSPACE_TWO_FILES_MODIFIED,
} from '../fixtures/diffEngine.js'
import { buildWorldModelFixture } from '../fixtures/worldModel.js'

const VALID_WORLD_MODEL = buildWorldModelFixture()
const VALID_SYNC_STATE = {
  status: 'synced',
  lastSyncedAt: '2026-03-25T12:00:00.000Z',
  lastSyncedSnapshot: createContentSnapshot(WORKSPACE_TWO_FILES),
}
const NEVER_SYNCED_STATE = {
  status: 'never_synced',
  lastSyncedAt: null,
  lastSyncedSnapshot: {},
}

beforeEach(() => {
  vi.clearAllMocks()
})

async function createArchiveFile(payload, fileEntries = {}) {
  const zip = new JSZip()

  zip.file('workspace.json', JSON.stringify(payload, null, 2))

  for (const [filePath, fileContent] of Object.entries(fileEntries)) {
    zip.file(filePath, fileContent)
  }

  const blob = await zip.generateAsync({ type: 'blob' })

  return new File([blob], 'project.zip', { type: 'application/zip' })
}

async function readSavedArchive() {
  const [archiveBlob] = fileSave.mock.calls.at(-1)
  return JSZip.loadAsync(archiveBlob)
}

async function readWorkspacePayload(zip) {
  const workspaceEntry = zip.file('workspace.json')
  const workspaceText = await workspaceEntry.async('string')

  return JSON.parse(workspaceText)
}

// ── isProjectArchiveAbortError ────────────────────────────────────────────

describe('isProjectArchiveAbortError', () => {
  it('recognises error with name AbortError', () => {
    expect(isProjectArchiveAbortError({ name: 'AbortError' })).toBe(true)
  })

  it('recognises user-aborted message', () => {
    expect(isProjectArchiveAbortError({ message: 'The user aborted a request.' })).toBe(true)
  })

  it('recognises operation-aborted message', () => {
    expect(isProjectArchiveAbortError({ message: 'The operation was aborted.' })).toBe(true)
  })

  it('recognises code 20 (DOMException ABORT_ERR)', () => {
    expect(isProjectArchiveAbortError({ code: 20 })).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isProjectArchiveAbortError(new Error('Network error'))).toBe(false)
  })

  it('returns false for null', () => {
    expect(isProjectArchiveAbortError(null)).toBe(false)
  })
})

// ── exportProjectZip ──────────────────────────────────────────────────────

describe('exportProjectZip', () => {
  it('writes a v2 workspace payload with world model and sync state', async () => {
    fileSave.mockResolvedValue(undefined)

    await exportProjectZip({
      workspace: WORKSPACE_TWO_FILES,
      selectedNodeId: 'chapter-07',
      worldModel: VALID_WORLD_MODEL,
      syncState: VALID_SYNC_STATE,
    })

    expect(fileSave).toHaveBeenCalledOnce()

    const zip = await readSavedArchive()
    const payload = await readWorkspacePayload(zip)

    expect(payload.version).toBe(2)
    expect(payload.workspace).toEqual(WORKSPACE_TWO_FILES)
    expect(payload.selectedNodeId).toBe('chapter-07')
    expect(payload.worldModel).toEqual(VALID_WORLD_MODEL)
    expect(payload.syncState).toEqual(VALID_SYNC_STATE)
  })

  it('writes the portable world-model markdown files', async () => {
    fileSave.mockResolvedValue(undefined)

    await exportProjectZip({
      workspace: WORKSPACE_TWO_FILES,
      selectedNodeId: 'chapter-07',
      worldModel: VALID_WORLD_MODEL,
      syncState: VALID_SYNC_STATE,
    })

    const zip = await readSavedArchive()
    const elementsIndex = await zip.file('world-model/elements.md').async('string')
    const eventsIndex = await zip.file('world-model/events.md').async('string')
    const miraDetail = await zip.file('world-model/elements/elt_45d617e4531b.md').async('string')
    const eventDetail = await zip.file('world-model/events/evt_f72bc8fe0f29.md').async('string')

    expect(elementsIndex).toContain('# Elements')
    expect(elementsIndex).toContain('- person | Mira | elt_45d617e4531b')
    expect(eventsIndex).toContain('# Events')
    expect(eventsIndex).toContain('- evt_f72bc8fe0f29 | Late June, 1998, before sunrise')
    expect(miraDetail).toContain('# Mira')
    expect(eventDetail).toContain('# Mira receives a letter from her mother')
  })

  it('omits the portable world-model directory when worldModel is null', async () => {
    fileSave.mockResolvedValue(undefined)

    await exportProjectZip({
      workspace: WORKSPACE_TWO_FILES,
      selectedNodeId: 'chapter-07',
      worldModel: null,
      syncState: VALID_SYNC_STATE,
    })

    const zip = await readSavedArchive()
    const payload = await readWorkspacePayload(zip)

    expect(payload.worldModel).toBeNull()
    expect(zip.file('world-model/elements.md')).toBeNull()
    expect(zip.file('world-model/events.md')).toBeNull()
  })
})

// ── importProjectZip ──────────────────────────────────────────────────────

describe('importProjectZip', () => {
  it('restores a v1 archive with default worldModel and syncState', async () => {
    fileOpen.mockResolvedValue(
      await createArchiveFile({
        app: 'editor-app',
        version: 1,
        workspace: WORKSPACE_TWO_FILES,
        selectedNodeId: 'chapter-07',
      }),
    )

    const importedProject = await importProjectZip()

    expect(importedProject.workspace).toEqual(WORKSPACE_TWO_FILES)
    expect(importedProject.selectedNodeId).toBe('chapter-07')
    expect(importedProject.worldModel).toBeNull()
    expect(importedProject.syncState).toEqual(NEVER_SYNCED_STATE)
  })

  it('restores a v2 archive with full state', async () => {
    fileOpen.mockResolvedValue(
      await createArchiveFile({
        app: 'editor-app',
        version: 2,
        workspace: WORKSPACE_TWO_FILES,
        selectedNodeId: 'chapter-07',
        worldModel: VALID_WORLD_MODEL,
        syncState: VALID_SYNC_STATE,
      }),
    )

    const importedProject = await importProjectZip()

    expect(importedProject.workspace).toEqual(WORKSPACE_TWO_FILES)
    expect(importedProject.selectedNodeId).toBe('chapter-07')
    expect(importedProject.worldModel).toEqual(VALID_WORLD_MODEL)
    expect(importedProject.syncState).toEqual(VALID_SYNC_STATE)
  })

  it('rejects a malformed v2 world model', async () => {
    fileOpen.mockResolvedValue(
      await createArchiveFile({
        app: 'editor-app',
        version: 2,
        workspace: WORKSPACE_TWO_FILES,
        selectedNodeId: 'chapter-07',
        worldModel: {
          elements: VALID_WORLD_MODEL.elements,
          events: { indexPreamble: '# Events', entries: 'bad', details: {} },
        },
        syncState: VALID_SYNC_STATE,
      }),
    )

    await expect(importProjectZip()).rejects.toThrow('Invalid archive: world model data is malformed.')
  })

  it('rejects a malformed v2 sync state', async () => {
    fileOpen.mockResolvedValue(
      await createArchiveFile({
        app: 'editor-app',
        version: 2,
        workspace: WORKSPACE_TWO_FILES,
        selectedNodeId: 'chapter-07',
        worldModel: VALID_WORLD_MODEL,
        syncState: {
          status: 'synced',
          lastSyncedAt: null,
          lastSyncedSnapshot: 'bad snapshot',
        },
      }),
    )

    await expect(importProjectZip()).rejects.toThrow('Invalid archive: sync state is malformed.')
  })

  it('rejects an unsupported archive version', async () => {
    fileOpen.mockResolvedValue(
      await createArchiveFile({
        app: 'editor-app',
        version: 99,
        workspace: WORKSPACE_TWO_FILES,
        selectedNodeId: 'chapter-07',
      }),
    )

    await expect(importProjectZip()).rejects.toThrow('Unsupported archive version: 99')
  })
})

// ── checkSyncBeforeDownload ───────────────────────────────────────────────

describe('checkSyncBeforeDownload', () => {
  it('does not warn when syncState is null', () => {
    expect(checkSyncBeforeDownload(null, WORKSPACE_TWO_FILES)).toEqual({
      needsWarning: false,
      changedFileCount: 0,
    })
  })

  it('does not warn when syncState is never_synced', () => {
    expect(checkSyncBeforeDownload(NEVER_SYNCED_STATE, WORKSPACE_TWO_FILES)).toEqual({
      needsWarning: false,
      changedFileCount: 0,
    })
  })

  it('does not warn when workspace matches the last synced snapshot', () => {
    expect(checkSyncBeforeDownload(VALID_SYNC_STATE, WORKSPACE_TWO_FILES)).toEqual({
      needsWarning: false,
      changedFileCount: 0,
    })
  })

  it('warns with the changed file count when workspace content has diverged', () => {
    expect(checkSyncBeforeDownload(VALID_SYNC_STATE, WORKSPACE_TWO_FILES_MODIFIED)).toEqual({
      needsWarning: true,
      changedFileCount: 2,
    })
  })
})
