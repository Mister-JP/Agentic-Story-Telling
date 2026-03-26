// @ts-check
import { test, expect } from '@playwright/test'
import { buildWorldModelFixture } from '../fixtures/worldModel.js'
import { clickModeTab } from './support/modeTabs.js'

const WORLD_MODEL_STORAGE_KEY = 'editor-app-world-model-v1'

/**
 * Seed localStorage with the world-model fixture so the app boots
 * with world data for browsing in World mode.
 */
async function seedWorldModel(page) {
  await page.goto('/')
  const fixture = buildWorldModelFixture()
  await page.evaluate(
    ([key, data]) => localStorage.setItem(key, JSON.stringify(data)),
    [WORLD_MODEL_STORAGE_KEY, fixture],
  )
  await page.reload()
}

/**
 * Switch to World mode by clicking the visible SegmentedControl label.
 */
async function switchToWorldMode(page) {
  await clickModeTab(page, 'World')
  await expect(page.getByTestId('world-sidebar')).toBeVisible({ timeout: 5_000 })
}

/**
 * Switch back to Write mode by clicking the visible SegmentedControl label.
 */
async function switchToWriteMode(page) {
  await clickModeTab(page, 'Write')
}

function getWorldItem(worldSidebar, name) {
  return worldSidebar.getByRole('button', { name, exact: true })
}

// ── Test 1: Switch between Write and World tabs ──────────────────────────

test('can switch between Write and World mode tabs', async ({ page }) => {
  await seedWorldModel(page)

  // App starts in Write mode — sidebar shows workspace tree
  await expect(page.getByRole('treeitem', { name: /^story-structure\b/ })).toBeVisible({
    timeout: 10_000,
  })

  // Switch to World mode
  await switchToWorldMode(page)

  // World sidebar should show element names from the fixture
  const worldSidebar = page.getByTestId('world-sidebar')
  await expect(getWorldItem(worldSidebar, 'Mira')).toBeVisible()

  // Switch back to Write mode
  await switchToWriteMode(page)

  // Workspace tree should reappear
  await expect(page.getByRole('treeitem', { name: /^story-structure\b/ })).toBeVisible({
    timeout: 5_000,
  })
})

// ── Test 2: Open an element detail view ──────────────────────────────────

test('opening an element shows its detail view', async ({ page }) => {
  await seedWorldModel(page)
  await switchToWorldMode(page)

  // Click on Mira in the world sidebar
  await getWorldItem(page.getByTestId('world-sidebar'), 'Mira').click()

  // Element detail view should render with section headings
  const detailView = page.getByTestId('element-detail-view')
  await expect(detailView).toBeVisible({ timeout: 5_000 })
  await expect(detailView.getByText('Core Understanding')).toBeVisible()
  await expect(detailView.getByText('PERSON')).toBeVisible()
})

// ── Test 3: Open an event detail view ────────────────────────────────────

test('opening an event shows its detail view', async ({ page }) => {
  await seedWorldModel(page)
  await switchToWorldMode(page)

  // Click on the first event with "letter" in summary
  const worldSidebar = page.getByTestId('world-sidebar')
  await worldSidebar.getByRole('button', { name: /Mira receives a letter/i }).click()

  // Event detail view should render
  await expect(page.getByTestId('event-detail-view')).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText('EVENT')).toBeVisible()
  await expect(page.getByText('Core Understanding')).toBeVisible()
})

// ── Test 4: Search filters the element/event list ────────────────────────

test('search input filters the world sidebar list', async ({ page }) => {
  await seedWorldModel(page)
  await switchToWorldMode(page)

  const worldSidebar = page.getByTestId('world-sidebar')

  // Verify Mira and Silver Key are both visible before searching
  await expect(getWorldItem(worldSidebar, 'Mira')).toBeVisible()
  await expect(getWorldItem(worldSidebar, 'Silver Key')).toBeVisible()

  // Type into the search input
  const searchInput = page.getByTestId('world-search-input')
  await searchInput.fill('Silver')

  // Silver Key should remain, Mira should be hidden
  await expect(getWorldItem(worldSidebar, 'Silver Key')).toBeVisible()
  await expect(getWorldItem(worldSidebar, 'Mira')).not.toBeVisible()

  // Clear search — all should reappear
  await searchInput.clear()
  await expect(getWorldItem(worldSidebar, 'Mira')).toBeVisible()
})
