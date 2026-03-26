// @ts-check
import { test, expect } from '@playwright/test'

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Clear localStorage so every test starts from a clean slate.
 * The app persists state under 'editor-app-workspace-v1'.
 */
async function clearAppStorage(page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
}

function getWorkspaceItem(page, name) {
  return page.getByRole('treeitem', { name: new RegExp(`^${name}\\b`) })
}

async function createFile(page, name) {
  await page.getByRole('button', { name: 'Create file' }).click()

  const dialog = page.getByRole('dialog', { name: 'Create file' })
  await expect(dialog).toBeVisible()

  const nameInput = dialog.getByLabel('Name')
  await nameInput.clear()
  await nameInput.fill(name)
  await dialog.getByRole('button', { name: 'Create file' }).click()
}

// ── Test 1: App loads ─────────────────────────────────────────────────────
test('app loads and shows sidebar + editor', async ({ page }) => {
  await clearAppStorage(page)

  // Sidebar should contain the root workspace tree node
  await expect(
    page.locator('[data-testid="sidebar"], .sidebar-shell').first(),
  ).toBeVisible({ timeout: 10_000 })

  // The starter tree's "story-structure" folder should be visible
  await expect(getWorkspaceItem(page, 'story-structure')).toBeVisible()

  // The editor pane should be present
  await expect(page.locator('.main-shell').first()).toBeVisible()
})

// ── Test 2: Create + edit a file ──────────────────────────────────────────
test('can create a new file and type content into it', async ({ page }) => {
  await clearAppStorage(page)
  await createFile(page, 'chapter-01.story')

  // The new file should appear in the sidebar tree
  const newFile = getWorkspaceItem(page, 'chapter-01.story')
  await expect(newFile).toBeVisible({ timeout: 5_000 })

  // Click the file to select it and focus the editor
  await newFile.click()

  // Type in the Tiptap editor (it's a contenteditable div)
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  await editor.fill('Mira walked into Saint Alder Chapel.')

  // Content should be visible in the editor
  await expect(editor).toContainText('Mira walked into Saint Alder Chapel.')
})

// ── Test 3: Reload persists content ──────────────────────────────────────
test('content persists after page reload (localStorage autosave)', async ({ page }) => {
  await clearAppStorage(page)

  // Create file
  await createFile(page, 'persist-test.story')

  // Select and edit the file
  const persistedFile = getWorkspaceItem(page, 'persist-test.story')
  await persistedFile.click()
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  await editor.fill('This content must survive a reload.')

  // Wait a moment for autosave to flush to localStorage
  await page.waitForTimeout(800)

  // Reload the page
  await page.reload()

  // The file must still be present in the tree
  await expect(persistedFile).toBeVisible({ timeout: 5_000 })

  // Select it and confirm content
  await persistedFile.click()
  const reloadedEditor = page.locator('.ProseMirror').first()
  await expect(reloadedEditor).toContainText('This content must survive a reload.')
})
