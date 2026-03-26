import { describe, it, expect } from 'vitest';
import {
  getChangedFileCount,
  getSyncStatusLabel,
  getSyncBadgeProps,
} from '../../src/utils/syncSelectors.js';
import {
  WORKSPACE_TWO_FILES,
  WORKSPACE_TWO_FILES_MODIFIED,
} from '../fixtures/diffEngine.js';
import { createContentSnapshot } from '../../src/utils/diffEngine.js';

// ── Fixtures ─────────────────────────────────────────────────────────────

function buildSyncedState(workspace) {
  const snapshot = createContentSnapshot(workspace);
  return {
    status: 'synced',
    lastSyncedAt: '2026-03-25T12:00:00.000Z',
    lastSyncedSnapshot: snapshot,
  };
}

const NEVER_SYNCED_STATE = {
  status: 'never_synced',
  lastSyncedAt: null,
  lastSyncedSnapshot: {},
};

// ── getChangedFileCount ──────────────────────────────────────────────────

describe('getChangedFileCount', () => {
  it('returns 0 when syncState is null', () => {
    expect(getChangedFileCount(null, WORKSPACE_TWO_FILES)).toBe(0);
  });

  it('returns 0 for never_synced status', () => {
    expect(getChangedFileCount(NEVER_SYNCED_STATE, WORKSPACE_TWO_FILES)).toBe(0);
  });

  it('returns 0 when workspace matches the synced snapshot', () => {
    const syncState = buildSyncedState(WORKSPACE_TWO_FILES);

    expect(getChangedFileCount(syncState, WORKSPACE_TWO_FILES)).toBe(0);
  });

  it('returns 2 when two files have been modified', () => {
    const syncState = buildSyncedState(WORKSPACE_TWO_FILES);

    expect(getChangedFileCount(syncState, WORKSPACE_TWO_FILES_MODIFIED)).toBe(2);
  });

  it('returns 0 when workspace is null', () => {
    expect(getChangedFileCount(NEVER_SYNCED_STATE, null)).toBe(0);
  });
});

// ── getSyncStatusLabel ───────────────────────────────────────────────────

describe('getSyncStatusLabel', () => {
  it('returns "not initialized" when syncState is null', () => {
    expect(getSyncStatusLabel(null, WORKSPACE_TWO_FILES)).toBe('not initialized');
  });

  it('returns "not initialized" for never_synced status', () => {
    expect(getSyncStatusLabel(NEVER_SYNCED_STATE, WORKSPACE_TWO_FILES)).toBe('not initialized');
  });

  it('returns "synced" when workspace matches the snapshot', () => {
    const syncState = buildSyncedState(WORKSPACE_TWO_FILES);

    expect(getSyncStatusLabel(syncState, WORKSPACE_TWO_FILES)).toBe('synced');
  });

  it('returns "2 unsynced" when two files differ from the snapshot', () => {
    const syncState = buildSyncedState(WORKSPACE_TWO_FILES);

    expect(getSyncStatusLabel(syncState, WORKSPACE_TWO_FILES_MODIFIED)).toBe('2 unsynced');
  });
});

// ── getSyncBadgeProps ────────────────────────────────────────────────────

describe('getSyncBadgeProps', () => {
  it('returns gray badge for null syncState', () => {
    const badge = getSyncBadgeProps(null, WORKSPACE_TWO_FILES);

    expect(badge.label).toBe('World: not initialized');
    expect(badge.color).toBe('gray');
  });

  it('returns gray badge for never_synced status', () => {
    const badge = getSyncBadgeProps(NEVER_SYNCED_STATE, WORKSPACE_TWO_FILES);

    expect(badge.label).toBe('World: not initialized');
    expect(badge.color).toBe('gray');
  });

  it('returns green badge when workspace matches the snapshot', () => {
    const syncState = buildSyncedState(WORKSPACE_TWO_FILES);
    const badge = getSyncBadgeProps(syncState, WORKSPACE_TWO_FILES);

    expect(badge.label).toBe('World: synced');
    expect(badge.color).toBe('green');
  });

  it('returns yellow badge with count when files have changed', () => {
    const syncState = buildSyncedState(WORKSPACE_TWO_FILES);
    const badge = getSyncBadgeProps(syncState, WORKSPACE_TWO_FILES_MODIFIED);

    expect(badge.label).toBe('World: 2 unsynced');
    expect(badge.color).toBe('yellow');
  });
});
