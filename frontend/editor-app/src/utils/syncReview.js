import { createContentSnapshot, updateSnapshotAfterSync } from './diffEngine.js'
import { DEFAULT_ELEMENTS_INDEX_PREAMBLE, ELEMENT_FIELD_NAMES } from './elementsIndexFields.js'
import { DEFAULT_EVENTS_INDEX_PREAMBLE, EVENT_FIELD_NAMES } from './eventsIndexFields.js'
import { REVIEW_STEPS } from './reviewSteps.js'
import { buildWorldSyncDraft, rebuildWorldSyncDiff } from './worldSync.js'
import { createEmptyWorldModel, parseIndexMarkdown } from './worldModel.js'

function buildInitialReviewState(overrides = {}) {
  return {
    attemptNumber: 1,
    currentDetailMd: '',
    currentProposal: null,
    currentPreviewDiff: '',
    currentUpdatedDetailMd: '',
    error: null,
    history: [],
    historyBaseCount: 0,
    isLoading: true,
    loadingAction: 'proposal',
    ...overrides,
  }
}

export function createReviewIterationState(overrides = {}) {
  return buildInitialReviewState(overrides)
}

export function getReviewAttemptNumber(history, historyBaseCount = 0) {
  return Math.max((history?.length ?? 0) - historyBaseCount, 0) + 1
}

function cloneDetails(details) {
  return { ...(details ?? {}) }
}

function normalizeLookup(value) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function splitInlineList(value, separator) {
  return (value ?? '')
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildEntrySignature(entry, fields) {
  return fields.map((field) => normalizeLookup(entry?.[field])).join('::')
}

function getAddedEntries(beforeEntries, afterEntries) {
  const beforeUuids = new Set(beforeEntries.map((entry) => entry.uuid))
  return afterEntries.filter((entry) => !beforeUuids.has(entry.uuid))
}

function buildMatchedEntryScore(candidateEntry, expectedFields) {
  let score = 0

  for (const [fieldName, expectedValue] of Object.entries(expectedFields)) {
    if (!expectedValue) {
      continue
    }

    if (normalizeLookup(candidateEntry?.[fieldName]) === normalizeLookup(expectedValue)) {
      score += 1
    }
  }

  return score
}

function resolveCreatedEventUuid(delta, addedEntries, claimedUuids) {
  const exactMatch = addedEntries.find((entry) => (
    !claimedUuids.has(entry.uuid)
      && buildEntrySignature(entry, ['summary', 'when', 'chapters']) === buildEntrySignature(delta, ['summary', 'when', 'chapters'])
  ))

  if (exactMatch) {
    return exactMatch.uuid
  }

  let bestEntry = null
  let bestScore = -1

  for (const entry of addedEntries) {
    if (claimedUuids.has(entry.uuid)) {
      continue
    }

    const score = buildMatchedEntryScore(entry, {
      summary: delta.summary,
      when: delta.when,
      chapters: delta.chapters,
    })

    if (score > bestScore) {
      bestEntry = entry
      bestScore = score
    }
  }

  return bestEntry?.uuid ?? null
}

function resolveCreatedElementUuid(decision, addedEntries, claimedUuids) {
  const decisionAliases = Array.isArray(decision.aliases) ? decision.aliases : []
  const decisionKeys = Array.isArray(decision.identification_keys) ? decision.identification_keys : []

  const exactMatch = addedEntries.find((entry) => {
    if (claimedUuids.has(entry.uuid)) {
      return false
    }

    const candidateAliases = new Set(splitInlineList(entry.aliases, ',').map(normalizeLookup))
    const candidateKeys = new Set(splitInlineList(entry.identification_keys, ';').map(normalizeLookup))
    const aliasesMatch = decisionAliases.every((alias) => candidateAliases.has(normalizeLookup(alias)))
    const keysMatch = decisionKeys.every((key) => candidateKeys.has(normalizeLookup(key)))

    return (
      normalizeLookup(entry.display_name) === normalizeLookup(decision.display_name)
      && normalizeLookup(entry.kind) === normalizeLookup(decision.kind)
      && aliasesMatch
      && keysMatch
    )
  })

  if (exactMatch) {
    return exactMatch.uuid
  }

  let bestEntry = null
  let bestScore = -1

  for (const entry of addedEntries) {
    if (claimedUuids.has(entry.uuid)) {
      continue
    }

    let score = buildMatchedEntryScore(entry, {
      display_name: decision.display_name,
      kind: decision.kind,
    })

    if (splitInlineList(entry.aliases, ',').some((alias) => normalizeLookup(alias) === normalizeLookup(decision.display_name))) {
      score += 1
    }

    if (score > bestScore) {
      bestEntry = entry
      bestScore = score
    }
  }

  return bestEntry?.uuid ?? null
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

  return {
    ...baseWorldModel,
    events: {
      ...baseWorldModel.events,
      indexPreamble: nextEventsPreamble,
      entries: parsedEvents.entries,
      details: {
        ...cloneDetails(baseWorldModel.events.details),
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

  return {
    ...baseWorldModel,
    elements: {
      ...baseWorldModel.elements,
      indexPreamble: nextElementsPreamble,
      entries: parsedElements.entries,
      details: {
        ...cloneDetails(baseWorldModel.elements.details),
        ...(elementsApplyResponse?.detail_files ?? {}),
      },
    },
  }
}

export function createIndexReviewSession(workspace, syncState, worldModel) {
  const worldSyncDraft = buildWorldSyncDraft(workspace, syncState, worldModel)

  return {
    ...buildInitialReviewState({
      attemptNumber: 0,
      isLoading: false,
      loadingAction: null,
    }),
    changedFiles: worldSyncDraft.changedFiles,
    currentSnapshot: worldSyncDraft.currentSnapshot,
    diffText: worldSyncDraft.diffText,
    elementsMd: worldSyncDraft.elementsMd,
    eventsMd: worldSyncDraft.eventsMd,
    lastSyncedSnapshot: worldSyncDraft.lastSyncedSnapshot,
    selectedFileIds: worldSyncDraft.selectedFileIds,
    step: REVIEW_STEPS.DIFF_PREVIEW,
    detailResults: {},
    detailTargets: [],
    currentDetailIndex: 0,
    elementDetailTargets: [],
    eventDetailTargets: [],
    updatedElementsState: null,
    updatedEventsState: null,
  }
}

export function updateDiffPreviewSelection(reviewSession, nextSelectedFileIds) {
  if (!reviewSession) {
    return reviewSession
  }

  const { diffText, selectedFileIds } = rebuildWorldSyncDiff(
    reviewSession.changedFiles ?? [],
    nextSelectedFileIds,
    reviewSession.currentSnapshot,
    reviewSession.lastSyncedSnapshot,
  )

  return {
    ...reviewSession,
    diffText,
    selectedFileIds,
  }
}

export function beginIndexReviewSession(reviewSession) {
  if (!reviewSession) {
    return reviewSession
  }

  return {
    ...reviewSession,
    attemptNumber: 1,
    error: null,
    isLoading: true,
    loadingAction: 'proposal',
    step: REVIEW_STEPS.EVENTS_INDEX,
  }
}

export function createReviewHistoryEntry(proposal, reviewerFeedback, attemptNumber) {
  return {
    attempt_number: attemptNumber,
    previous_output: JSON.stringify(proposal, null, 2),
    reviewer_feedback: reviewerFeedback.trim(),
  }
}

export function buildEventDetailTargets(previousEventsMd, eventsApplyResponse, proposal) {
  if (Array.isArray(eventsApplyResponse?.detail_targets) && eventsApplyResponse.detail_targets.length > 0) {
    return eventsApplyResponse.detail_targets
  }

  const parsedBefore = parseIndexMarkdown(previousEventsMd ?? '', EVENT_FIELD_NAMES)
  const parsedAfter = parseIndexMarkdown(eventsApplyResponse?.events_md ?? '', EVENT_FIELD_NAMES)
  const addedEntries = getAddedEntries(parsedBefore.entries, parsedAfter.entries)
  const claimedUuids = new Set()

  return (proposal?.deltas ?? []).flatMap((delta) => {
    const resolvedUuid = delta.action === 'create'
      ? resolveCreatedEventUuid(delta, addedEntries, claimedUuids)
      : delta.existing_event_uuid

    if (!resolvedUuid) {
      return []
    }

    claimedUuids.add(resolvedUuid)

    return [{
      uuid: resolvedUuid,
      summary: delta.summary || resolvedUuid,
      file: `events/${resolvedUuid}.md`,
      delta_action: delta.action,
      update_context: delta.reason,
      provenance_summary: delta.provenance_summary ?? '',
    }]
  })
}

export function buildElementDetailTargets(previousElementsMd, elementsApplyResponse, proposal) {
  if (Array.isArray(elementsApplyResponse?.detail_targets) && elementsApplyResponse.detail_targets.length > 0) {
    return elementsApplyResponse.detail_targets
  }

  const parsedBefore = parseIndexMarkdown(previousElementsMd ?? '', ELEMENT_FIELD_NAMES)
  const parsedAfter = parseIndexMarkdown(elementsApplyResponse?.elements_md ?? '', ELEMENT_FIELD_NAMES)
  const addedEntries = getAddedEntries(parsedBefore.entries, parsedAfter.entries)
  const claimedUuids = new Set()

  return (proposal?.identified_elements ?? []).flatMap((decision) => {
    const resolvedUuid = (decision.action === 'create'
      ? null
      : decision.matched_existing_uuid)
      || resolveCreatedElementUuid(decision, addedEntries, claimedUuids)

    if (!resolvedUuid) {
      return []
    }

    claimedUuids.add(resolvedUuid)

    return [{
      uuid: resolvedUuid,
      summary: decision.display_name,
      file: `elements/${resolvedUuid}.md`,
      delta_action: decision.action ?? (decision.is_new ? 'create' : 'update'),
      update_context: decision.update_instruction,
      kind: decision.kind,
      provenance_summary: decision.provenance_summary ?? '',
    }]
  })
}

export function createElementsIndexReviewSession(currentSession, eventsApplyResponse, eventDetailTargets) {
  const nextHistory = currentSession.history ?? []

  return {
    ...currentSession,
    ...buildInitialReviewState({
      history: nextHistory,
      historyBaseCount: nextHistory.length,
    }),
    step: REVIEW_STEPS.ELEMENTS_INDEX,
    eventsMd: eventsApplyResponse.events_md,
    eventDetailTargets,
    updatedEventsState: eventsApplyResponse,
  }
}

export function createDetailReviewSession(currentSession, {
  detailTargets,
  step,
  updatedElementsState,
  updatedEventsState,
}) {
  if (!Array.isArray(detailTargets) || detailTargets.length === 0) {
    throw new Error(`Cannot create ${step} review session without detail targets.`)
  }

  return {
    ...currentSession,
    ...buildInitialReviewState({
      history: [],
      historyBaseCount: 0,
    }),
    step,
    detailTargets,
    currentDetailIndex: 0,
    updatedElementsState: updatedElementsState ?? currentSession.updatedElementsState,
    updatedEventsState: updatedEventsState ?? currentSession.updatedEventsState,
  }
}

function buildDeletedUuidSet(actions, entityType) {
  const deletedUuids = new Set()

  for (const action of actions ?? []) {
    const match = action.match(new RegExp(`^Deleted ${entityType} (.+?)(?::|\\.|$)`, 'i'))
    if (match?.[1]) {
      deletedUuids.add(match[1].trim())
    }
  }

  return deletedUuids
}

function buildFinalReviewGroups(reviewSession) {
  const groups = {
    indexDeletes: [],
    indexMutations: [],
    detailDeletes: [],
    detailUpdates: [],
    retainedNoChange: [],
  }

  for (const action of reviewSession?.updatedEventsState?.actions ?? []) {
    if (action.toLowerCase().startsWith('deleted ')) {
      groups.indexDeletes.push(action)
    } else {
      groups.indexMutations.push(action)
    }
  }

  for (const action of reviewSession?.updatedElementsState?.actions ?? []) {
    if (action.toLowerCase().startsWith('deleted ')) {
      groups.indexDeletes.push(action)
    } else {
      groups.indexMutations.push(action)
    }
  }

  for (const target of [
    ...(reviewSession?.elementDetailTargets ?? []),
    ...(reviewSession?.eventDetailTargets ?? []),
  ]) {
    const result = reviewSession?.detailResults?.[target.uuid]
    if (!result || result.action !== 'approved') {
      continue
    }

    if (result.fileAction === 'delete') {
      groups.detailDeletes.push(`${target.file} — ${target.update_context}`)
      continue
    }

    if (result.fileAction === 'no_change') {
      groups.retainedNoChange.push(
        `${target.file} — ${result.retentionReason || target.provenance_summary || target.update_context}`,
      )
      continue
    }

    groups.detailUpdates.push(`${target.file} — ${target.update_context}`)
  }

  return groups
}

export function createFinalReviewSession(currentSession) {
  return {
    ...currentSession,
    currentPreviewDiff: '',
    currentProposal: null,
    currentUpdatedDetailMd: '',
    error: null,
    isLoading: false,
    loadingAction: null,
    step: REVIEW_STEPS.FINAL_REVIEW,
    finalReviewGroups: buildFinalReviewGroups(currentSession),
  }
}

export function getCurrentDetailTarget(reviewSession) {
  return reviewSession?.detailTargets?.[reviewSession.currentDetailIndex] ?? null
}

export function buildCurrentDetailMarkdown(reviewSession, worldModel) {
  const currentTarget = getCurrentDetailTarget(reviewSession)

  if (!currentTarget) {
    return ''
  }

  const isElementStep = reviewSession.step === REVIEW_STEPS.ELEMENT_DETAILS
  const stagedLayerState = isElementStep
    ? reviewSession.updatedElementsState
    : reviewSession.updatedEventsState
  const worldDetails = isElementStep
    ? worldModel?.elements?.details ?? {}
    : worldModel?.events?.details ?? {}

  return (
    reviewSession.detailResults?.[currentTarget.uuid]?.updatedMd
    ?? stagedLayerState?.detail_files?.[currentTarget.uuid]
    ?? worldDetails[currentTarget.uuid]
    ?? ''
  )
}

export function countCompletedDetailTargets(reviewSession, step) {
  const targetType = step === REVIEW_STEPS.ELEMENT_DETAILS ? 'element' : 'event'
  return summarizeDetailResults(reviewSession, targetType).approvedCount
}

export function countResolvedDetailTargets(reviewSession, step) {
  const targetType = step === REVIEW_STEPS.ELEMENT_DETAILS ? 'element' : 'event'
  const summary = summarizeDetailResults(reviewSession, targetType)

  return summary.approvedCount + summary.skippedCount
}

function buildIndexActionSummary(actions, entityType) {
  const summary = {
    createdCount: 0,
    deletedCount: 0,
    updatedCount: 0,
  }

  for (const action of actions ?? []) {
    const normalizedAction = action.trim().toLowerCase()

    if (normalizedAction.startsWith(`created ${entityType} `)) {
      summary.createdCount += 1
      continue
    }

    if (normalizedAction.startsWith(`updated ${entityType} `)) {
      summary.updatedCount += 1
      continue
    }

    if (normalizedAction.startsWith(`deleted ${entityType} `)) {
      summary.deletedCount += 1
    }
  }

  return summary
}

function getTargetUuids(reviewSession, targetType) {
  const targets = targetType === 'element'
    ? reviewSession?.elementDetailTargets ?? []
    : reviewSession?.eventDetailTargets ?? []

  return new Set(targets.map((target) => target.uuid))
}

function matchesDetailTargetType(uuid, result, targetType, targetUuids) {
  if (result?.targetType === targetType) {
    return true
  }

  if (targetUuids.has(uuid)) {
    return true
  }

  return targetType === 'element'
    ? uuid.startsWith('elt_')
    : uuid.startsWith('evt_')
}

export function summarizeDetailResults(reviewSession, targetType) {
  const targetUuids = getTargetUuids(reviewSession, targetType)
  const summary = {
    approvedCount: 0,
    skippedCount: 0,
    totalCount: targetUuids.size,
  }

  for (const [uuid, result] of Object.entries(reviewSession?.detailResults ?? {})) {
    if (!matchesDetailTargetType(uuid, result, targetType, targetUuids)) {
      continue
    }

    if (result.action === 'approved') {
      summary.approvedCount += 1
      continue
    }

    if (result.action === 'skipped') {
      summary.skippedCount += 1
    }
  }

  summary.totalCount = Math.max(
    summary.totalCount,
    summary.approvedCount + summary.skippedCount,
  )

  return summary
}

export function buildSyncReviewSummary(reviewSession) {
  return {
    elementDetails: summarizeDetailResults(reviewSession, 'element'),
    elements: buildIndexActionSummary(reviewSession?.updatedElementsState?.actions ?? [], 'element'),
    finalReview: reviewSession?.finalReviewGroups ?? buildFinalReviewGroups(reviewSession),
    eventDetails: summarizeDetailResults(reviewSession, 'event'),
    events: buildIndexActionSummary(reviewSession?.updatedEventsState?.actions ?? [], 'event'),
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

export function applyCompletedSyncReviewResult({
  currentSyncState,
  currentWorldModel,
  reviewSession,
  workspace,
}) {
  const stagedWorldModel = applyStagedIndexReviewResult({
    currentSyncState,
    currentWorldModel,
    elementsApplyResponse: reviewSession.updatedElementsState,
    eventsApplyResponse: reviewSession.updatedEventsState,
    selectedFileIds: reviewSession.selectedFileIds,
    workspace,
  }).worldModel

  const nextWorldModel = {
    ...stagedWorldModel,
    elements: {
      ...stagedWorldModel.elements,
      details: {
        ...stagedWorldModel.elements.details,
      },
    },
    events: {
      ...stagedWorldModel.events,
      details: {
        ...stagedWorldModel.events.details,
      },
    },
  }
  const deletedElementUuids = buildDeletedUuidSet(reviewSession?.updatedElementsState?.actions ?? [], 'element')
  const deletedEventUuids = buildDeletedUuidSet(reviewSession?.updatedEventsState?.actions ?? [], 'event')
  const elementTargetUuids = new Set((reviewSession.elementDetailTargets ?? []).map((target) => target.uuid))
  const eventTargetUuids = new Set((reviewSession.eventDetailTargets ?? []).map((target) => target.uuid))

  for (const [uuid, result] of Object.entries(reviewSession.detailResults ?? {})) {
    if (result.action !== 'approved') {
      continue
    }

    if (
      result.targetType === 'element'
      || elementTargetUuids.has(uuid)
      || uuid.startsWith('elt_')
    ) {
      if (result.fileAction === 'delete' || result.updatedMd === '') {
        delete nextWorldModel.elements.details[uuid]
      } else if (result.updatedMd) {
        nextWorldModel.elements.details[uuid] = result.updatedMd
      }
      continue
    }

    if (
      result.targetType === 'event'
      || eventTargetUuids.has(uuid)
      || uuid.startsWith('evt_')
    ) {
      if (result.fileAction === 'delete' || result.updatedMd === '') {
        delete nextWorldModel.events.details[uuid]
      } else if (result.updatedMd) {
        nextWorldModel.events.details[uuid] = result.updatedMd
      }
    }
  }

  for (const uuid of deletedElementUuids) {
    const result = reviewSession?.detailResults?.[uuid]
    if (result?.action !== 'approved' || result.fileAction !== 'delete') {
      throw new Error(`Deleted element ${uuid} is missing an approved detail-file delete.`)
    }
    delete nextWorldModel.elements.details[uuid]
  }

  for (const uuid of deletedEventUuids) {
    const result = reviewSession?.detailResults?.[uuid]
    if (result?.action !== 'approved' || result.fileAction !== 'delete') {
      throw new Error(`Deleted event ${uuid} is missing an approved detail-file delete.`)
    }
    delete nextWorldModel.events.details[uuid]
  }

  const currentSnapshot = createContentSnapshot(workspace)
  const previousSnapshot = currentSyncState?.lastSyncedSnapshot ?? {}
  const lastSyncedSnapshot = updateSnapshotAfterSync(
    previousSnapshot,
    currentSnapshot,
    reviewSession.selectedFileIds,
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
