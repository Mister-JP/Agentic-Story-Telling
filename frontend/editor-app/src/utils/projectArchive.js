import { fileOpen, fileSave } from 'browser-fs-access'
import JSZip from 'jszip'

const APP_ID = 'editor-app'
const ARCHIVE_VERSION = 1
const ARCHIVE_FILE_NAME = 'workspace.json'
const ARCHIVE_EXTENSIONS = ['.zip']
const ARCHIVE_MIME_TYPES = ['application/zip', 'application/x-zip-compressed']

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

function validateArchivePayload(payload) {
  if (!isPlainObject(payload)) {
    throw new Error('Invalid archive: workspace payload is missing.')
  }

  if (payload.app !== APP_ID) {
    throw new Error('Invalid archive: wrong app format.')
  }

  if (payload.version !== ARCHIVE_VERSION) {
    throw new Error(`Unsupported archive version: ${payload.version}`)
  }

  if (!isValidWorkspaceNode(payload.workspace) || payload.workspace.type !== 'folder') {
    throw new Error('Invalid archive: workspace data is malformed.')
  }

  if (
    payload.selectedNodeId !== null &&
    payload.selectedNodeId !== undefined &&
    typeof payload.selectedNodeId !== 'string'
  ) {
    throw new Error('Invalid archive: selected node is malformed.')
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

export async function exportProjectZip({ workspace, selectedNodeId }) {
  const zip = new JSZip()
  const payload = {
    app: APP_ID,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    workspace,
    selectedNodeId: selectedNodeId ?? null,
  }

  zip.file(ARCHIVE_FILE_NAME, JSON.stringify(payload, null, 2))

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  await fileSave(blob, {
    id: 'editor-app-export',
    description: 'Editor project archive',
    extensions: ARCHIVE_EXTENSIONS,
    fileName: `editor-project-${new Date().toISOString().slice(0, 10)}.zip`,
    mimeTypes: ARCHIVE_MIME_TYPES,
  })
}

export async function importProjectZip() {
  const archiveFile = await fileOpen({
    id: 'editor-app-import',
    description: 'Editor project archive',
    extensions: ARCHIVE_EXTENSIONS,
  })

  const zip = await JSZip.loadAsync(archiveFile)
  const entry = zip.file(ARCHIVE_FILE_NAME)

  if (!entry) {
    throw new Error('Invalid archive: workspace.json not found.')
  }

  const text = await entry.async('string')
  const payload = JSON.parse(text)

  validateArchivePayload(payload)

  return {
    workspace: payload.workspace,
    selectedNodeId: payload.selectedNodeId ?? null,
  }
}
