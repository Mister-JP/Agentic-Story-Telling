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
  proposeElementDetail,
  proposeElementsIndex,
  proposeEventDetail,
  proposeEventsIndex,
} from './utils/agentApi.js'
import {
  applyCompletedSyncReviewResult,
  beginIndexReviewSession,
  buildCurrentDetailMarkdown,
  buildElementDetailTargets,
  buildEventDetailTargets,
  createDetailReviewSession,
  createElementsIndexReviewSession,
  createIndexReviewSession,
  createReviewHistoryEntry,
  createReviewIterationState,
  getCurrentDetailTarget,
  getReviewAttemptNumber,
  updateDiffPreviewSelection,
} from './utils/syncReview.js'
import { REVIEW_STEPS, isDetailReviewStep, isIndexReviewStep } from './utils/reviewSteps.js'
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
  checkSyncBeforeDownload,
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
  const [dialogChangedFileCount, setDialogChangedFileCount] = useState(0)
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
    setDialogChangedFileCount(0)
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

  const openDownloadWarningDialog = useCallback((changedFileCount) => {
    setDialogAction('downloadWarning')
    setDialogTargetId(null)
    setDialogDraftName('')
    setDialogChangedFileCount(changedFileCount)
    setDialogError('')
  }, [])

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

  const requestIndexProposalForStep = useCallback(async ({ elementsMd, eventsMd, diffText, history, step }) => {
    if (step === REVIEW_STEPS.ELEMENTS_INDEX) {
      return proposeElementsIndex({
        diff_text: diffText,
        elements_md: elementsMd,
        history,
      })
    }

    return proposeEventsIndex({
      diff_text: diffText,
      events_md: eventsMd,
      history,
    })
  }, [])

  const requestDetailProposalForStep = useCallback(async ({
    currentDetailMd,
    diffText,
    elementsMd,
    eventsMd,
    history,
    step,
    target,
  }) => {
    if (step === REVIEW_STEPS.ELEMENT_DETAILS) {
      return proposeElementDetail({
        current_detail_md: currentDetailMd,
        diff_text: diffText,
        elements_md: elementsMd,
        events_md: eventsMd,
        history,
        target,
      })
    }

    return proposeEventDetail({
      current_detail_md: currentDetailMd,
      diff_text: diffText,
      events_md: eventsMd,
      history,
      target,
    })
  }, [])

  const requestReviewProposalForSession = useCallback(async (reviewSessionCandidate, historyOverride = reviewSessionCandidate.history) => {
    // Keep retries/request-changes stage-agnostic: index and detail steps route through one entrypoint.
    if (isIndexReviewStep(reviewSessionCandidate.step)) {
      return requestIndexProposalForStep({
        diffText: reviewSessionCandidate.diffText,
        elementsMd: reviewSessionCandidate.elementsMd,
        eventsMd: reviewSessionCandidate.eventsMd,
        history: historyOverride,
        step: reviewSessionCandidate.step,
      })
    }

    const currentTarget = getCurrentDetailTarget(reviewSessionCandidate)
    if (!currentTarget) {
      throw new Error('No detail target is available for the current review step.')
    }

    return requestDetailProposalForStep({
      currentDetailMd: buildCurrentDetailMarkdown(reviewSessionCandidate, worldModelRef.current),
      diffText: reviewSessionCandidate.diffText,
      elementsMd: reviewSessionCandidate.elementsMd,
      eventsMd: reviewSessionCandidate.eventsMd,
      history: historyOverride,
      step: reviewSessionCandidate.step,
      target: currentTarget,
    })
  }, [requestDetailProposalForStep, requestIndexProposalForStep])

  const applyProposalResponseToSession = useCallback((sessionBase, response, history) => {
    if (!sessionBase) {
      return sessionBase
    }

    const isDetailStep = isDetailReviewStep(sessionBase.step)

    return {
      ...sessionBase,
      attemptNumber: getReviewAttemptNumber(history, sessionBase.historyBaseCount),
      currentPreviewDiff: isDetailStep ? (response.preview_diff ?? '') : '',
      currentProposal: response.proposal,
      currentUpdatedDetailMd: isDetailStep ? (response.updated_detail_md ?? '') : '',
      error: null,
      history,
      isLoading: false,
      loadingAction: null,
    }
  }, [])

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

  const buildNextDetailReviewSession = useCallback((currentSession, nextDetailResults) => {
    const nextDetailIndex = currentSession.currentDetailIndex + 1

    if (nextDetailIndex < currentSession.detailTargets.length) {
      return {
        type: 'continue',
        session: {
          ...currentSession,
          ...createReviewIterationState(),
          currentDetailIndex: nextDetailIndex,
          detailResults: nextDetailResults,
        },
      }
    }

    if (
      currentSession.step === REVIEW_STEPS.ELEMENT_DETAILS
      && (currentSession.eventDetailTargets?.length ?? 0) > 0
    ) {
      return {
        type: 'transition',
        session: createDetailReviewSession(
          {
            ...currentSession,
            // Carry accumulated staged results into the next detail phase before resetting per-phase history.
            detailResults: nextDetailResults,
          },
          {
            detailTargets: currentSession.eventDetailTargets,
            step: REVIEW_STEPS.EVENT_DETAILS,
          },
        ),
      }
    }

    return {
      type: 'complete',
      session: {
        ...currentSession,
        detailResults: nextDetailResults,
      },
    }
  }, [])

  const exitReviewMode = useCallback(() => {
    reviewGenerationRef.current += 1
    reviewActionLockRef.current = null
    setIsWorldSyncLoading(false)
    setReviewSession(null)
    setViewMode('world')
  }, [])

  const showCompletedReviewScreen = useCallback((completedSession, appliedReview) => {
    setWorldModel(appliedReview.worldModel)
    setSyncState(appliedReview.syncState)
    setProjectStatus({
      kind: 'success',
      message: 'World model updated from the review.',
    })
    setReviewSession({
      ...completedSession,
      completedSyncAt: appliedReview.syncState.lastSyncedAt,
      currentPreviewDiff: '',
      currentProposal: null,
      currentUpdatedDetailMd: '',
      error: null,
      isLoading: false,
      loadingAction: null,
      step: REVIEW_STEPS.COMPLETE,
    })
  }, [setSyncState, setWorldModel])

  const handleDiscardReview = useCallback(() => {
    exitReviewMode()
  }, [exitReviewMode])

  const handleCompleteReview = useCallback(() => {
    exitReviewMode()
  }, [exitReviewMode])

  const handleRequestDiscardReview = useCallback(() => {
    const activeReviewSession = reviewSessionRef.current
    if (!activeReviewSession || activeReviewSession.isLoading) {
      return
    }

    setDialogAction('cancelReview')
    setDialogTargetId(null)
    setDialogDraftName('')
    setDialogError('')
  }, [])

  const handleConfirmCancelReview = useCallback(() => {
    closeDialog()
    handleDiscardReview()
  }, [handleDiscardReview])

  const handleRetryReview = useCallback(async () => {
    const activeReviewSession = reviewSessionRef.current
    const actionName = 'retry-review-proposal'

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
      const response = await requestReviewProposalForSession(activeReviewSession)

      if (reviewGenerationRef.current !== reviewGeneration) {
        return
      }

      setReviewSession(applyProposalResponseToSession(activeReviewSession, response, activeReviewSession.history ?? []))
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
  }, [applyProposalResponseToSession, releaseReviewAction, requestReviewProposalForSession, tryLockReviewAction])

  const handleStartWorldSync = useCallback(() => {
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
    reviewGenerationRef.current += 1
    setReviewSession(createIndexReviewSession(workspace, syncState, worldModel))
    setViewMode('review')
    setIsWorldSyncLoading(false)
    releaseReviewAction(actionName)
  }, [
    isWorldSyncLoading,
    releaseReviewAction,
    syncState,
    tryLockReviewAction,
    worldModel,
    workspace,
    worldSyncButtonState.disabled,
  ])

  const handleReviewSelectionChange = useCallback((nextSelectedFileIds) => {
    setReviewSession((current) => {
      if (!current || current.step !== REVIEW_STEPS.DIFF_PREVIEW) {
        return current
      }

      return updateDiffPreviewSelection(current, nextSelectedFileIds)
    })
  }, [])

  const handleContinueWorldSync = useCallback(async () => {
    const activeReviewSession = reviewSessionRef.current
    const actionName = 'continue-world-sync'

    if (
      !activeReviewSession
      || activeReviewSession.step !== REVIEW_STEPS.DIFF_PREVIEW
      || activeReviewSession.selectedFileIds.length === 0
      || !tryLockReviewAction(actionName)
    ) {
      return
    }

    const reviewGeneration = reviewGenerationRef.current + 1
    reviewGenerationRef.current = reviewGeneration
    const nextReviewSession = beginIndexReviewSession(activeReviewSession)
    setReviewSession(nextReviewSession)

    try {
      const response = await requestReviewProposalForSession(nextReviewSession, [])

      if (reviewGenerationRef.current !== reviewGeneration) {
        return
      }

      setReviewSession(applyProposalResponseToSession(nextReviewSession, response, []))
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
  }, [
    applyProposalResponseToSession,
    releaseReviewAction,
    requestReviewProposalForSession,
    tryLockReviewAction,
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
      const response = await requestReviewProposalForSession(activeReviewSession, nextHistory)

      if (reviewGenerationRef.current !== reviewGeneration) {
        return
      }

      setReviewSession(applyProposalResponseToSession(activeReviewSession, response, nextHistory))
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
  }, [applyProposalResponseToSession, releaseReviewAction, requestReviewProposalForSession, tryLockReviewAction])

  const handleApproveReview = useCallback(async () => {
    const activeReviewSession = reviewSessionRef.current
    const actionName = 'approve-review'

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
      if (activeReviewSession.step === REVIEW_STEPS.ELEMENTS_INDEX) {
        const applyResponse = await applyElementsIndex({
          elements_md: activeReviewSession.elementsMd,
          proposal: activeReviewSession.currentProposal,
        })

        if (reviewGenerationRef.current !== reviewGeneration) {
          return
        }

        const elementDetailTargets = buildElementDetailTargets(
          activeReviewSession.elementsMd,
          applyResponse,
          activeReviewSession.currentProposal,
        )

        const baseSession = {
          ...activeReviewSession,
          detailResults: activeReviewSession.detailResults ?? {},
          elementDetailTargets,
          elementsMd: applyResponse.elements_md,
          updatedElementsState: applyResponse,
        }

        const nextStep = elementDetailTargets.length > 0
          ? REVIEW_STEPS.ELEMENT_DETAILS
          : REVIEW_STEPS.EVENT_DETAILS
        const nextTargets = nextStep === REVIEW_STEPS.ELEMENT_DETAILS
          ? elementDetailTargets
          : (activeReviewSession.eventDetailTargets ?? [])

        if (nextTargets.length === 0) {
          const appliedReview = applyCompletedSyncReviewResult({
            currentSyncState: syncStateRef.current,
            currentWorldModel: worldModelRef.current,
            reviewSession: baseSession,
            workspace: workspaceRef.current,
          })

          showCompletedReviewScreen(baseSession, appliedReview)
          return
        }

        const nextReviewSession = createDetailReviewSession(baseSession, {
          detailTargets: nextTargets,
          step: nextStep,
          updatedElementsState: applyResponse,
        })
        setReviewSession(nextReviewSession)

        const response = await requestReviewProposalForSession(nextReviewSession)

        if (reviewGenerationRef.current !== reviewGeneration) {
          return
        }

        setReviewSession(applyProposalResponseToSession(nextReviewSession, response, nextReviewSession.history ?? []))
        return
      }

      if (activeReviewSession.step === REVIEW_STEPS.EVENTS_INDEX) {
        const eventsApplyResponse = await applyEventsIndex({
          events_md: activeReviewSession.eventsMd,
          proposal: activeReviewSession.currentProposal,
        })

        if (reviewGenerationRef.current !== reviewGeneration) {
          return
        }

        const eventDetailTargets = buildEventDetailTargets(
          activeReviewSession.eventsMd,
          eventsApplyResponse,
          activeReviewSession.currentProposal,
        )

        const nextReviewSession = createElementsIndexReviewSession(
          activeReviewSession,
          eventsApplyResponse,
          eventDetailTargets,
        )
        setReviewSession(nextReviewSession)

        const response = await requestReviewProposalForSession(nextReviewSession)

        if (reviewGenerationRef.current !== reviewGeneration) {
          return
        }

        setReviewSession(applyProposalResponseToSession(nextReviewSession, response, nextReviewSession.history ?? []))
        return
      }

      const currentTarget = getCurrentDetailTarget(activeReviewSession)
      if (!currentTarget) {
        return
      }

      const nextDetailResults = {
        ...(activeReviewSession.detailResults ?? {}),
        [currentTarget.uuid]: {
          action: 'approved',
          targetType: activeReviewSession.step === REVIEW_STEPS.ELEMENT_DETAILS ? 'element' : 'event',
          updatedMd: activeReviewSession.currentUpdatedDetailMd,
        },
      }
      const nextDetailReview = buildNextDetailReviewSession(activeReviewSession, nextDetailResults)

      if (nextDetailReview.type === 'complete') {
        const appliedReview = applyCompletedSyncReviewResult({
          currentSyncState: syncStateRef.current,
          currentWorldModel: worldModelRef.current,
          reviewSession: nextDetailReview.session,
          workspace: workspaceRef.current,
        })

        if (reviewGenerationRef.current !== reviewGeneration) {
          return
        }

        showCompletedReviewScreen(nextDetailReview.session, appliedReview)
        return
      }

      setReviewSession(nextDetailReview.session)
      const response = await requestReviewProposalForSession(nextDetailReview.session)

      if (reviewGenerationRef.current !== reviewGeneration) {
        return
      }

      setReviewSession(
        applyProposalResponseToSession(
          nextDetailReview.session,
          response,
          nextDetailReview.session.history ?? [],
        ),
      )
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
  }, [
    applyProposalResponseToSession,
    buildNextDetailReviewSession,
    releaseReviewAction,
    requestReviewProposalForSession,
    showCompletedReviewScreen,
    tryLockReviewAction,
  ])

  const handleSkipDetailReview = useCallback(async () => {
    const activeReviewSession = reviewSessionRef.current
    const actionName = 'skip-detail-review'

    if (!activeReviewSession?.currentProposal || !isDetailReviewStep(activeReviewSession.step) || !tryLockReviewAction(actionName)) {
      return
    }

    const currentTarget = getCurrentDetailTarget(activeReviewSession)
    if (!currentTarget) {
      releaseReviewAction(actionName)
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
        loadingAction: 'skip',
      }
    })

    const reviewGeneration = reviewGenerationRef.current + 1
    reviewGenerationRef.current = reviewGeneration

    try {
      const nextDetailResults = {
        ...(activeReviewSession.detailResults ?? {}),
        [currentTarget.uuid]: {
          action: 'skipped',
          targetType: activeReviewSession.step === REVIEW_STEPS.ELEMENT_DETAILS ? 'element' : 'event',
        },
      }
      const nextDetailReview = buildNextDetailReviewSession(activeReviewSession, nextDetailResults)

      if (nextDetailReview.type === 'complete') {
        const appliedReview = applyCompletedSyncReviewResult({
          currentSyncState: syncStateRef.current,
          currentWorldModel: worldModelRef.current,
          reviewSession: nextDetailReview.session,
          workspace: workspaceRef.current,
        })

        if (reviewGenerationRef.current !== reviewGeneration) {
          return
        }

        showCompletedReviewScreen(nextDetailReview.session, appliedReview)
        return
      }

      setReviewSession(nextDetailReview.session)
      const response = await requestReviewProposalForSession(nextDetailReview.session)

      if (reviewGenerationRef.current !== reviewGeneration) {
        return
      }

      setReviewSession(
        applyProposalResponseToSession(
          nextDetailReview.session,
          response,
          nextDetailReview.session.history ?? [],
        ),
      )
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
  }, [
    applyProposalResponseToSession,
    buildNextDetailReviewSession,
    releaseReviewAction,
    requestReviewProposalForSession,
    showCompletedReviewScreen,
    tryLockReviewAction,
  ])

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

  const performProjectDownload = useCallback(async () => {
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
  }, [projectAction, selectedNodeId, syncState, workspace, worldModel])

  const handleConfirmDownloadAnyway = async () => {
    closeDialog()
    await performProjectDownload()
  }

  const handleConfirmSyncFirst = () => {
    closeDialog()
    setViewMode('world')
    handleStartWorldSync()
  }

  const handleDownloadProject = async () => {
    if (projectAction) {
      return
    }

    const downloadCheck = checkSyncBeforeDownload(syncState, workspace)

    if (downloadCheck.needsWarning) {
      openDownloadWarningDialog(downloadCheck.changedFileCount)
      return
    }

    await performProjectDownload()
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
            onDiscardReview={handleRequestDiscardReview}
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
              onApprove={handleApproveReview}
              onComplete={handleCompleteReview}
              onContinue={handleContinueWorldSync}
              onRequestChanges={handleRequestReviewChanges}
              onSelectionChange={handleReviewSelectionChange}
              onRetry={handleRetryReview}
              onSkip={handleSkipDetailReview}
              reviewSession={reviewSession}
            />
          ) : null}
        </Box>
      </Flex>

      <WorkspaceDialog
        action={dialogAction}
        deleteStats={dialogDeleteStats}
        downloadWarning={{
          changedFileCount: dialogChangedFileCount,
        }}
        draftName={dialogDraftName}
        error={dialogError}
        targetNode={dialogTargetNode}
        onClose={closeDialog}
        onConfirmCancelReview={handleConfirmCancelReview}
        onConfirmDownloadAnyway={handleConfirmDownloadAnyway}
        onConfirmDelete={handleDeleteConfirm}
        onConfirmNewProject={handleNewProjectConfirm}
        onConfirmSyncFirst={handleConfirmSyncFirst}
        onDraftNameChange={handleDialogDraftNameChange}
        onSubmit={handleDialogSubmit}
      />
    </Box>
  )
}

export default App
