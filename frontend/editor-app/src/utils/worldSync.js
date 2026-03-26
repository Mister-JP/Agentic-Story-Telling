import {
  assembleCombinedDiff,
  createContentSnapshot,
  getChangedFiles,
} from './diffEngine.js'
import { DEFAULT_EVENTS_INDEX_PREAMBLE, EVENT_FIELD_NAMES } from './eventsIndexFields.js'
import { renderIndexMarkdown } from './worldModel.js'

const NEVER_SYNCED_STATUS = 'never_synced'
const DEFAULT_SYNC_BUTTON_LABEL = 'Sync World Model'
const LOADING_SYNC_BUTTON_LABEL = 'Starting Sync...'
function getInitialSyncFileChanges(currentSnapshot) {
  return Object.entries(currentSnapshot)
    .filter(([, fileSnapshot]) => fileSnapshot.markdown.trim() !== '')
    .map(([fileId, fileSnapshot]) => ({
      fileId,
      fileName: fileSnapshot.name,
      filePath: fileSnapshot.path,
      status: 'added',
    }))
}

function getChangedFilesForSnapshot(
  currentSnapshot,
  syncState,
  lastSyncedSnapshot = getLastSyncedSnapshot(syncState),
) {
  if (syncState?.status === NEVER_SYNCED_STATUS) {
    return getInitialSyncFileChanges(currentSnapshot)
  }

  return getChangedFiles(currentSnapshot, lastSyncedSnapshot)
}

function getSelectedFileIdentifiers(changedFiles) {
  return changedFiles.map((changedFile) => changedFile.fileId)
}

function getLastSyncedSnapshot(syncState) {
  if (syncState?.status === NEVER_SYNCED_STATUS) {
    return {}
  }

  return syncState?.lastSyncedSnapshot ?? {}
}

export function getEventsIndexMarkdown(worldModel) {
  if (!worldModel?.events) {
    return ''
  }

  const indexPreamble = worldModel.events.indexPreamble?.trim()
    ? worldModel.events.indexPreamble
    : DEFAULT_EVENTS_INDEX_PREAMBLE

  return renderIndexMarkdown(
    indexPreamble,
    worldModel.events.entries,
    EVENT_FIELD_NAMES,
  )
}

export function canStartWorldSync(workspace, syncState) {
  const currentSnapshot = createContentSnapshot(workspace)
  return getChangedFilesForSnapshot(currentSnapshot, syncState).length > 0
}

export function buildWorldSyncDraft(workspace, syncState, worldModel) {
  const currentSnapshot = createContentSnapshot(workspace)
  const lastSyncedSnapshot = getLastSyncedSnapshot(syncState)
  const changedFiles = getChangedFilesForSnapshot(currentSnapshot, syncState, lastSyncedSnapshot)
  const selectedFileIds = getSelectedFileIdentifiers(changedFiles)
  const diffText = assembleCombinedDiff(
    changedFiles,
    selectedFileIds,
    currentSnapshot,
    lastSyncedSnapshot,
  )

  return {
    changedFiles,
    diffText,
    eventsMd: getEventsIndexMarkdown(worldModel),
    selectedFileIds,
  }
}

export function getWorldSyncButtonState(workspace, syncState, isSyncInProgress) {
  if (isSyncInProgress === true) {
    return {
      disabled: true,
      label: LOADING_SYNC_BUTTON_LABEL,
    }
  }

  return {
    disabled: canStartWorldSync(workspace, syncState) === false,
    label: DEFAULT_SYNC_BUTTON_LABEL,
  }
}
