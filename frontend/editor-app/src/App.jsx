import { Box, Flex, useTree } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import EditorPane from './components/EditorPane.jsx'
import Sidebar from './components/Sidebar.jsx'
import Topbar from './components/Topbar.jsx'
import WorldPanel from './components/WorldPanel.jsx'
import { ApiClientError, proposeEventsIndex } from './utils/agentApi.js'
import { getSyncBadgeProps } from './utils/syncSelectors.js'
import {
  buildEventsIndexProposePayload,
  getWorldSyncButtonState,
} from './utils/worldSync.js'
import WorkspaceDialog from './components/WorkspaceDialog.jsx'
import {
  DEFAULT_FILE_ID,
  DEFAULT_OPEN_FOLDER_ID,
  ROOT_ID,
  createInitialTree,
  initialTree,
} from './data/initialTree.js'
import {
  addNode,
  createFileNode,
  createFolderNode,
  deleteNode,
  findNodeMeta,
  getFirstFileId,
  getInsertionTarget,
  getNodeDescendantStats,
  getNodePath,
  isNameAvailable,
  normalizeNodeName,
  pruneExpandedState,
  renameNode,
  updateFileContent,
} from './utils/tree.js'
import {
  exportProjectZip,
  importProjectZip,
  isProjectArchiveAbortError,
} from './utils/projectArchive.js'

const DEFAULT_EXPANDED_STATE = {
  [ROOT_ID]: true,
  [DEFAULT_OPEN_FOLDER_ID]: true,
}

function resolveSelectionId(workspace, candidateId) {
  if (candidateId && findNodeMeta(workspace, candidateId)) {
    return candidateId
  }

  return getFirstFileId(workspace) ?? ROOT_ID
}

function getExpandedStateForSelection(workspace, selectedId) {
  const path = getNodePath(workspace, selectedId) ?? [workspace.id]

  return path.slice(0, -1).reduce((state, nodeId) => {
    state[nodeId] = true
    return state
  }, { [workspace.id]: true })
}

function getPathNodes(workspace, selectedId) {
  const path = getNodePath(workspace, selectedId) ?? [workspace.id]

  return path
    .map((nodeId) => {
      if (nodeId === workspace.id) {
        return workspace
      }

      return findNodeMeta(workspace, nodeId)?.node ?? null
    })
    .filter(Boolean)
}

function buildWorldSyncSuccessMessage(proposal) {
  const proposedDeltaCount = proposal?.deltas?.length ?? 0
  const deltaLabel = proposedDeltaCount === 1 ? 'proposal' : 'proposals'
  return `Backend contract reachable. Received ${proposedDeltaCount} stub event ${deltaLabel}.`
}

function getWorldSyncErrorMessage(error) {
  if (error instanceof ApiClientError) {
    return error.message
  }

  return 'Failed to start world sync.'
}

const INITIAL_SYNC_STATE = {
  status: 'never_synced',
  lastSyncedAt: null,
  lastSyncedSnapshot: {},
}

function App() {
  const [workspace, setWorkspace] = useLocalStorage({
    key: 'editor-app-workspace-v1',
    defaultValue: initialTree,
  })

  const [worldModel, setWorldModel] = useLocalStorage({
    key: 'editor-app-world-model-v1',
    defaultValue: null,
  })

  const [syncState, setSyncState] = useLocalStorage({
    key: 'editor-app-sync-state-v1',
    defaultValue: INITIAL_SYNC_STATE,
  })
  const [isWorldSyncLoading, setIsWorldSyncLoading] = useState(false)

  const syncBadgeProps = useMemo(
    () => getSyncBadgeProps(syncState, workspace),
    [syncState, workspace],
  )
  const worldSyncButtonState = useMemo(
    () => getWorldSyncButtonState(workspace, syncState, isWorldSyncLoading),
    [workspace, syncState, isWorldSyncLoading],
  )
  const [viewMode, setViewMode] = useState('write')
  const [worldSelection, setWorldSelection] = useState(null)

  const handleViewModeChange = useCallback((nextMode) => {
    setViewMode(nextMode)
    if (nextMode === 'write') {
      setWorldSelection(null)
    }
  }, [])

  const handleWorldSelect = useCallback((uuid) => {
    setWorldSelection(uuid)
  }, [])

  const [dialogAction, setDialogAction] = useState(null)
  const [dialogTargetId, setDialogTargetId] = useState(null)
  const [dialogDraftName, setDialogDraftName] = useState('')
  const [dialogError, setDialogError] = useState('')
  const [projectAction, setProjectAction] = useState(null)
  const [projectStatus, setProjectStatus] = useState(null)

  const tree = useTree({
    initialExpandedState: DEFAULT_EXPANDED_STATE,
    initialSelectedState: [DEFAULT_FILE_ID],
  })

  const rawSelectedNodeId = tree.selectedState[0] ?? null
  const selectedNodeId = rawSelectedNodeId ?? ROOT_ID

  const selectedMeta = useMemo(() => {
    return findNodeMeta(workspace, selectedNodeId) ?? { node: workspace, parent: null }
  }, [workspace, selectedNodeId])

  const selectedNode = selectedMeta.node
  const selectedFile = selectedNode.type === 'file' ? selectedNode : null
  const selectionMode =
    selectedNode.type === 'file'
      ? 'file'
      : selectedNode.id === ROOT_ID
        ? 'empty'
        : 'folder'
  const targetFolder = useMemo(
    () => getInsertionTarget(workspace, rawSelectedNodeId).node,
    [workspace, rawSelectedNodeId],
  )
  const selectedPathNodes = useMemo(
    () => getPathNodes(workspace, selectedNode.id),
    [workspace, selectedNode.id],
  )
  const selectedPathNames = selectedPathNodes.map((node) => node.name)
  const sidebarCreateTargetId = selectionMode === 'folder' ? selectedNode.id : ROOT_ID
  const dialogTargetMeta = useMemo(() => {
    if (!dialogTargetId) {
      return null
    }

    return findNodeMeta(workspace, dialogTargetId) ?? null
  }, [dialogTargetId, workspace])
  const dialogTargetNode = dialogTargetMeta?.node ?? (dialogAction === 'newProject' ? workspace : null)
  const dialogDeleteStats = useMemo(() => {
    if (dialogAction !== 'delete' || dialogTargetNode?.type !== 'folder') {
      return null
    }

    return getNodeDescendantStats(dialogTargetNode)
  }, [dialogAction, dialogTargetNode])

  useEffect(() => {
    const currentSelection = rawSelectedNodeId ? findNodeMeta(workspace, rawSelectedNodeId) : null

    if (!currentSelection) {
      tree.select(resolveSelectionId(workspace, null))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, rawSelectedNodeId])

  useEffect(() => {
    if (!projectStatus) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setProjectStatus(null)
    }, 4000)

    return () => window.clearTimeout(timeoutId)
  }, [projectStatus])

  const syncTreeToWorkspace = (nextWorkspace, candidateId, expandedState) => {
    const nextSelectedId = resolveSelectionId(nextWorkspace, candidateId)

    tree.setSelectedState([nextSelectedId])
    tree.setExpandedState(expandedState ?? getExpandedStateForSelection(nextWorkspace, nextSelectedId))
  }

  const closeDialog = () => {
    setDialogAction(null)
    setDialogTargetId(null)
    setDialogDraftName('')
    setDialogError('')
  }

  const openDialog = (nextAction, explicitTargetId = null) => {
    let nextTargetId = ROOT_ID

    if (nextAction === 'newFile' || nextAction === 'newFolder') {
      nextTargetId = explicitTargetId ?? targetFolder.id
    }

    if (nextAction === 'rename' || nextAction === 'delete') {
      nextTargetId = explicitTargetId ?? selectedNode.id

      if (nextTargetId === ROOT_ID) {
        return
      }
    }

    setDialogAction(nextAction)
    setDialogTargetId(nextTargetId)
    setDialogError('')

    if (nextAction === 'rename') {
      const targetMeta = findNodeMeta(workspace, nextTargetId)
      setDialogDraftName(targetMeta?.node?.name ?? '')
      return
    }

    if (nextAction === 'delete' || nextAction === 'newProject') {
      setDialogDraftName('')
      return
    }

    setDialogDraftName(nextAction === 'newFile' ? 'untitled.story' : 'new-folder')
  }

  const handleDialogDraftNameChange = (nextName) => {
    setDialogDraftName(nextName)

    if (dialogError) {
      setDialogError('')
    }
  }

  const handleCreateFile = (name, folderId) => {
    const nextName = normalizeNodeName(name)
    const folderMeta = findNodeMeta(workspace, folderId)

    if (!nextName) {
      return 'File name cannot be empty.'
    }

    if (!folderMeta || folderMeta.node.type !== 'folder') {
      return 'Choose a folder before creating a file.'
    }

    if (!isNameAvailable(workspace, folderId, nextName)) {
      return 'That name already exists in this folder.'
    }

    const nextFile = createFileNode(nextName)
    const nextWorkspace = addNode(workspace, folderId, nextFile)

    setWorkspace(nextWorkspace)
    tree.expand(folderId)
    tree.select(nextFile.id)

    return null
  }

  const handleCreateFolder = (name, folderId) => {
    const nextName = normalizeNodeName(name)
    const folderMeta = findNodeMeta(workspace, folderId)

    if (!nextName) {
      return 'Folder name cannot be empty.'
    }

    if (!folderMeta || folderMeta.node.type !== 'folder') {
      return 'Choose a folder before creating a folder.'
    }

    if (!isNameAvailable(workspace, folderId, nextName)) {
      return 'That name already exists in this folder.'
    }

    const nextFolder = createFolderNode(nextName)
    const nextWorkspace = addNode(workspace, folderId, nextFolder)

    setWorkspace(nextWorkspace)
    tree.expand(folderId)
    tree.expand(nextFolder.id)
    tree.select(nextFolder.id)

    return null
  }

  const handleRename = (name, targetId) => {
    if (!targetId || targetId === ROOT_ID) {
      return 'Select a file or folder inside workspace first.'
    }

    const nextName = normalizeNodeName(name)
    const targetMeta = findNodeMeta(workspace, targetId)

    if (!targetMeta) {
      return 'The selected item is no longer available.'
    }

    const parentId = targetMeta.parent?.id ?? ROOT_ID

    if (!nextName) {
      return 'Name cannot be empty.'
    }

    if (!isNameAvailable(workspace, parentId, nextName, targetId)) {
      return 'That name already exists in this folder.'
    }

    const nextWorkspace = renameNode(workspace, targetId, nextName)

    setWorkspace(nextWorkspace)
    return null
  }

  const handleDelete = (targetId) => {
    if (!targetId || targetId === ROOT_ID) {
      return
    }

    const targetMeta = findNodeMeta(workspace, targetId)
    const nextWorkspace = deleteNode(workspace, targetId)
    const selectedPath = getNodePath(workspace, selectedNodeId) ?? []
    const isDeletingActiveSelection = selectedPath.includes(targetId)
    const fallbackId = targetMeta?.parent?.id ?? ROOT_ID
    const nextSelectedId = isDeletingActiveSelection ? fallbackId : selectedNodeId
    const nextExpandedState = {
      ...pruneExpandedState(nextWorkspace, tree.expandedState),
      [ROOT_ID]: true,
    }

    if (targetMeta?.parent?.id) {
      nextExpandedState[targetMeta.parent.id] = true
    }

    setWorkspace(nextWorkspace)
    syncTreeToWorkspace(nextWorkspace, nextSelectedId, nextExpandedState)
  }

  const handleSave = (fileId, content) => {
    if (!fileId) {
      return
    }

    setWorkspace((current) => updateFileContent(current, fileId, content))
  }

  const handleStartWorldSync = async () => {
    if (isWorldSyncLoading) {
      return
    }

    if (worldSyncButtonState.disabled) {
      setProjectStatus({
        kind: 'error',
        message: 'Write or change some story content before starting a world sync.',
      })
      return
    }

    setProjectStatus(null)
    setIsWorldSyncLoading(true)

    try {
      const { diffText, eventsMd } = buildEventsIndexProposePayload(workspace, syncState, worldModel)
      const response = await proposeEventsIndex({
        diff_text: diffText,
        events_md: eventsMd,
        history: [],
      })
      setProjectStatus({
        kind: 'success',
        message: buildWorldSyncSuccessMessage(response?.proposal),
      })
    } catch (error) {
      setProjectStatus({
        kind: 'error',
        message: getWorldSyncErrorMessage(error),
      })
    } finally {
      setIsWorldSyncLoading(false)
    }
  }

  const handleDialogSubmit = (event) => {
    event.preventDefault()

    let nextError = null

    if (dialogAction === 'newFile') {
      nextError = handleCreateFile(dialogDraftName, dialogTargetId ?? ROOT_ID)
    }

    if (dialogAction === 'newFolder') {
      nextError = handleCreateFolder(dialogDraftName, dialogTargetId ?? ROOT_ID)
    }

    if (dialogAction === 'rename') {
      nextError = handleRename(dialogDraftName, dialogTargetId)
    }

    if (nextError) {
      setDialogError(nextError)
      return
    }

    closeDialog()
  }

  const handleDeleteConfirm = () => {
    handleDelete(dialogTargetId)
    closeDialog()
  }

  const handleNewProject = () => {
    const nextWorkspace = createInitialTree()

    setWorkspace(nextWorkspace)
    syncTreeToWorkspace(nextWorkspace, DEFAULT_FILE_ID, DEFAULT_EXPANDED_STATE)
    setProjectStatus({
      kind: 'success',
      message: 'Started a new project. The browser copy has been reset to the starter workspace.',
    })
  }

  const handleNewProjectConfirm = () => {
    handleNewProject()
    closeDialog()
  }

  const handleDownloadProject = async () => {
    if (projectAction) {
      return
    }

    setProjectAction('download')

    try {
      await exportProjectZip({
        workspace,
        selectedNodeId,
        worldModel,
        syncState,
      })

      setProjectStatus({
        kind: 'success',
        message: 'Downloaded a zip snapshot of the current workspace.',
      })
    } catch (error) {
      if (!isProjectArchiveAbortError(error)) {
        console.error(error)
        setProjectStatus({
          kind: 'error',
          message: error.message || 'Failed to download project.',
        })
      }
    } finally {
      setProjectAction(null)
    }
  }

  const handleUploadProject = async () => {
    if (projectAction) {
      return
    }

    setProjectAction('upload')

    try {
      const nextProject = await importProjectZip()

      setWorkspace(nextProject.workspace)
      setWorldModel(nextProject.worldModel)
      setSyncState(nextProject.syncState)
      syncTreeToWorkspace(nextProject.workspace, nextProject.selectedNodeId)
      setProjectStatus({
        kind: 'success',
        message: 'Uploaded the project archive and restored it into browser storage.',
      })
    } catch (error) {
      if (!isProjectArchiveAbortError(error)) {
        console.error(error)
        setProjectStatus({
          kind: 'error',
          message: error.message || 'Failed to upload project.',
        })
      }
    } finally {
      setProjectAction(null)
    }
  }

  return (
    <Box className="app-frame">
      <Flex className="app-shell">
        <Box className="sidebar-shell">
          <Sidebar
            createTargetId={sidebarCreateTargetId}
            onStartSync={handleStartWorldSync}
            onDownloadProject={handleDownloadProject}
            onOpenDialog={openDialog}
            onUploadProject={handleUploadProject}
            projectAction={projectAction}
            syncButtonDisabled={worldSyncButtonState.disabled}
            syncButtonLabel={worldSyncButtonState.label}
            tree={tree}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            worldModel={worldModel}
            syncState={syncState}
            worldSelection={worldSelection}
            onWorldSelect={handleWorldSelect}
            workspace={workspace}
          />
        </Box>

        <Box className="main-shell">
          <Topbar
            projectAction={projectAction}
            projectStatus={projectStatus}
            selectedPathNames={selectedPathNames}
            selectionMode={selectionMode}
            selectedNode={selectedNode}
            syncBadgeProps={syncBadgeProps}
            targetFolder={targetFolder}
            onOpenDialog={openDialog}
          />

          {viewMode === 'write' ? (
            <EditorPane
              selectionMode={selectionMode}
              selectedNode={selectedNode}
              selectedFile={selectedFile}
              onOpenDialog={openDialog}
              onSave={handleSave}
              onSelectNode={tree.select}
            />
          ) : (
            <WorldPanel
              worldModel={worldModel}
              syncState={syncState}
              worldSelection={worldSelection}
            />
          )}
        </Box>
      </Flex>

      <WorkspaceDialog
        action={dialogAction}
        deleteStats={dialogDeleteStats}
        draftName={dialogDraftName}
        error={dialogError}
        targetNode={dialogTargetNode}
        onClose={closeDialog}
        onConfirmDelete={handleDeleteConfirm}
        onConfirmNewProject={handleNewProjectConfirm}
        onDraftNameChange={handleDialogDraftNameChange}
        onSubmit={handleDialogSubmit}
      />
    </Box>
  )
}

export default App
