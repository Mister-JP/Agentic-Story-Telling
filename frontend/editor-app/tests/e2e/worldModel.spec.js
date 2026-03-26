// @ts-check
import { test, expect } from '@playwright/test';
import { buildWorldModelFixture } from '../fixtures/worldModel.js';

const WORLD_MODEL_STORAGE_KEY = 'editor-app-world-model-v1';

/**
 * Seed localStorage with the world-model fixture and reload so the app
 * boots with world-model data already present.
 */
async function seedWorldModel(page) {
  await page.goto('/');
  const fixture = buildWorldModelFixture();
  await page.evaluate(
    ([key, data]) => localStorage.setItem(key, JSON.stringify(data)),
    [WORLD_MODEL_STORAGE_KEY, fixture],
  );
  await page.reload();
}

// ── Test: App boots with seeded world model ──────────────────────────────

test('app boots cleanly with world-model data in localStorage', async ({ page }) => {
  await seedWorldModel(page);

  // The app should render without errors — sidebar and main panel visible
  await expect(
    page.locator('[data-testid="sidebar"], .sidebar-shell').first(),
  ).toBeVisible({ timeout: 10_000 });

  await expect(page.locator('.main-shell').first()).toBeVisible();
});

// ── Test: Seeded world-model data persists across reload ─────────────────

test('world-model data survives page reload', async ({ page }) => {
  await seedWorldModel(page);

  const storedData = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    WORLD_MODEL_STORAGE_KEY,
  );

  expect(storedData).not.toBeNull();
  expect(storedData.elements.entries).toHaveLength(9);
  expect(storedData.events.entries).toHaveLength(7);
  expect(storedData.elements.details['elt_45d617e4531b']).toContain('Mira');
  expect(storedData.events.details['evt_f72bc8fe0f29']).toContain('letter');
});

// ── Test: World model structure has expected layers ───────────────────────

test('seeded world model has elements and events with correct structure', async ({ page }) => {
  await seedWorldModel(page);

  const worldModel = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    WORLD_MODEL_STORAGE_KEY,
  );

  // Elements layer
  expect(worldModel.elements).toHaveProperty('indexPreamble');
  expect(worldModel.elements).toHaveProperty('entries');
  expect(worldModel.elements).toHaveProperty('details');
  expect(worldModel.elements.indexPreamble).toContain('# Elements');

  // Events layer
  expect(worldModel.events).toHaveProperty('indexPreamble');
  expect(worldModel.events).toHaveProperty('entries');
  expect(worldModel.events).toHaveProperty('details');
  expect(worldModel.events.indexPreamble).toContain('# Events');

  // Verify specific entries exist
  const elementNames = worldModel.elements.entries.map(entry => entry.display_name);
  expect(elementNames).toContain('Mira');
  expect(elementNames).toContain('Silver Key');
  expect(elementNames).toContain('Saint Alder Chapel');

  const eventUuids = worldModel.events.entries.map(entry => entry.uuid);
  expect(eventUuids).toContain('evt_f72bc8fe0f29');
  expect(eventUuids).toContain('evt_18262658f796');
});
