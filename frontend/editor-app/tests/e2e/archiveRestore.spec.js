// @ts-check
import { test, expect } from '@playwright/test'
import { buildWorldModelFixture } from '../fixtures/worldModel.js'
import { clickModeTab } from './support/modeTabs.js'

const WORKSPACE_STORAGE_KEY = 'editor-app-workspace-v1'
const WORLD_MODEL_STORAGE_KEY = 'editor-app-world-model-v1'
const SYNC_STATE_STORAGE_KEY = 'editor-app-sync-state-v1'
const ARCHIVE_CAPTURE_STORAGE_KEY = 'editor-app-test-archive-base64'

function buildArchiveWorkspace() {
  return {
    id: 'workspace-root',
    name: 'workspace',
    type: 'folder',
    children: [
      {
        id: 'archive-folder',
        name: 'archive-scenes',
        type: 'folder',
        children: [
          {
            id: 'archive-file',
            name: 'archive-restore.story',
            type: 'file',
            content: '<h1>Restored Scene</h1><p>Mira returns to the chapel.</p>',
          },
        ],
      },
    ],
  }
}

function buildSyncedSyncState() {
  return {
    status: 'synced',
    lastSyncedAt: '2026-03-25T12:00:00.000Z',
    lastSyncedSnapshot: {
      'archive-file': {
        name: 'archive-restore.story',
        path: 'archive-scenes/archive-restore.story',
        markdown: '# Restored Scene\n\nMira returns to the chapel.',
      },
    },
  }
}

async function installArchivePickerStubs(page) {
  await page.addInitScript(({ captureStorageKey }) => {
    async function convertBlobToBase64(blob) {
      const archiveBuffer = await blob.arrayBuffer()
      const archiveBytes = new Uint8Array(archiveBuffer)
      let binaryString = ''

      for (const archiveByte of archiveBytes) {
        binaryString += String.fromCharCode(archiveByte)
      }

      return btoa(binaryString)
    }

    function convertBase64ToBlob(base64Text) {
      const binaryString = atob(base64Text)
      const archiveBytes = new Uint8Array(binaryString.length)

      for (let index = 0; index < binaryString.length; index += 1) {
        archiveBytes[index] = binaryString.charCodeAt(index)
      }

      return new Blob([archiveBytes], { type: 'application/zip' })
    }

    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      writable: true,
      value: async () => ({
        async createWritable() {
          const writtenParts = []

          return new WritableStream({
            write(chunk) {
              writtenParts.push(chunk)
            },
            async close() {
              const archiveBlob = new Blob(writtenParts, { type: 'application/zip' })
              const archiveBase64 = await convertBlobToBase64(archiveBlob)

              sessionStorage.setItem(captureStorageKey, archiveBase64)
            },
          })
        },
      }),
    })

    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      writable: true,
      value: async () => {
        const archiveBase64 = sessionStorage.getItem(captureStorageKey)

        if (archiveBase64 === null) {
          throw new DOMException('No archive captured for upload.', 'AbortError')
        }

        const archiveBlob = convertBase64ToBlob(archiveBase64)

        return [
          {
            async getFile() {
              return new File([archiveBlob], 'project.zip', { type: 'application/zip' })
            },
          },
        ]
      },
    })
  }, { captureStorageKey: ARCHIVE_CAPTURE_STORAGE_KEY })
}

async function seedArchiveState(page) {
  const workspace = buildArchiveWorkspace()
  const worldModel = buildWorldModelFixture()
  const syncState = buildSyncedSyncState()

  await page.goto('/')
  await page.evaluate(
    ([workspaceKey, workspaceValue, worldModelKey, worldModelValue, syncStateKey, syncStateValue]) => {
      localStorage.setItem(workspaceKey, JSON.stringify(workspaceValue))
      localStorage.setItem(worldModelKey, JSON.stringify(worldModelValue))
      localStorage.setItem(syncStateKey, JSON.stringify(syncStateValue))
    },
    [
      WORKSPACE_STORAGE_KEY,
      workspace,
      WORLD_MODEL_STORAGE_KEY,
      worldModel,
      SYNC_STATE_STORAGE_KEY,
      syncState,
    ],
  )
  await page.reload()
}

async function openProjectMenu(page) {
  await page.getByRole('button', { name: 'Project' }).click()
}

async function downloadProjectArchive(page, { expectWarning = false } = {}) {
  await openProjectMenu(page)
  await page.getByRole('menuitem', { name: 'Download' }).click()

  if (expectWarning) {
    const warningDialog = page.getByRole('dialog', { name: 'World Model Out of Sync' })

    await expect(warningDialog).toBeVisible()
    await expect(warningDialog).toContainText('1 file has changed since the last sync.')
    await warningDialog.getByRole('button', { name: 'Download Anyway' }).click()
  }

  await page.waitForFunction(
    (captureKey) => sessionStorage.getItem(captureKey) !== null,
    ARCHIVE_CAPTURE_STORAGE_KEY,
  )
}

async function uploadProjectArchive(page) {
  await openProjectMenu(page)
  await page.getByRole('menuitem', { name: 'Upload' }).click()
  await page.waitForFunction(
    ([workspaceKey, worldModelKey, syncStateKey]) =>
      localStorage.getItem(workspaceKey) !== null &&
      localStorage.getItem(worldModelKey) !== null &&
      localStorage.getItem(syncStateKey) !== null,
    [WORKSPACE_STORAGE_KEY, WORLD_MODEL_STORAGE_KEY, SYNC_STATE_STORAGE_KEY],
  )
}

async function switchToWorldMode(page) {
  await clickModeTab(page, 'World')
  await expect(page.getByTestId('world-sidebar')).toBeVisible()
}

async function expectRestoredFileSelection(page) {
  await expect(page.getByText('archive-restore.story', { exact: true })).toBeVisible()
  await expect(page.locator('.ProseMirror')).toContainText('Mira returns to the chapel at dawn.')
}

async function editRestoredStory(page) {
  await page.getByText('archive-restore.story', { exact: true }).click()
  const editor = page.locator('.ProseMirror').first()

  await editor.click()
  await editor.fill('Mira returns to the chapel at dawn.')
}

test('editing after sync shows the download warning and preserves unsynced state after restore', async ({ page }) => {
  await installArchivePickerStubs(page)
  await seedArchiveState(page)

  await expect(page.getByTestId('sync-status-badge')).toContainText('synced')

  await editRestoredStory(page)
  await expect(page.getByTestId('sync-status-badge')).toContainText('1 unsynced')

  await downloadProjectArchive(page, { expectWarning: true })

  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await uploadProjectArchive(page)
  await page.reload()

  await expect(page.getByRole('treeitem', { name: /archive-scenes/i })).toBeVisible()
  await expectRestoredFileSelection(page)
  await expect(page.getByTestId('sync-status-badge')).toContainText('1 unsynced')

  await switchToWorldMode(page)
  await expect(page.getByRole('button', { name: 'Mira', exact: true })).toBeVisible()
})
