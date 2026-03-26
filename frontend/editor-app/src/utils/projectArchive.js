import { fileOpen, fileSave } from 'browser-fs-access'
import JSZip from 'jszip'
import { createContentSnapshot, getChangedFiles } from './diffEngine.js'
import { renderIndexMarkdown } from './worldModel.js'

const APP_ID = 'editor-app'
const ARCHIVE_VERSION = 2
const ARCHIVE_FILE_NAME = 'workspace.json'
const ARCHIVE_EXTENSIONS = ['.zip']
const ARCHIVE_MIME_TYPES = ['application/zip', 'application/x-zip-compressed']
const WORLD_MODEL_ROOT_DIRECTORY = 'world-model'
const ELEMENT_INDEX_FIELD_NAMES = [
  'kind',
  'display_name',
  'uuid',
  'aliases',
  'identification_keys',
]
const EVENT_INDEX_FIELD_NAMES = [
  'uuid',
  'when',
  'chapters',
  'summary',
]
const SUPPORTED_SYNC_STATUSES = new Set(['never_synced', 'synced', 'unsynced'])

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNullableString(value) {
  return value === null || typeof value === 'string'
}

function isOptionalStringOrNull(value) {
  return value === null || value === undefined || typeof value === 'string'
}

function isValidWorkspaceNode(node) {
  if (!isPlainObject(node)) {
    return false
  }

  if (typeof node.id !== 'string' || typeof node.name !== 'string') {
    return false
  }

  if (node.type === 'file') {
    return typeof node.content === 'string'
  }

  if (node.type !== 'folder' || !Array.isArray(node.children)) {
    return false
  }

  return node.children.every(isValidWorkspaceNode)
}

function isValidSnapshotEntry(entry) {
  if (!isPlainObject(entry)) {
    return false
  }

  return (
    typeof entry.name === 'string' &&
    typeof entry.path === 'string' &&
    typeof entry.markdown === 'string'
  )
}

function isValidSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    return false
  }

  return Object.values(snapshot).every(isValidSnapshotEntry)
}

function isValidWorldModelEntry(entry, fieldNames) {
  if (!isPlainObject(entry)) {
    return false
  }

  return fieldNames.every((fieldName) => typeof entry[fieldName] === 'string')
}

function isValidWorldModelLayer(layer, fieldNames) {
  if (!isPlainObject(layer)) {
    return false
  }

  if (typeof layer.indexPreamble !== 'string' || !Array.isArray(layer.entries)) {
    return false
  }

  if (!isPlainObject(layer.details)) {
    return false
  }

  const hasValidEntries = layer.entries.every((entry) => isValidWorldModelEntry(entry, fieldNames))
  const hasValidDetails = Object.values(layer.details).every((detailMarkdown) => typeof detailMarkdown === 'string')

  return hasValidEntries && hasValidDetails
}

function isValidWorldModel(worldModel) {
  if (worldModel === null) {
    return true
  }

  if (!isPlainObject(worldModel)) {
    return false
  }

  return (
    isValidWorldModelLayer(worldModel.elements, ELEMENT_INDEX_FIELD_NAMES) &&
    isValidWorldModelLayer(worldModel.events, EVENT_INDEX_FIELD_NAMES)
  )
}

function isValidSyncState(syncState) {
  if (!isPlainObject(syncState)) {
    return false
  }

  if (!SUPPORTED_SYNC_STATUSES.has(syncState.status)) {
    return false
  }

  if (!isNullableString(syncState.lastSyncedAt)) {
    return false
  }

  return isValidSnapshot(syncState.lastSyncedSnapshot)
}

function createInitialSyncState() {
  return {
    status: 'never_synced',
    lastSyncedAt: null,
    lastSyncedSnapshot: {},
  }
}

function assertArchiveEnvelope(payload) {
  if (!isPlainObject(payload)) {
    throw new Error('Invalid archive: workspace payload is missing.')
  }

  if (payload.app !== APP_ID) {
    throw new Error('Invalid archive: wrong app format.')
  }

  if (typeof payload.version !== 'number') {
    throw new Error(`Unsupported archive version: ${payload.version}`)
  }

  if (payload.version !== 1 && payload.version !== ARCHIVE_VERSION) {
    throw new Error(`Unsupported archive version: ${payload.version}`)
  }
}

function assertWorkspacePayload(payload) {
  if (!isValidWorkspaceNode(payload.workspace) || payload.workspace.type !== 'folder') {
    throw new Error('Invalid archive: workspace data is malformed.')
  }
}

function assertSelectedNodeId(payload) {
  if (!isOptionalStringOrNull(payload.selectedNodeId)) {
    throw new Error('Invalid archive: selected node is malformed.')
  }
}

function assertWorldModelPayload(payload) {
  if (!Object.hasOwn(payload, 'worldModel') || !isValidWorldModel(payload.worldModel)) {
    throw new Error('Invalid archive: world model data is malformed.')
  }
}

function assertSyncStatePayload(payload) {
  if (!Object.hasOwn(payload, 'syncState') || !isValidSyncState(payload.syncState)) {
    throw new Error('Invalid archive: sync state is malformed.')
  }
}

function assertVersionOnePayload(payload) {
  assertWorkspacePayload(payload)
  assertSelectedNodeId(payload)
}

function assertVersionTwoPayload(payload) {
  assertWorkspacePayload(payload)
  assertSelectedNodeId(payload)
  assertWorldModelPayload(payload)
  assertSyncStatePayload(payload)
}

function parseVersionOnePayload(payload) {
  return {
    workspace: payload.workspace,
    selectedNodeId: payload.selectedNodeId ?? null,
    worldModel: null,
    syncState: createInitialSyncState(),
  }
}

function parseVersionTwoPayload(payload) {
  return {
    workspace: payload.workspace,
    selectedNodeId: payload.selectedNodeId ?? null,
    worldModel: payload.worldModel,
    syncState: payload.syncState,
  }
}

function parseArchivePayload(payload) {
  assertArchiveEnvelope(payload)

  if (payload.version === 1) {
    assertVersionOnePayload(payload)
    return parseVersionOnePayload(payload)
  }

  assertVersionTwoPayload(payload)
  return parseVersionTwoPayload(payload)
}

function validateWorkspaceForExport(workspace) {
  if (!isValidWorkspaceNode(workspace) || workspace.type !== 'folder') {
    throw new Error('Invalid archive: workspace data is malformed.')
  }
}

function normalizeSelectedNodeId(selectedNodeId) {
  if (!isOptionalStringOrNull(selectedNodeId)) {
    throw new Error('Invalid archive: selected node is malformed.')
  }

  return selectedNodeId ?? null
}

function normalizeWorldModelForExport(worldModel) {
  if (worldModel === undefined || worldModel === null) {
    return null
  }

  if (!isValidWorldModel(worldModel)) {
    throw new Error('Invalid archive: world model data is malformed.')
  }

  return worldModel
}

function normalizeSyncStateForExport(syncState) {
  if (syncState === undefined || syncState === null) {
    return createInitialSyncState()
  }

  if (!isValidSyncState(syncState)) {
    throw new Error('Invalid archive: sync state is malformed.')
  }

  return syncState
}

function createArchivePayload({ workspace, selectedNodeId, worldModel, syncState }) {
  validateWorkspaceForExport(workspace)

  return {
    app: APP_ID,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    workspace,
    selectedNodeId: normalizeSelectedNodeId(selectedNodeId),
    worldModel: normalizeWorldModelForExport(worldModel),
    syncState: normalizeSyncStateForExport(syncState),
  }
}

function renderElementIndexMarkdown(worldModel) {
  return renderIndexMarkdown(
    worldModel.elements.indexPreamble,
    worldModel.elements.entries,
    ELEMENT_INDEX_FIELD_NAMES,
  )
}

function renderEventIndexMarkdown(worldModel) {
  return renderIndexMarkdown(
    worldModel.events.indexPreamble,
    worldModel.events.entries,
    EVENT_INDEX_FIELD_NAMES,
  )
}

function addDetailMarkdownFiles(directory, detailMap) {
  for (const [detailId, detailMarkdown] of Object.entries(detailMap)) {
    directory.file(`${detailId}.md`, detailMarkdown)
  }
}

function addWorldModelFilesToZip(zip, worldModel) {
  if (worldModel === null) {
    return
  }

  const worldModelDirectory = zip.folder(WORLD_MODEL_ROOT_DIRECTORY)
  const elementDirectory = worldModelDirectory.folder('elements')
  const eventDirectory = worldModelDirectory.folder('events')

  worldModelDirectory.file('elements.md', renderElementIndexMarkdown(worldModel))
  worldModelDirectory.file('events.md', renderEventIndexMarkdown(worldModel))
  addDetailMarkdownFiles(elementDirectory, worldModel.elements.details)
  addDetailMarkdownFiles(eventDirectory, worldModel.events.details)
}

async function buildProjectArchiveBlob(projectState) {
  const archivePayload = createArchivePayload(projectState)
  const zip = new JSZip()

  zip.file(ARCHIVE_FILE_NAME, JSON.stringify(archivePayload, null, 2))
  addWorldModelFilesToZip(zip, archivePayload.worldModel)

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

async function saveProjectArchiveBlob(archiveBlob) {
  await fileSave(archiveBlob, {
    id: 'editor-app-export',
    description: 'Editor project archive',
    extensions: ARCHIVE_EXTENSIONS,
    fileName: `editor-project-${new Date().toISOString().slice(0, 10)}.zip`,
    mimeTypes: ARCHIVE_MIME_TYPES,
  })
}

async function openProjectArchiveFile() {
  return fileOpen({
    id: 'editor-app-import',
    description: 'Editor project archive',
    extensions: ARCHIVE_EXTENSIONS,
  })
}

async function readArchivePayloadText(zip) {
  const archiveEntry = zip.file(ARCHIVE_FILE_NAME)

  if (!archiveEntry) {
    throw new Error('Invalid archive: workspace.json not found.')
  }

  return archiveEntry.async('string')
}

function parseArchivePayloadText(payloadText) {
  try {
    return JSON.parse(payloadText)
  } catch {
    throw new Error('Invalid archive: workspace.json is not valid JSON.')
  }
}

export function isProjectArchiveAbortError(error) {
  return (
    error?.name === 'AbortError' ||
    error?.message === 'The user aborted a request.' ||
    error?.message === 'The operation was aborted.' ||
    error?.code === 20
  )
}

export function checkSyncBeforeDownload(syncState, workspace) {
  if (!isValidWorkspaceNode(workspace) || !isValidSyncState(syncState)) {
    return { needsWarning: false, changedFileCount: 0 }
  }

  if (syncState.status === 'never_synced') {
    return { needsWarning: false, changedFileCount: 0 }
  }

  const currentSnapshot = createContentSnapshot(workspace)
  const changedFiles = getChangedFiles(currentSnapshot, syncState.lastSyncedSnapshot)
  const changedFileCount = changedFiles.length

  return {
    needsWarning: changedFileCount > 0,
    changedFileCount,
  }
}

export async function exportProjectZip(projectState) {
  const archiveBlob = await buildProjectArchiveBlob(projectState)
  await saveProjectArchiveBlob(archiveBlob)
}

export async function importProjectZip() {
  const archiveFile = await openProjectArchiveFile()
  const zip = await JSZip.loadAsync(archiveFile)
  const payloadText = await readArchivePayloadText(zip)
  const payload = parseArchivePayloadText(payloadText)

  return parseArchivePayload(payload)
}
