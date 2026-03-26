import { Box, Button, Group, Stack, Text, Textarea } from '@mantine/core'
import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'

function getActionLabel(action) {
  if (action === 'create') {
    return '+ Create'
  }

  if (action === 'update') {
    return 'Update'
  }

  return 'Delete'
}

function getActionClassName(action) {
  return `review-delta-badge review-delta-badge--${action}`
}

function getDeltaTitle(delta) {
  if (delta.action === 'create') {
    return delta.summary
  }

  return delta.existing_event_uuid ?? 'Existing event'
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
          <Text className="review-delta-title">{getDeltaTitle(delta)}</Text>
          <Text className="review-delta-meta">
            {delta.when || 'No time supplied'}  ·  {delta.chapters || 'No chapter supplied'}
          </Text>
        </Box>
        <Text className={getActionClassName(delta.action)}>
          {getActionLabel(delta.action)}
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

function IndexReviewStep({
  attemptNumber,
  error,
  isLoading,
  loadingAction,
  proposal,
  onApprove,
  onRequestChanges,
}) {
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackError, setFeedbackError] = useState('')

  useEffect(() => {
    setFeedbackError('')
    setFeedbackText('')
  }, [attemptNumber])

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
    <Box className="review-panel" data-testid="events-index-review">
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Box>
          <Text className="eyebrow">Review Mode</Text>
          <Text className="review-panel-title">Events Index</Text>
          <Text className="review-panel-subtitle">
            Inspect the proposed event creation and update pass before it touches the world model.
          </Text>
        </Box>
        <Text className="review-attempt-pill" data-testid="review-attempt-indicator">
          Attempt {attemptNumber}
        </Text>
      </Group>

      <Box className="review-summary-card" mt="xl">
        <Text className="review-delta-label">AI Scan Summary</Text>
        <Text className="review-summary-copy">{proposal.scan_summary}</Text>
      </Box>

      <Stack gap="md" mt="xl">
        {proposal.deltas.map((delta, index) => (
          <EventDeltaCard
            delta={delta}
            key={`${delta.action}-${delta.existing_event_uuid ?? delta.summary}-${index}`}
          />
        ))}
      </Stack>

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
        <Text className="review-panel-footnote">
          The world model stays unchanged until you approve this proposal.
        </Text>
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
            data-testid="approve-events-index-button"
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
  proposal: PropTypes.shape({
    deltas: PropTypes.arrayOf(PropTypes.object).isRequired,
    scan_summary: PropTypes.string.isRequired,
  }).isRequired,
}

export default IndexReviewStep
