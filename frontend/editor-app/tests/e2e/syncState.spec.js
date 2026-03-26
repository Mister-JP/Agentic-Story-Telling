// @ts-check
import { test, expect } from '@playwright/test';

const WORKSPACE_STORAGE_KEY = 'editor-app-workspace-v1';
const SYNC_STATE_STORAGE_KEY = 'editor-app-sync-state-v1';
const WORLD_MODEL_STORAGE_KEY = 'editor-app-world-model-v1';

/**
 * Build a minimal workspace with one file for badge testing.
 */
function buildMinimalWorkspace() {
  return {
    id: 'workspace-root',
    name: 'workspace',
    type: 'folder',
    children: [
      {
        id: 'chapter-01',
        name: 'chapter-01.story',
        type: 'file',
        content: '<h1>Chapter 1</h1><p>Once upon a time.</p>',
      },
    ],
  };
}

/**
 * Seed localStorage with workspace, syncState, and optionally worldModel,
 * then reload so the app boots with the seeded data.
 */
async function seedAndReload(page, { workspace, syncState, worldModel = null }) {
  await page.goto('/');
  await page.evaluate(
    ([wsKey, wsData, ssKey, ssData, wmKey, wmData]) => {
      localStorage.setItem(wsKey, JSON.stringify(wsData));
      localStorage.setItem(ssKey, JSON.stringify(ssData));
      if (wmData !== undefined) {
        localStorage.setItem(wmKey, JSON.stringify(wmData));
      }
    },
    [
      WORKSPACE_STORAGE_KEY,
      workspace,
      SYNC_STATE_STORAGE_KEY,
      syncState,
      WORLD_MODEL_STORAGE_KEY,
      worldModel,
    ],
  );
  await page.reload();
}

// ── Test: "synced" badge survives refresh ─────────────────────────────────

test('sync status badge shows "synced" and persists after refresh', async ({ page }) => {
  const workspace = buildMinimalWorkspace();
  const syncState = {
    status: 'synced',
    lastSyncedAt: '2026-03-25T12:00:00.000Z',
    lastSyncedSnapshot: {
      'chapter-01': {
        name: 'chapter-01.story',
        path: 'chapter-01.story',
        markdown: '# Chapter 1\n\nOnce upon a time.',
      },
    },
  };

  await seedAndReload(page, { workspace, syncState });

  const badge = page.getByTestId('sync-status-badge');
  await expect(badge).toBeVisible({ timeout: 10_000 });
  await expect(badge).toContainText('synced');

  // Refresh and verify the badge persists
  await page.reload();
  await expect(badge).toBeVisible({ timeout: 10_000 });
  await expect(badge).toContainText('synced');
});

// ── Test: "never_synced" badge survives refresh ──────────────────────────

test('sync status badge shows "not initialized" for never_synced state', async ({ page }) => {
  const workspace = buildMinimalWorkspace();
  const syncState = {
    status: 'never_synced',
    lastSyncedAt: null,
    lastSyncedSnapshot: {},
  };

  await seedAndReload(page, { workspace, syncState });

  const badge = page.getByTestId('sync-status-badge');
  await expect(badge).toBeVisible({ timeout: 10_000 });
  await expect(badge).toContainText('not initialized');

  // Refresh and verify persistence
  await page.reload();
  await expect(badge).toBeVisible({ timeout: 10_000 });
  await expect(badge).toContainText('not initialized');
});

// ── Test: "unsynced" badge survives refresh ───────────────────────────────

test('sync status badge shows "unsynced" when content differs from snapshot', async ({ page }) => {
  const workspace = buildMinimalWorkspace();
  // The snapshot has different content than the current workspace
  const syncState = {
    status: 'synced',
    lastSyncedAt: '2026-03-25T12:00:00.000Z',
    lastSyncedSnapshot: {
      'chapter-01': {
        name: 'chapter-01.story',
        path: 'chapter-01.story',
        markdown: '# Chapter 1\n\nOld content that no longer matches.',
      },
    },
  };

  await seedAndReload(page, { workspace, syncState });

  const badge = page.getByTestId('sync-status-badge');
  await expect(badge).toBeVisible({ timeout: 10_000 });
  await expect(badge).toContainText('unsynced');

  // Refresh and verify persistence
  await page.reload();
  await expect(badge).toBeVisible({ timeout: 10_000 });
  await expect(badge).toContainText('unsynced');
});
