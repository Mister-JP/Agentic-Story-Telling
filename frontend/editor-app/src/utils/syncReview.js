import { createContentSnapshot, updateSnapshotAfterSync } from './diffEngine.js'
import { DEFAULT_ELEMENTS_INDEX_PREAMBLE, ELEMENT_FIELD_NAMES } from './elementsIndexFields.js'
import { DEFAULT_EVENTS_INDEX_PREAMBLE, EVENT_FIELD_NAMES } from './eventsIndexFields.js'
import { buildWorldSyncDraft } from './worldSync.js'
import { createEmptyWorldModel, parseIndexMarkdown } from './worldModel.js'

function buildInitialReviewState(overrides = {}) {
  return {
    attemptNumber: 1,
    currentProposal: null,
    error: null,
    history: [],
    historyBaseCount: 0,
    isLoading: true,
    loadingAction: 'proposal',
    ...overrides,
  }
}

export function getReviewAttemptNumber(history, historyBaseCount = 0) {
  return Math.max((history?.length ?? 0) - historyBaseCount, 0) + 1
}

function buildFilteredDetails(existingDetails, entries) {
  const allowedUuids = new Set(entries.map((entry) => entry.uuid))
  const nextDetails = {}

  for (const [detailUuid, detailMarkdown] of Object.entries(existingDetails ?? {})) {
    if (!allowedUuids.has(detailUuid)) {
      continue
    }

    nextDetails[detailUuid] = detailMarkdown
  }

  return nextDetails
}

function buildBaseWorldModel(currentWorldModel, parsedElements, parsedEvents) {
  if (currentWorldModel) {
    return currentWorldModel
  }

  return createEmptyWorldModel(
    parsedElements?.indexPreamble || DEFAULT_ELEMENTS_INDEX_PREAMBLE,
    parsedEvents?.indexPreamble || DEFAULT_EVENTS_INDEX_PREAMBLE,
  )
}

function buildNextEventsWorldModel(currentWorldModel, eventsApplyResponse) {
  const parsedEvents = parseIndexMarkdown(eventsApplyResponse?.events_md ?? '', EVENT_FIELD_NAMES)
  const baseWorldModel = buildBaseWorldModel(currentWorldModel, null, parsedEvents)
  const nextEventsPreamble =
    parsedEvents.indexPreamble ||
    baseWorldModel.events.indexPreamble ||
    DEFAULT_EVENTS_INDEX_PREAMBLE
  const preservedDetails = buildFilteredDetails(baseWorldModel.events.details, parsedEvents.entries)

  return {
    ...baseWorldModel,
    events: {
      ...baseWorldModel.events,
      indexPreamble: nextEventsPreamble,
      entries: parsedEvents.entries,
      details: {
        ...preservedDetails,
        ...(eventsApplyResponse?.detail_files ?? {}),
      },
    },
  }
}

function buildNextElementsWorldModel(currentWorldModel, elementsApplyResponse) {
  const parsedElements = parseIndexMarkdown(elementsApplyResponse?.elements_md ?? '', ELEMENT_FIELD_NAMES)
  const baseWorldModel = buildBaseWorldModel(currentWorldModel, parsedElements, null)
  const nextElementsPreamble =
    parsedElements.indexPreamble ||
    baseWorldModel.elements.indexPreamble ||
    DEFAULT_ELEMENTS_INDEX_PREAMBLE
  const preservedDetails = buildFilteredDetails(baseWorldModel.elements.details, parsedElements.entries)

  return {
    ...baseWorldModel,
    elements: {
      ...baseWorldModel.elements,
      indexPreamble: nextElementsPreamble,
      entries: parsedElements.entries,
      details: {
        ...preservedDetails,
        ...(elementsApplyResponse?.detail_files ?? {}),
      },
    },
  }
}

export function createIndexReviewSession(workspace, syncState, worldModel) {
  const worldSyncDraft = buildWorldSyncDraft(workspace, syncState, worldModel)

  return {
    ...buildInitialReviewState(),
    changedFiles: worldSyncDraft.changedFiles,
    diffText: worldSyncDraft.diffText,
    elementsMd: worldSyncDraft.elementsMd,
    eventsMd: worldSyncDraft.eventsMd,
    selectedFileIds: worldSyncDraft.selectedFileIds,
    step: 'events-index',
    updatedElementsState: null,
    updatedEventsState: null,
  }
}

export function createReviewHistoryEntry(proposal, reviewerFeedback, attemptNumber) {
  return {
    attempt_number: attemptNumber,
    previous_output: JSON.stringify(proposal, null, 2),
    reviewer_feedback: reviewerFeedback.trim(),
  }
}

export function createElementsIndexReviewSession(currentSession, eventsApplyResponse) {
  const nextHistory = currentSession.history ?? []

  return {
    ...currentSession,
    ...buildInitialReviewState({
      history: nextHistory,
      historyBaseCount: nextHistory.length,
    }),
    step: 'elements-index',
    updatedEventsState: eventsApplyResponse,
  }
}

export function applyStagedIndexReviewResult({
  currentSyncState,
  currentWorldModel,
  elementsApplyResponse,
  eventsApplyResponse,
  selectedFileIds,
  workspace,
}) {
  const worldModelWithEvents = buildNextEventsWorldModel(currentWorldModel, eventsApplyResponse)
  const nextWorldModel = buildNextElementsWorldModel(worldModelWithEvents, elementsApplyResponse)
  const currentSnapshot = createContentSnapshot(workspace)
  const previousSnapshot = currentSyncState?.lastSyncedSnapshot ?? {}
  const lastSyncedSnapshot = updateSnapshotAfterSync(
    previousSnapshot,
    currentSnapshot,
    selectedFileIds,
  )

  return {
    syncState: {
      lastSyncedAt: new Date().toISOString(),
      lastSyncedSnapshot,
      status: 'synced',
    },
    worldModel: nextWorldModel,
  }
}
