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

// ── Test 1: App loads ─────────────────────────────────────────────────────
test('app loads and shows sidebar + editor', async ({ page }) => {
  await clearAppStorage(page)

  // Sidebar should contain the root workspace tree node
  await expect(
    page.locator('[data-testid="sidebar"], .sidebar-shell').first(),
  ).toBeVisible({ timeout: 10_000 })

  // The starter tree's "story-structure" folder should be visible
  await expect(page.getByText('story-structure')).toBeVisible()

  // The editor pane should be present
  await expect(page.locator('.main-shell').first()).toBeVisible()
})

// ── Test 2: Create + edit a file ──────────────────────────────────────────
test('can create a new file and type content into it', async ({ page }) => {
  await clearAppStorage(page)

  // Open the "New File" dialog.
  // The "New" button/menu is in the sidebar — find it by its accessible text.
  const newButton = page.getByRole('button', { name: /new/i }).first()
  await newButton.click()

  // The menu shows a "New file" item
  const newFileItem = page.getByRole('menuitem', { name: /new file/i })
    .or(page.getByText(/new file/i).first())
  await newFileItem.click()

  // A dialog appears with an input pre-filled with 'untitled.story'
  const nameInput = page.getByRole('textbox').first()
  await nameInput.clear()
  await nameInput.fill('chapter-01.story')

  // Confirm
  await page.keyboard.press('Enter')

  // The new file should appear in the sidebar tree
  await expect(page.getByText('chapter-01.story')).toBeVisible({ timeout: 5_000 })

  // Click the file to select it and focus the editor
  await page.getByText('chapter-01.story').click()

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
  const newButton = page.getByRole('button', { name: /new/i }).first()
  await newButton.click()
  const newFileItem = page.getByRole('menuitem', { name: /new file/i })
    .or(page.getByText(/new file/i).first())
  await newFileItem.click()

  const nameInput = page.getByRole('textbox').first()
  await nameInput.clear()
  await nameInput.fill('persist-test.story')
  await page.keyboard.press('Enter')

  // Select and edit the file
  await page.getByText('persist-test.story').click()
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  await editor.fill('This content must survive a reload.')

  // Wait a moment for autosave to flush to localStorage
  await page.waitForTimeout(800)

  // Reload the page
  await page.reload()

  // The file must still be present in the tree
  await expect(page.getByText('persist-test.story')).toBeVisible({ timeout: 5_000 })

  // Select it and confirm content
  await page.getByText('persist-test.story').click()
  const reloadedEditor = page.locator('.ProseMirror').first()
  await expect(reloadedEditor).toContainText('This content must survive a reload.')
})
