import {
  assembleCombinedDiff,
  createContentSnapshot,
  getChangedFiles,
} from './diffEngine.js'
import { renderIndexMarkdown } from './worldModel.js'

const NEVER_SYNCED_STATUS = 'never_synced'
// Keep this field order in sync with backend/services/stub_payloads.py.
const EVENT_FIELD_NAMES = ['uuid', 'when', 'chapters', 'summary']
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

function getChangedFilesForSnapshot(currentSnapshot, syncState) {
  if (syncState?.status === NEVER_SYNCED_STATUS) {
    return getInitialSyncFileChanges(currentSnapshot)
  }

  const lastSyncedSnapshot = syncState?.lastSyncedSnapshot ?? {}
  return getChangedFiles(currentSnapshot, lastSyncedSnapshot)
}

function getSelectedFileIdentifiers(changedFiles) {
  return changedFiles.map((changedFile) => changedFile.fileId)
}

export function getEventsIndexMarkdown(worldModel) {
  if (!worldModel?.events) {
    return ''
  }

  return renderIndexMarkdown(
    worldModel.events.indexPreamble,
    worldModel.events.entries,
    EVENT_FIELD_NAMES,
  )
}

export function canStartWorldSync(workspace, syncState) {
  const currentSnapshot = createContentSnapshot(workspace)
  return getChangedFilesForSnapshot(currentSnapshot, syncState).length > 0
}

export function buildEventsIndexProposePayload(workspace, syncState, worldModel) {
  const currentSnapshot = createContentSnapshot(workspace)
  const changedFiles = getChangedFilesForSnapshot(currentSnapshot, syncState)
  const selectedFileIds = getSelectedFileIdentifiers(changedFiles)
  const lastSyncedSnapshot = syncState?.status === NEVER_SYNCED_STATUS
    ? {}
    : (syncState?.lastSyncedSnapshot ?? {})
  const diffText = assembleCombinedDiff(
    changedFiles,
    selectedFileIds,
    currentSnapshot,
    lastSyncedSnapshot,
  )

  return {
    diffText,
    eventsMd: getEventsIndexMarkdown(worldModel),
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
