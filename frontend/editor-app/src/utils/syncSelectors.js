// Derived sync-status selectors.
// Pure functions that compute display-ready sync state from
// the persisted syncState object and the current workspace tree.

import { createContentSnapshot, getChangedFiles } from './diffEngine.js';

const SYNC_STATUS = {
  NEVER_SYNCED: 'never_synced',
  SYNCED: 'synced',
  UNSYNCED: 'unsynced',
};

// ── Changed-file count ───────────────────────────────────────────────────

/**
 * Count how many workspace files differ from the last-synced snapshot.
 *
 * @param {object|null} syncState  Persisted sync state.
 * @param {object}      workspace  Current workspace tree.
 * @returns {number}
 */
export function getChangedFileCount(syncState, workspace) {
  if (!syncState || !workspace) {
    return 0;
  }

  if (syncState.status === SYNC_STATUS.NEVER_SYNCED) {
    return 0;
  }

  const currentSnapshot = createContentSnapshot(workspace);
  const lastSyncedSnapshot = syncState.lastSyncedSnapshot ?? {};
  const changedFiles = getChangedFiles(currentSnapshot, lastSyncedSnapshot);

  return changedFiles.length;
}

// ── Status label ─────────────────────────────────────────────────────────

/**
 * Derive a human-readable sync status label.
 *
 * @param {object|null} syncState  Persisted sync state.
 * @param {object}      workspace  Current workspace tree.
 * @returns {string}  e.g. "not initialized", "synced", "3 unsynced"
 */
export function getSyncStatusLabel(syncState, workspace) {
  if (!syncState || syncState.status === SYNC_STATUS.NEVER_SYNCED) {
    return 'not initialized';
  }

  const changedCount = getChangedFileCount(syncState, workspace);

  if (changedCount === 0) {
    return 'synced';
  }

  return `${changedCount} unsynced`;
}

// ── Badge props ──────────────────────────────────────────────────────────

/**
 * Compute the props needed to render the sync status badge in the Topbar.
 *
 * @param {object|null} syncState  Persisted sync state.
 * @param {object}      workspace  Current workspace tree.
 * @returns {{ label: string, color: string }}
 */
export function getSyncBadgeProps(syncState, workspace) {
  if (!syncState || syncState.status === SYNC_STATUS.NEVER_SYNCED) {
    return { label: 'World: not initialized', color: 'gray' };
  }

  const changedCount = getChangedFileCount(syncState, workspace);

  if (changedCount === 0) {
    return { label: 'World: synced', color: 'green' };
  }

  return {
    label: `World: ${changedCount} unsynced`,
    color: 'yellow',
  };
}
