import { Box, Flex, useTree } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EditorPane from './components/EditorPane.jsx'
import Sidebar from './components/Sidebar.jsx'
import SyncReviewPanel from './components/SyncReviewPanel.jsx'
import Topbar from './components/Topbar.jsx'
import WorldPanel from './components/WorldPanel.jsx'
import {
  ApiClientError,
  applyElementsIndex,
  applyEventsIndex,
  proposeElementsIndex,
  proposeEventsIndex,
} from './utils/agentApi.js'
import {
  applyStagedIndexReviewResult,
  createElementsIndexReviewSession,
  createIndexReviewSession,
  createReviewHistoryEntry,
  getReviewAttemptNumber,
} from './utils/syncReview.js'
import { getSyncBadgeProps } from './utils/syncSelectors.js'
import { getWorldSyncButtonState } from './utils/worldSync.js'
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
  const [reviewSession, setReviewSession] = useState(null)
  const reviewGenerationRef = useRef(0)
  const reviewActionLockRef = useRef(null)
  const workspaceRef = useRef(workspace)
  const worldModelRef = useRef(worldModel)
  const syncStateRef = useRef(syncState)
  const reviewSessionRef = useRef(reviewSession)

  workspaceRef.current = workspace
  worldModelRef.current = worldModel
  syncStateRef.current = syncState
  reviewSessionRef.current = reviewSession

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

  const requestEventsIndexProposal = useCallback(async ({ diffText, eventsMd, history }) => {
    return proposeEventsIndex({
      diff_text: diffText,
      events_md: eventsMd,
      history,
    })
  }, [])

  const requestElementsIndexProposal = useCallback(async ({ diffText, elementsMd, history }) => {
    return proposeElementsIndex({
      diff_text: diffText,
      elements_md: elementsMd,
      history,
    })
  }, [])

  const requestIndexProposalForStep = useCallback(async ({ elementsMd, eventsMd, diffText, history, step }) => {
    if (step === 'elements-index') {
      return requestElementsIndexProposal({
        diffText,
        elementsMd,
        history,
      })
    }

    return requestEventsIndexProposal({
      diffText,
      eventsMd,
      history,
    })
  }, [requestElementsIndexProposal, requestEventsIndexProposal])

  const tryLockReviewAction = useCallback((actionName) => {
    if (reviewActionLockRef.current !== null) {
      return false
    }

    reviewActionLockRef.current = actionName
    return true
  }, [])

  const releaseReviewAction = useCallback((actionName) => {
    if (reviewActionLockRef.current === actionName) {
      reviewActionLockRef.current = null
    }
  }, [])

  const handleDiscardReview = useCallback(() => {
    reviewGenerationRef.current += 1
    reviewActionLockRef.current = null
    setIsWorldSyncLoading(false)
    setReviewSession(null)
    setViewMode('world')
  }, [])

  const handleRetryIndexProposal = useCallback(async () => {
    const activeReviewSession = reviewSessionRef.current
    const actionName = 'retry-index-proposal'

    if (!activeReviewSession || !tryLockReviewAction(actionName)) {
      return
    }

    const reviewGeneration = reviewGenerationRef.current + 1
    reviewGenerationRef.current = reviewGeneration

    setReviewSession((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        error: null,
        isLoading: true,
        loadingAction: 'proposal',
      }
    })

    try {
      const response = await requestIndexProposalForStep({
        diffText: activeReviewSession.diffText,
        elementsMd: activeReviewSession.elementsMd,
        eventsMd: activeReviewSession.eventsMd,
        history: activeReviewSession.history,
        step: activeReviewSession.step,
      })

      if (reviewGenerationRef.current !== reviewGeneration) {
        return
      }

      setReviewSession((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          attemptNumber: getReviewAttemptNumber(current.history, current.historyBaseCount),
          currentProposal: response.proposal,
          error: null,
          isLoading: false,
          loadingAction: null,
        }
      })
    } catch (error) {
      if (reviewGenerationRef.current !== reviewGeneration) {
        return
      }

      setReviewSession((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          error: getWorldSyncErrorMessage(error),
          isLoading: false,
          loadingAction: null,
        }
      })
    } finally {
      releaseReviewAction(actionName)
    }
  }, [releaseReviewAction, requestIndexProposalForStep, tryLockReviewAction])

  const handleStartWorldSync = useCallback(async () => {
    const actionName = 'start-world-sync'

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

    if (!tryLockReviewAction(actionName)) {
      return
    }

    setProjectStatus(null)
    setIsWorldSyncLoading(true)

    const reviewGeneration = reviewGenerationRef.current + 1
    reviewGenerationRef.current = reviewGeneration
    const nextReviewSession = createIndexReviewSession(workspace, syncState, worldModel)
    setReviewSession(nextReviewSession)
    setViewMode('review')

    try {
      const response = await requestIndexProposalForStep({
        diffText: nextReviewSession.diffText,
        elementsMd: nextReviewSession.elementsMd,
        eventsMd: nextReviewSession.eventsMd,
        history: [],
        step: nextReviewSession.step,
      })

      if (reviewGenerationRef.current !== reviewGeneration) {
        return
      }

      setReviewSession((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          attemptNumber: getReviewAttemptNumber(current.history, current.historyBaseCount),
          currentProposal: response.proposal,
          error: null,
          isLoading: false,
          loadingAction: null,
        }
      })
    } catch (error) {
      if (reviewGenerationRef.current !== reviewGeneration) {
        return
      }

      setReviewSession((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          error: getWorldSyncErrorMessage(error),
          isLoading: false,
          loadingAction: null,
        }
      })
    } finally {
      if (reviewGenerationRef.current === reviewGeneration) {
        setIsWorldSyncLoading(false)
      }
      releaseReviewAction(actionName)
    }
  }, [
    isWorldSyncLoading,
    releaseReviewAction,
    requestIndexProposalForStep,
    syncState,
    tryLockReviewAction,
    worldModel,
    workspace,
    worldSyncButtonState.disabled,
  ])

  const handleRequestReviewChanges = useCallback(async (reviewerFeedback) => {
    const activeReviewSession = reviewSessionRef.current
    const actionName = 'request-review-changes'

    if (!activeReviewSession?.currentProposal || !tryLockReviewAction(actionName)) {
      return
    }

    const nextHistory = [
      ...activeReviewSession.history,
      createReviewHistoryEntry(
        activeReviewSession.currentProposal,
        reviewerFeedback,
        activeReviewSession.attemptNumber,
      ),
    ]

    setReviewSession((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        error: null,
        isLoading: true,
        loadingAction: 'request-changes',
      }
    })

    const reviewGeneration = reviewGenerationRef.current + 1
    reviewGenerationRef.current = reviewGeneration

    try {
      const response = await requestIndexProposalForStep({
        diffText: activeReviewSession.diffText,
        elementsMd: activeReviewSession.elementsMd,
        eventsMd: activeReviewSession.eventsMd,
        history: nextHistory,
        step: activeReviewSession.step,
      })

      if (reviewGenerationRef.current !== reviewGeneration) {
        return
      }

      setReviewSession((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          attemptNumber: getReviewAttemptNumber(nextHistory, current.historyBaseCount),
          currentProposal: response.proposal,
          error: null,
          history: nextHistory,
          isLoading: false,
          loadingAction: null,
        }
      })
    } catch (error) {
      if (reviewGenerationRef.current !== reviewGeneration) {
        return
      }

      setReviewSession((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          error: getWorldSyncErrorMessage(error),
          isLoading: false,
          loadingAction: null,
        }
      })
    } finally {
      releaseReviewAction(actionName)
    }
  }, [releaseReviewAction, requestIndexProposalForStep, tryLockReviewAction])

  const handleApproveIndexReview = useCallback(async () => {
    const activeReviewSession = reviewSessionRef.current
    const actionName = 'approve-index-review'

    if (!activeReviewSession?.currentProposal || !tryLockReviewAction(actionName)) {
      return
    }

    setReviewSession((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        error: null,
        isLoading: true,
        loadingAction: 'approve',
      }
    })

    const reviewGeneration = reviewGenerationRef.current + 1
    reviewGenerationRef.current = reviewGeneration

    try {
      if (activeReviewSession.step === 'elements-index') {
        const applyResponse = await applyElementsIndex({
          elements_md: activeReviewSession.elementsMd,
          proposal: activeReviewSession.currentProposal,
        })
        const appliedReview = applyStagedIndexReviewResult({
          currentSyncState: syncStateRef.current,
          currentWorldModel: worldModelRef.current,
          elementsApplyResponse: applyResponse,
          eventsApplyResponse: activeReviewSession.updatedEventsState,
          selectedFileIds: activeReviewSession.selectedFileIds,
          workspace: workspaceRef.current,
        })

        if (reviewGenerationRef.current !== reviewGeneration) {
          return
        }

        setWorldModel(appliedReview.worldModel)
        setSyncState(appliedReview.syncState)
        setProjectStatus({
          kind: 'success',
          message: 'World model updated from the review.',
        })
        setReviewSession(null)
        setViewMode('world')
        return
      }

      const eventsApplyResponse = await applyEventsIndex({
        events_md: activeReviewSession.eventsMd,
        proposal: activeReviewSession.currentProposal,
      })

      if (reviewGenerationRef.current !== reviewGeneration) {
        return
      }

      const nextReviewGeneration = reviewGenerationRef.current + 1
      reviewGenerationRef.current = nextReviewGeneration
      const nextReviewSession = createElementsIndexReviewSession(
        activeReviewSession,
        eventsApplyResponse,
      )
      setReviewSession(nextReviewSession)

      try {
        const response = await requestIndexProposalForStep({
          diffText: nextReviewSession.diffText,
          elementsMd: nextReviewSession.elementsMd,
          eventsMd: nextReviewSession.eventsMd,
          history: nextReviewSession.history,
          step: nextReviewSession.step,
        })

        if (reviewGenerationRef.current !== nextReviewGeneration) {
          return
        }

        setReviewSession((current) => {
          if (!current) {
            return current
          }

          return {
            ...current,
            attemptNumber: getReviewAttemptNumber(current.history, current.historyBaseCount),
            currentProposal: response.proposal,
            error: null,
            isLoading: false,
            loadingAction: null,
          }
        })
      } catch (error) {
        if (reviewGenerationRef.current !== nextReviewGeneration) {
          return
        }

        setReviewSession((current) => {
          if (!current) {
            return current
          }

          return {
            ...current,
            error: getWorldSyncErrorMessage(error),
            isLoading: false,
            loadingAction: null,
          }
        })
      }
    } catch (error) {
      if (reviewGenerationRef.current !== reviewGeneration) {
        return
      }

      setReviewSession((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          error: getWorldSyncErrorMessage(error),
          isLoading: false,
          loadingAction: null,
        }
      })
    } finally {
      releaseReviewAction(actionName)
    }
  }, [releaseReviewAction, requestIndexProposalForStep, setSyncState, setWorldModel, tryLockReviewAction])

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
            onDiscardReview={handleDiscardReview}
            onStartSync={handleStartWorldSync}
            onDownloadProject={handleDownloadProject}
            onOpenDialog={openDialog}
            onUploadProject={handleUploadProject}
            projectAction={projectAction}
            reviewSession={reviewSession}
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
            reviewStep={reviewSession?.step || undefined}
            selectedPathNames={selectedPathNames}
            selectionMode={selectionMode}
            selectedNode={selectedNode}
            syncBadgeProps={syncBadgeProps}
            onOpenDialog={openDialog}
            viewMode={viewMode}
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
          ) : null}

          {viewMode === 'world' ? (
            <WorldPanel
              worldModel={worldModel}
              syncState={syncState}
              worldSelection={worldSelection}
            />
          ) : null}

          {viewMode === 'review' ? (
            <SyncReviewPanel
              onApprove={handleApproveIndexReview}
              onRequestChanges={handleRequestReviewChanges}
              onRetry={handleRetryIndexProposal}
              reviewSession={reviewSession}
            />
          ) : null}
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
