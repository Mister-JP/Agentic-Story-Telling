import { createContentSnapshot, updateSnapshotAfterSync } from './diffEngine.js'
import { DEFAULT_EVENTS_INDEX_PREAMBLE, EVENT_FIELD_NAMES } from './eventsIndexFields.js'
import { buildWorldSyncDraft } from './worldSync.js'
import { createEmptyWorldModel, parseIndexMarkdown } from './worldModel.js'

function buildInitialReviewStep() {
  return 'events-index'
}

function buildFilteredEventDetails(existingDetails, eventEntries) {
  const allowedEventUuids = new Set(eventEntries.map((entry) => entry.uuid))
  const nextDetails = {}

  for (const [eventUuid, detailMarkdown] of Object.entries(existingDetails ?? {})) {
    if (!allowedEventUuids.has(eventUuid)) {
      continue
    }

    nextDetails[eventUuid] = detailMarkdown
  }

  return nextDetails
}

function buildBaseWorldModel(currentWorldModel, nextEventsPreamble) {
  if (currentWorldModel) {
    return currentWorldModel
  }

  return createEmptyWorldModel('', nextEventsPreamble || DEFAULT_EVENTS_INDEX_PREAMBLE)
}

function buildNextWorldModel(currentWorldModel, eventsApplyResponse) {
  const parsedEvents = parseIndexMarkdown(eventsApplyResponse.events_md, EVENT_FIELD_NAMES)
  const baseWorldModel = buildBaseWorldModel(currentWorldModel, parsedEvents.indexPreamble)
  const nextEventsPreamble =
    parsedEvents.indexPreamble ||
    baseWorldModel.events.indexPreamble ||
    DEFAULT_EVENTS_INDEX_PREAMBLE
  const preservedEventDetails = buildFilteredEventDetails(
    baseWorldModel.events.details,
    parsedEvents.entries,
  )

  return {
    ...baseWorldModel,
    events: {
      ...baseWorldModel.events,
      indexPreamble: nextEventsPreamble,
      entries: parsedEvents.entries,
      details: {
        ...preservedEventDetails,
        ...(eventsApplyResponse.detail_files ?? {}),
      },
    },
  }
}

export function createEventsIndexReviewSession(workspace, syncState, worldModel) {
  const worldSyncDraft = buildWorldSyncDraft(workspace, syncState, worldModel)

  return {
    attemptNumber: 0,
    changedFiles: worldSyncDraft.changedFiles,
    currentProposal: null,
    diffText: worldSyncDraft.diffText,
    error: null,
    eventsMd: worldSyncDraft.eventsMd,
    history: [],
    isLoading: true,
    loadingAction: 'proposal',
    selectedFileIds: worldSyncDraft.selectedFileIds,
    step: buildInitialReviewStep(),
  }
}

export function createReviewHistoryEntry(proposal, reviewerFeedback, attemptNumber) {
  return {
    attempt_number: attemptNumber,
    previous_output: JSON.stringify(proposal, null, 2),
    reviewer_feedback: reviewerFeedback.trim(),
  }
}

export function applyEventsIndexReviewResult({
  currentSyncState,
  currentWorldModel,
  eventsApplyResponse,
  selectedFileIds,
  workspace,
}) {
  const nextWorldModel = buildNextWorldModel(currentWorldModel, eventsApplyResponse)
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
