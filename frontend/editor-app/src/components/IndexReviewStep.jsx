import { Box, Button, Group, Stack, Tabs, Text, Textarea } from '@mantine/core'
import PropTypes from 'prop-types'
import { useEffect, useMemo, useState } from 'react'
import { ELEMENT_FIELD_NAMES } from '../utils/elementsIndexFields.js'
import { EVENT_FIELD_NAMES } from '../utils/eventsIndexFields.js'
import { parseIndexMarkdown } from '../utils/worldModel.js'
import { INDEX_REVIEW_STEP_VALUES, REVIEW_STEPS } from '../utils/reviewSteps.js'

const ACTION_ORDER = ['create', 'update', 'delete']

function getStageCopy(step) {
  if (step === REVIEW_STEPS.ELEMENTS_INDEX) {
    return {
      approveTestId: 'approve-elements-index-button',
      footnote: 'Approve stages the selected index proposal. Request changes sends the whole stage back for another pass.',
      intro: 'Focus on one record at a time. Start with creates, then verify updates, then challenge deletes.',
      panelTestId: 'elements-index-review',
      subtitle: 'Review proposed element rows against the canonical index without reading every card at once.',
      summaryField: 'diff_summary',
      summaryLabel: 'Diff Summary',
      title: 'Elements Index',
    }
  }

  return {
    approveTestId: 'approve-events-index-button',
    footnote: 'Approve stages the selected index proposal. Request changes sends the whole stage back for another pass.',
    intro: 'Focus on one record at a time. Check whether the event exists, changes, or should disappear before reading raw evidence.',
    panelTestId: 'events-index-review',
    subtitle: 'Review proposed event rows against the canonical index without reading every card at once.',
    summaryField: 'scan_summary',
    summaryLabel: 'AI Scan Summary',
    title: 'Events Index',
  }
}

function getActionMeta(action) {
  if (action === 'create') {
    return {
      badgeClassName: 'review-delta-badge review-delta-badge--create',
      badgeLabel: 'Create',
      description: 'New records to add',
      emptyCopy: 'No new records are proposed in this stage.',
      tabLabel: 'Creates',
    }
  }

  if (action === 'delete') {
    return {
      badgeClassName: 'review-delta-badge review-delta-badge--delete',
      badgeLabel: 'Delete',
      description: 'Records to remove',
      emptyCopy: 'No records are scheduled for removal in this stage.',
      tabLabel: 'Deletes',
    }
  }

  return {
    badgeClassName: 'review-delta-badge review-delta-badge--update',
    badgeLabel: 'Update',
    description: 'Existing records to revise',
    emptyCopy: 'No existing records need changes in this stage.',
    tabLabel: 'Updates',
  }
}

function buildStageMetrics(proposal, step, currentEntryCount) {
  if (step === REVIEW_STEPS.ELEMENTS_INDEX) {
    const identifiedElements = Array.isArray(proposal.identified_elements)
      ? proposal.identified_elements
      : []
    const createCount = identifiedElements.filter((decision) => decision.action === 'create' || decision.is_new).length
    const deleteCount = identifiedElements.filter((decision) => decision.action === 'delete').length
    const updateCount = Math.max(identifiedElements.length - createCount - deleteCount, 0)

    return [
      { label: 'Current rows', value: currentEntryCount },
      { label: 'Creates', value: createCount },
      { label: 'Updates', value: updateCount },
      { label: 'Deletes', value: deleteCount },
    ]
  }

  const deltas = Array.isArray(proposal.deltas) ? proposal.deltas : []
  return [
    { label: 'Current rows', value: currentEntryCount },
    { label: 'Creates', value: deltas.filter((delta) => delta.action === 'create').length },
    { label: 'Updates', value: deltas.filter((delta) => delta.action === 'update').length },
    { label: 'Deletes', value: deltas.filter((delta) => delta.action === 'delete').length },
  ]
}

function buildEntryLookup(entries) {
  return new Map(entries.map((entry) => [entry.uuid, entry]))
}

function buildEventPreviewEntry(delta) {
  if (delta.action === 'delete') {
    return null
  }

  return {
    chapters: delta.chapters || 'Pending chapter',
    summary: delta.summary || 'Pending summary',
    uuid: delta.existing_event_uuid || 'Assigned on apply',
    when: delta.when || 'Pending time',
  }
}

function buildElementPreviewEntry(decision) {
  if (decision.action === 'delete') {
    return null
  }

  return {
    aliases: decision.aliases?.join(', ') || 'None supplied',
    display_name: decision.display_name,
    identification_keys: decision.identification_keys?.join('; ') || 'None supplied',
    kind: decision.kind,
    uuid: decision.matched_existing_uuid || 'Assigned on apply',
  }
}

function buildEventFieldRows(entry) {
  if (!entry) {
    return []
  }

  return [
    { label: 'UUID', value: entry.uuid || 'Not supplied' },
    { label: 'When', value: entry.when || 'Not supplied' },
    { label: 'Chapters', value: entry.chapters || 'Not supplied' },
    { label: 'Summary', value: entry.summary || 'Not supplied' },
  ]
}

function buildElementFieldRows(entry) {
  if (!entry) {
    return []
  }

  return [
    { label: 'Kind', value: entry.kind || 'Not supplied' },
    { label: 'Display Name', value: entry.display_name || 'Not supplied' },
    { label: 'UUID', value: entry.uuid || 'Not supplied' },
    { label: 'Aliases', value: entry.aliases || 'Not supplied' },
    { label: 'Identification Keys', value: entry.identification_keys || 'Not supplied' },
  ]
}

function buildIndexRowPreview(entry, fieldNames) {
  if (!entry) {
    return ''
  }

  const values = fieldNames.map((fieldName) => (entry[fieldName] ?? '').toString().trim() || 'Not supplied')
  return `- ${values.join(' | ')}`
}

function buildQueueTitle(item) {
  return item.title || 'Untitled record'
}

function buildEventItems(proposal, entryLookup) {
  return (proposal?.deltas ?? []).map((delta, index) => {
    const currentEntry = entryLookup.get(delta.existing_event_uuid)
    const proposedEntry = buildEventPreviewEntry(delta)
    const actionMeta = getActionMeta(delta.action)

    return {
      action: delta.action,
      badgeClassName: actionMeta.badgeClassName,
      badgeLabel: actionMeta.badgeLabel,
      currentEntry,
      evidence: delta.evidence_from_diff ?? [],
      id: `event-${delta.existing_event_uuid ?? delta.summary ?? index}-${index}`,
      primaryReason: delta.reason,
      proposedEntry,
      provenanceSummary: delta.provenance_summary ?? '',
      queueMeta: [delta.when, delta.chapters].filter(Boolean).join(' · ') || actionMeta.description,
      queueNote: delta.existing_event_uuid || 'New event',
      rowFieldNames: EVENT_FIELD_NAMES,
      title: delta.summary || delta.existing_event_uuid || 'Event',
    }
  })
}

function buildElementItems(proposal, entryLookup) {
  return (proposal?.identified_elements ?? []).map((decision, index) => {
    const action = decision.action === 'create' || decision.is_new ? 'create' : decision.action
    const currentEntry = entryLookup.get(decision.matched_existing_uuid)
    const proposedEntry = buildElementPreviewEntry(decision)
    const actionMeta = getActionMeta(action)
    const queueMeta = [decision.kind, decision.matched_existing_uuid ? 'Existing match' : 'New entity']
      .filter(Boolean)
      .join(' · ')

    return {
      action,
      badgeClassName: actionMeta.badgeClassName,
      badgeLabel: actionMeta.badgeLabel,
      currentEntry,
      evidence: decision.evidence_from_diff ?? [],
      id: `element-${decision.matched_existing_uuid ?? decision.display_name}-${index}`,
      primaryReason: decision.update_instruction,
      proposedEntry,
      provenanceSummary: decision.provenance_summary ?? '',
      queueMeta,
      queueNote: decision.snapshot,
      rowFieldNames: ELEMENT_FIELD_NAMES,
      secondaryReason: decision.snapshot,
      title: `${decision.display_name} (${decision.kind})`,
    }
  })
}

function chooseDefaultAction(itemsByAction) {
  return ACTION_ORDER.find((action) => itemsByAction[action].length > 0) ?? 'create'
}

function buildSelectedItem(itemsByAction, activeAction, selectedItemId) {
  const currentItems = itemsByAction[activeAction] ?? []
  return currentItems.find((item) => item.id === selectedItemId) ?? currentItems[0] ?? null
}

function ReviewMetrics({ metrics }) {
  return (
    <Box className="review-metric-strip">
      {metrics.map((metric) => (
        <Box className="review-metric-pill" key={metric.label}>
          <Text className="review-highlight-kicker">{metric.label}</Text>
          <Text className="review-doc-bullet-copy">{metric.value}</Text>
        </Box>
      ))}
    </Box>
  )
}

ReviewMetrics.propTypes = {
  metrics: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  })).isRequired,
}

function EvidenceLines({ evidenceFromDiff }) {
  if (!Array.isArray(evidenceFromDiff) || evidenceFromDiff.length === 0) {
    return (
      <Text className="review-delta-evidence is-muted">
        No diff evidence was included in this proposal.
      </Text>
    )
  }

  return (
    <Stack className="review-evidence-list" gap="xs">
      {evidenceFromDiff.map((evidenceLine, index) => (
        <Box className="review-evidence-card" key={`${evidenceLine}-${index}`}>
          <Text className="review-evidence-index">Evidence {index + 1}</Text>
          <Text className="review-evidence-copy">{evidenceLine}</Text>
        </Box>
      ))}
    </Stack>
  )
}

EvidenceLines.propTypes = {
  evidenceFromDiff: PropTypes.arrayOf(PropTypes.string),
}

function IndexRecordPanel({ emptyCopy, fieldRows, label, rowPreview }) {
  return (
    <Box className="review-record-panel">
      <Text className="review-delta-label">{label}</Text>
      {fieldRows.length > 0 ? (
        <Stack gap="sm" mt="sm">
          <Box className="review-record-grid">
            {fieldRows.map((field) => (
              <Box className="review-record-field" key={`${label}-${field.label}`}>
                <Text className="review-record-field-label">{field.label}</Text>
                <Text className="review-record-field-value">{field.value}</Text>
              </Box>
            ))}
          </Box>
          {rowPreview ? (
            <Box className="review-record-row">
              <Text className="review-highlight-kicker">Raw markdown row</Text>
              <Text className="review-doc-bullet-copy">{rowPreview}</Text>
            </Box>
          ) : null}
        </Stack>
      ) : (
        <Text className="review-delta-meta" mt="sm">{emptyCopy}</Text>
      )}
    </Box>
  )
}

IndexRecordPanel.propTypes = {
  emptyCopy: PropTypes.string.isRequired,
  fieldRows: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired,
  })).isRequired,
  label: PropTypes.string.isRequired,
  rowPreview: PropTypes.string,
}

function QueueItemButton({ isSelected, item, onSelect }) {
  return (
    <button
      className={`review-queue-item${isSelected ? ' is-selected' : ''}`}
      onClick={() => onSelect(item.id)}
      type="button"
    >
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Box className="review-delta-copy">
          <Text className="review-queue-title">{buildQueueTitle(item)}</Text>
          <Text className="review-queue-meta">{item.queueMeta}</Text>
          {item.queueNote ? (
            <Text className="review-queue-note">{item.queueNote}</Text>
          ) : null}
        </Box>
        <Text className={item.badgeClassName}>{item.badgeLabel}</Text>
      </Group>
    </button>
  )
}

QueueItemButton.propTypes = {
  isSelected: PropTypes.bool.isRequired,
  item: PropTypes.shape({
    badgeClassName: PropTypes.string.isRequired,
    badgeLabel: PropTypes.string.isRequired,
    id: PropTypes.string.isRequired,
    queueMeta: PropTypes.string,
    queueNote: PropTypes.string,
    title: PropTypes.string.isRequired,
  }).isRequired,
  onSelect: PropTypes.func.isRequired,
}

function FocusedProposalCard({ item }) {
  if (!item) {
    return (
      <Box className="review-focus-card">
        <Text className="review-empty-copy">Choose a proposal from the left to review it in detail.</Text>
      </Box>
    )
  }

  const currentFieldRows = item.rowFieldNames === ELEMENT_FIELD_NAMES
    ? buildElementFieldRows(item.currentEntry)
    : buildEventFieldRows(item.currentEntry)
  const proposedFieldRows = item.rowFieldNames === ELEMENT_FIELD_NAMES
    ? buildElementFieldRows(item.proposedEntry)
    : buildEventFieldRows(item.proposedEntry)

  return (
    <Stack className="review-focus-card" gap="lg">
      <Group align="flex-start" justify="space-between" wrap="wrap">
        <Box className="review-delta-copy">
          <Text className="review-delta-label">Selected proposal</Text>
          <Text className="review-panel-headline">{item.title}</Text>
          <Text className="review-panel-subtitle">
            Review the row comparison first, then inspect the evidence below.
          </Text>
        </Box>
        <Text className={item.badgeClassName}>{item.badgeLabel}</Text>
      </Group>

      <Box className="review-summary-card review-summary-card--attention">
        <Text className="review-delta-label">What needs your judgment</Text>
        <Text className="review-summary-copy">{item.primaryReason}</Text>
        {item.secondaryReason ? (
          <Text className="review-delta-meta">{item.secondaryReason}</Text>
        ) : null}
      </Box>

      <Box className="review-record-compare review-record-compare--focus">
        <IndexRecordPanel
          emptyCopy="This would be a brand-new row."
          fieldRows={currentFieldRows}
          label="Current canonical row"
          rowPreview={buildIndexRowPreview(item.currentEntry, item.rowFieldNames)}
        />
        <IndexRecordPanel
          emptyCopy="This row would be removed if approved."
          fieldRows={proposedFieldRows}
          label={item.action === 'delete' ? 'Outcome after approval' : 'Proposed row after approval'}
          rowPreview={buildIndexRowPreview(item.proposedEntry, item.rowFieldNames)}
        />
      </Box>

      <Box className="review-summary-card">
        <Text className="review-delta-label">Evidence from diff</Text>
        <EvidenceLines evidenceFromDiff={item.evidence} />
      </Box>

      {item.provenanceSummary ? (
        <Box className="review-summary-card">
          <Text className="review-delta-label">Provenance impact</Text>
          <Text className="review-summary-copy">{item.provenanceSummary}</Text>
        </Box>
      ) : null}
    </Stack>
  )
}

FocusedProposalCard.propTypes = {
  item: PropTypes.shape({
    action: PropTypes.string.isRequired,
    badgeClassName: PropTypes.string.isRequired,
    badgeLabel: PropTypes.string.isRequired,
    currentEntry: PropTypes.object,
    evidence: PropTypes.arrayOf(PropTypes.string).isRequired,
    primaryReason: PropTypes.string.isRequired,
    proposedEntry: PropTypes.object,
    provenanceSummary: PropTypes.string,
    rowFieldNames: PropTypes.arrayOf(PropTypes.string).isRequired,
    secondaryReason: PropTypes.string,
    title: PropTypes.string.isRequired,
  }),
}

function StageSummary({ currentEntryCount, proposal, step }) {
  const stageCopy = getStageCopy(step)
  const summaryValue = proposal[stageCopy.summaryField] ?? ''
  const rationale = proposal.rationale ?? ''
  const metrics = buildStageMetrics(proposal, step, currentEntryCount)

  return (
    <Stack gap="md" mt="xl">
      <ReviewMetrics metrics={metrics} />
      <Box className="review-overview-card">
        <Text className="review-delta-label">{stageCopy.summaryLabel}</Text>
        <Text className="review-summary-copy">{summaryValue}</Text>
        {rationale ? (
          <Text className="review-delta-meta" mt="sm">{rationale}</Text>
        ) : null}
        <Text className="review-delta-meta" mt="sm">{stageCopy.intro}</Text>
      </Box>
    </Stack>
  )
}

StageSummary.propTypes = {
  currentEntryCount: PropTypes.number.isRequired,
  proposal: PropTypes.object.isRequired,
  step: PropTypes.oneOf(INDEX_REVIEW_STEP_VALUES).isRequired,
}

function IndexReviewStep({
  attemptNumber,
  currentIndexMd,
  error,
  isLoading,
  loadingAction,
  onApprove,
  onDiscard,
  onRequestChanges,
  proposal,
  step,
}) {
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackError, setFeedbackError] = useState('')
  const [activeAction, setActiveAction] = useState('create')
  const [selectedItemId, setSelectedItemId] = useState(null)
  const stageCopy = getStageCopy(step)

  const parsedEntries = useMemo(() => {
    if (step === REVIEW_STEPS.ELEMENTS_INDEX) {
      return parseIndexMarkdown(currentIndexMd ?? '', ELEMENT_FIELD_NAMES).entries
    }

    return parseIndexMarkdown(currentIndexMd ?? '', EVENT_FIELD_NAMES).entries
  }, [currentIndexMd, step])

  const itemsByAction = useMemo(() => {
    const entryLookup = buildEntryLookup(parsedEntries)
    const items = step === REVIEW_STEPS.ELEMENTS_INDEX
      ? buildElementItems(proposal, entryLookup)
      : buildEventItems(proposal, entryLookup)

    return {
      create: items.filter((item) => item.action === 'create'),
      delete: items.filter((item) => item.action === 'delete'),
      update: items.filter((item) => item.action === 'update'),
    }
  }, [parsedEntries, proposal, step])

  const currentEntryCount = parsedEntries.length
  const selectedItem = buildSelectedItem(itemsByAction, activeAction, selectedItemId)
  const isApplyingReview = isLoading && loadingAction === 'approve'
  const isSubmittingChanges = isLoading && loadingAction === 'request-changes'

  useEffect(() => {
    setFeedbackError('')
    setFeedbackText('')
  }, [attemptNumber, step])

  useEffect(() => {
    const nextAction = chooseDefaultAction(itemsByAction)
    const nextSelectedId = itemsByAction[nextAction][0]?.id ?? null
    setActiveAction(nextAction)
    setSelectedItemId(nextSelectedId)
  }, [itemsByAction, step])

  useEffect(() => {
    const items = itemsByAction[activeAction] ?? []
    if (items.some((item) => item.id === selectedItemId)) {
      return
    }

    setSelectedItemId(items[0]?.id ?? null)
  }, [activeAction, itemsByAction, selectedItemId])

  function handleRequestChanges() {
    const trimmedFeedback = feedbackText.trim()
    if (trimmedFeedback === '') {
      setFeedbackError('Feedback is required before requesting changes.')
      return
    }

    onRequestChanges(trimmedFeedback)
  }

  function handleFeedbackChange(event) {
    setFeedbackText(event.currentTarget.value)
    if (feedbackError) {
      setFeedbackError('')
    }
  }

  return (
    <Box className="review-panel" data-testid={stageCopy.panelTestId}>
      <Group align="flex-start" justify="space-between" wrap="wrap">
        <Box>
          <Text className="eyebrow">Review Mode</Text>
          <Text className="review-panel-title">{stageCopy.title}</Text>
          <Text className="review-panel-subtitle">{stageCopy.subtitle}</Text>
        </Box>
        <Group align="flex-start" className="review-header-actions" gap="sm">
          <Text className="review-attempt-pill" data-testid="review-attempt-indicator">
            Attempt {attemptNumber}
          </Text>
          <Button
            data-testid="cancel-review-inline-button"
            disabled={isLoading}
            onClick={onDiscard}
            variant="default"
          >
            Cancel Sync
          </Button>
        </Group>
      </Group>

      <StageSummary currentEntryCount={currentEntryCount} proposal={proposal} step={step} />

      <Box className="review-master-layout" mt="xl">
        <Box className="review-list-pane">
          <Tabs
            className="review-action-tabs"
            onChange={(value) => {
              const nextAction = value ?? chooseDefaultAction(itemsByAction)
              setActiveAction(nextAction)
            }}
            value={activeAction}
          >
            <Tabs.List grow>
              {ACTION_ORDER.map((action) => {
                const actionMeta = getActionMeta(action)
                const count = itemsByAction[action].length

                return (
                  <Tabs.Tab key={action} value={action}>
                    {`${actionMeta.tabLabel} (${count})`}
                  </Tabs.Tab>
                )
              })}
            </Tabs.List>

            {ACTION_ORDER.map((action) => {
              const actionMeta = getActionMeta(action)
              const items = itemsByAction[action]

              return (
                <Tabs.Panel key={action} pt="md" value={action}>
                  <Text className="review-delta-meta">{actionMeta.description}</Text>
                  {items.length > 0 ? (
                    <Stack className="review-queue-list" gap="sm" mt="md">
                      {items.map((item) => (
                        <QueueItemButton
                          isSelected={item.id === selectedItem?.id}
                          item={item}
                          key={item.id}
                          onSelect={setSelectedItemId}
                        />
                      ))}
                    </Stack>
                  ) : (
                    <Box className="review-empty-diff" mt="md">
                      <Text className="review-empty-copy">{actionMeta.emptyCopy}</Text>
                    </Box>
                  )}
                </Tabs.Panel>
              )
            })}
          </Tabs>
        </Box>

        <Box className="review-focus-pane">
          <FocusedProposalCard item={selectedItem} />
        </Box>
      </Box>

      <Box className="review-feedback-card" mt="xl">
        <Text className="review-delta-label">Feedback</Text>
        <Textarea
          autosize
          className="review-feedback-input"
          data-testid="review-feedback-input"
          disabled={isLoading}
          minRows={4}
          onChange={handleFeedbackChange}
          placeholder="Reference the selected record and explain what is wrong or missing."
          value={feedbackText}
        />
        {feedbackError ? (
          <Text className="review-feedback-error" data-testid="review-feedback-error">
            {feedbackError}
          </Text>
        ) : null}
        {error ? (
          <Text className="review-feedback-error" data-testid="review-error-message">
            {error}
          </Text>
        ) : null}
      </Box>

      <Group className="review-action-row" justify="space-between" mt="xl">
        <Text className="review-panel-footnote">{stageCopy.footnote}</Text>
        <Group gap="sm">
          <Button
            data-testid="request-changes-button"
            disabled={isLoading}
            onClick={handleRequestChanges}
            variant="default"
          >
            {isSubmittingChanges ? 'Submitting...' : isLoading ? 'Loading...' : 'Request Changes'}
          </Button>
          <Button
            data-testid={stageCopy.approveTestId}
            disabled={isLoading}
            onClick={onApprove}
          >
            {isApplyingReview ? 'Applying...' : isLoading ? 'Loading...' : 'Approve'}
          </Button>
        </Group>
      </Group>
    </Box>
  )
}

IndexReviewStep.propTypes = {
  attemptNumber: PropTypes.number.isRequired,
  currentIndexMd: PropTypes.string,
  error: PropTypes.string,
  isLoading: PropTypes.bool.isRequired,
  loadingAction: PropTypes.oneOf(['approve', 'proposal', 'request-changes']),
  onApprove: PropTypes.func.isRequired,
  onDiscard: PropTypes.func.isRequired,
  onRequestChanges: PropTypes.func.isRequired,
  proposal: PropTypes.object.isRequired,
  step: PropTypes.oneOf(INDEX_REVIEW_STEP_VALUES).isRequired,
}

export default IndexReviewStep
