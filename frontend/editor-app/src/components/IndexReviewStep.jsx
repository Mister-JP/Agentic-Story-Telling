import { Box, Button, Group, Stack, Text, Textarea } from '@mantine/core'
import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { INDEX_REVIEW_STEP_VALUES, REVIEW_STEPS } from '../utils/reviewSteps.js'

function getStageCopy(step) {
  if (step === REVIEW_STEPS.ELEMENTS_INDEX) {
    return {
      approveTestId: 'approve-elements-index-button',
      footnote: 'The world model stays unchanged until both index reviews are approved.',
      panelTestId: 'elements-index-review',
      subtitle: 'Review element creation and update proposals before they are staged for the world model.',
      summaryField: 'diff_summary',
      summaryLabel: 'Diff Summary',
      title: 'Elements Index',
    }
  }

  return {
    approveTestId: 'approve-events-index-button',
    footnote: 'The world model stays unchanged until both index reviews are approved.',
    panelTestId: 'events-index-review',
    subtitle: 'Inspect the proposed event creation and update pass before it is staged for the world model.',
    summaryField: 'scan_summary',
    summaryLabel: 'AI Scan Summary',
    title: 'Events Index',
  }
}

function getEventActionLabel(action) {
  if (action === 'create') {
    return '+ Create'
  }

  if (action === 'update') {
    return 'Update'
  }

  return 'Delete'
}

function getEventTitle(delta) {
  if (delta.action === 'create') {
    return delta.summary
  }

  return delta.existing_event_uuid ?? 'Existing event'
}

function getElementStatusLabel(decision) {
  if (decision.is_new) {
    return '+ New'
  }

  return 'Existing'
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
    <Stack gap={6}>
      {evidenceFromDiff.map((evidenceLine, index) => (
        <Text className="review-delta-evidence" key={`${evidenceLine}-${index}`}>
          {evidenceLine}
        </Text>
      ))}
    </Stack>
  )
}

EvidenceLines.propTypes = {
  evidenceFromDiff: PropTypes.arrayOf(PropTypes.string),
}

function EventDeltaCard({ delta }) {
  return (
    <Box className="review-delta-card" data-testid="event-delta-card">
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Box className="review-delta-copy">
          <Text className="review-delta-title">{getEventTitle(delta)}</Text>
          <Text className="review-delta-meta">
            {delta.when || 'No time supplied'}  ·  {delta.chapters || 'No chapter supplied'}
          </Text>
        </Box>
        <Text className={`review-delta-badge review-delta-badge--${delta.action}`}>
          {getEventActionLabel(delta.action)}
        </Text>
      </Group>

      <Stack gap="xs" mt="md">
        <Box>
          <Text className="review-delta-label">Reason</Text>
          <Text className="review-delta-body">{delta.reason}</Text>
        </Box>

        <Box>
          <Text className="review-delta-label">Evidence From Diff</Text>
          <EvidenceLines evidenceFromDiff={delta.evidence_from_diff} />
        </Box>
      </Stack>
    </Box>
  )
}

EventDeltaCard.propTypes = {
  delta: PropTypes.shape({
    action: PropTypes.string.isRequired,
    chapters: PropTypes.string,
    evidence_from_diff: PropTypes.arrayOf(PropTypes.string),
    existing_event_uuid: PropTypes.string,
    reason: PropTypes.string.isRequired,
    summary: PropTypes.string,
    when: PropTypes.string,
  }).isRequired,
}

function MetadataLine({ label, value }) {
  if (!value) {
    return null
  }

  return (
    <Box>
      <Text className="review-delta-label">{label}</Text>
      <Text className="review-delta-body">{value}</Text>
    </Box>
  )
}

MetadataLine.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
}

function ElementDecisionCard({ decision }) {
  const aliases = decision.aliases?.join(', ') ?? ''
  const identificationKeys = decision.identification_keys?.join('; ') ?? ''
  const matchedCopy = decision.matched_existing_uuid
    ? `${decision.matched_existing_display_name || decision.display_name} · ${decision.matched_existing_uuid}`
    : ''

  return (
    <Box className="review-delta-card" data-testid="element-decision-card">
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Box className="review-delta-copy">
          <Text className="review-delta-title">
            {decision.display_name} ({decision.kind})
          </Text>
          {matchedCopy ? (
            <Text className="review-delta-meta">{matchedCopy}</Text>
          ) : null}
        </Box>
        <Text className={`review-delta-badge review-delta-badge--${decision.is_new ? 'create' : 'update'}`}>
          {getElementStatusLabel(decision)}
        </Text>
      </Group>

      <Stack gap="xs" mt="md">
        <MetadataLine label="Aliases" value={aliases} />
        <MetadataLine label="Identification Keys" value={identificationKeys} />
        <MetadataLine label="Snapshot" value={decision.snapshot} />
        <MetadataLine label="Update Instruction" value={decision.update_instruction} />

        <Box>
          <Text className="review-delta-label">Evidence From Diff</Text>
          <EvidenceLines evidenceFromDiff={decision.evidence_from_diff} />
        </Box>
      </Stack>
    </Box>
  )
}

ElementDecisionCard.propTypes = {
  decision: PropTypes.shape({
    aliases: PropTypes.arrayOf(PropTypes.string),
    display_name: PropTypes.string.isRequired,
    evidence_from_diff: PropTypes.arrayOf(PropTypes.string),
    identification_keys: PropTypes.arrayOf(PropTypes.string),
    is_new: PropTypes.bool.isRequired,
    kind: PropTypes.string.isRequired,
    matched_existing_display_name: PropTypes.string,
    matched_existing_uuid: PropTypes.string,
    snapshot: PropTypes.string.isRequired,
    update_instruction: PropTypes.string.isRequired,
  }).isRequired,
}

function StageSummary({ proposal, step }) {
  const stageCopy = getStageCopy(step)
  const summaryValue = proposal[stageCopy.summaryField] ?? ''
  const rationale = proposal.rationale ?? ''

  if (step === REVIEW_STEPS.ELEMENTS_INDEX) {
    return (
      <Stack gap="md" mt="xl">
        <Box className="review-summary-card">
          <Text className="review-delta-label">{stageCopy.summaryLabel}</Text>
          <Text className="review-summary-copy">{summaryValue}</Text>
        </Box>
        <Box className="review-summary-card">
          <Text className="review-delta-label">Rationale</Text>
          <Text className="review-summary-copy">{rationale}</Text>
        </Box>
      </Stack>
    )
  }

  return (
    <Box className="review-summary-card" mt="xl">
      <Text className="review-delta-label">{stageCopy.summaryLabel}</Text>
      <Text className="review-summary-copy">{summaryValue}</Text>
    </Box>
  )
}

StageSummary.propTypes = {
  proposal: PropTypes.object.isRequired,
  step: PropTypes.oneOf(INDEX_REVIEW_STEP_VALUES).isRequired,
}

function ProposalCards({ proposal, step }) {
  if (step === REVIEW_STEPS.ELEMENTS_INDEX) {
    const identifiedElements = Array.isArray(proposal.identified_elements)
      ? proposal.identified_elements
      : []

    return (
      <Stack gap="md" mt="xl">
        {identifiedElements.map((decision, index) => (
          <ElementDecisionCard
            decision={decision}
            key={`${decision.matched_existing_uuid ?? decision.display_name}-${index}`}
          />
        ))}
      </Stack>
    )
  }

  const deltas = Array.isArray(proposal.deltas) ? proposal.deltas : []

  return (
    <Stack gap="md" mt="xl">
      {deltas.map((delta, index) => (
        <EventDeltaCard
          delta={delta}
          key={`${delta.action}-${delta.existing_event_uuid ?? delta.summary}-${index}`}
        />
      ))}
    </Stack>
  )
}

ProposalCards.propTypes = {
  proposal: PropTypes.object.isRequired,
  step: PropTypes.oneOf(INDEX_REVIEW_STEP_VALUES).isRequired,
}

function IndexReviewStep({
  attemptNumber,
  error,
  isLoading,
  loadingAction,
  onApprove,
  onRequestChanges,
  proposal,
  step,
}) {
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackError, setFeedbackError] = useState('')
  const stageCopy = getStageCopy(step)

  useEffect(() => {
    setFeedbackError('')
    setFeedbackText('')
  }, [attemptNumber, step])

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

  const isApplyingReview = isLoading && loadingAction === 'approve'
  const isSubmittingChanges = isLoading && loadingAction === 'request-changes'

  return (
    <Box className="review-panel" data-testid={stageCopy.panelTestId}>
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Box>
          <Text className="eyebrow">Review Mode</Text>
          <Text className="review-panel-title">{stageCopy.title}</Text>
          <Text className="review-panel-subtitle">{stageCopy.subtitle}</Text>
        </Box>
        <Text className="review-attempt-pill" data-testid="review-attempt-indicator">
          Attempt {attemptNumber}
        </Text>
      </Group>

      <StageSummary proposal={proposal} step={step} />
      <ProposalCards proposal={proposal} step={step} />

      <Box className="review-feedback-card" mt="xl">
        <Text className="review-delta-label">Feedback</Text>
        <Textarea
          autosize
          className="review-feedback-input"
          data-testid="review-feedback-input"
          disabled={isLoading}
          minRows={4}
          onChange={handleFeedbackChange}
          placeholder="Use this when the proposal misses a story detail or makes the wrong inference."
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
  error: PropTypes.string,
  isLoading: PropTypes.bool.isRequired,
  loadingAction: PropTypes.oneOf(['approve', 'proposal', 'request-changes']),
  onApprove: PropTypes.func.isRequired,
  onRequestChanges: PropTypes.func.isRequired,
  proposal: PropTypes.object.isRequired,
  step: PropTypes.oneOf(INDEX_REVIEW_STEP_VALUES).isRequired,
}

export default IndexReviewStep
