import { Box, Button, Group, Stack, Text, Textarea } from '@mantine/core'
import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import ReviewDiffViewer from './ReviewDiffViewer.jsx'
import { DETAIL_REVIEW_STEP_VALUES, REVIEW_STEPS } from '../utils/reviewSteps.js'

function getStageCopy(step) {
  if (step === REVIEW_STEPS.EVENT_DETAILS) {
    return {
      panelTestId: 'event-detail-review',
      subtitle: 'Review the precise file-level update for this event before anything is committed to the world model.',
      title: 'Event Detail Review',
      targetLabel: 'Event Detail',
    }
  }

  return {
    panelTestId: 'element-detail-review',
    subtitle: 'Review the precise file-level update for this element before anything is committed to the world model.',
    title: 'Element Detail Review',
    targetLabel: 'Element Detail',
  }
}

function DetailReviewStep({
  attemptNumber,
  currentDetailIndex,
  currentTarget,
  error,
  isLoading,
  loadingAction,
  onApprove,
  onRequestChanges,
  onSkip,
  previewDiff,
  proposal,
  step,
  totalTargets,
}) {
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackError, setFeedbackError] = useState('')
  const stageCopy = getStageCopy(step)
  const progressLabel = `${Math.min(currentDetailIndex + 1, totalTargets)} of ${totalTargets}`
  const isSubmittingChanges = isLoading && loadingAction === 'request-changes'
  const isApproving = isLoading && loadingAction === 'approve'
  const isSkipping = isLoading && loadingAction === 'skip'
  const backendReportedChanges = proposal?.changed === true
  const hasPreviewDiff = previewDiff.trim() !== ''
  const hasChanges = backendReportedChanges && hasPreviewDiff
  const hasEmptyChangedDiff = backendReportedChanges && !hasPreviewDiff

  useEffect(() => {
    setFeedbackError('')
    setFeedbackText('')
  }, [attemptNumber, currentTarget?.uuid, step])

  function handleFeedbackChange(event) {
    setFeedbackText(event.currentTarget.value)
    if (feedbackError) {
      setFeedbackError('')
    }
  }

  function handleRequestChanges() {
    const trimmedFeedback = feedbackText.trim()
    if (trimmedFeedback === '') {
      setFeedbackError('Feedback is required before requesting changes.')
      return
    }

    onRequestChanges(trimmedFeedback)
  }

  return (
    <Box className="review-panel" data-testid={stageCopy.panelTestId}>
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Box>
          <Text className="eyebrow">Review Mode</Text>
          <Text className="review-panel-title">{stageCopy.title}</Text>
          <Text className="review-panel-subtitle">{stageCopy.subtitle}</Text>
        </Box>
        <Stack align="flex-end" gap={8}>
          <Text className="review-progress-pill" data-testid="detail-review-progress">
            {progressLabel}
          </Text>
          <Text className="review-attempt-pill" data-testid="review-attempt-indicator">
            Attempt {attemptNumber}
          </Text>
        </Stack>
      </Group>

      <Box className="review-summary-card" mt="xl">
        <Text className="review-delta-label">{stageCopy.targetLabel}</Text>
        <Text className="review-summary-copy">
          {currentTarget.summary} · {currentTarget.uuid}
        </Text>
        <Text className="review-delta-meta">{currentTarget.update_context}</Text>
      </Box>

      <Box className="review-summary-card" mt="md">
        <Text className="review-delta-label">AI Rationale</Text>
        <Text className="review-summary-copy">{proposal.rationale}</Text>
      </Box>

      <Box className="review-delta-card" mt="xl">
        <Text className="review-delta-label">Proposed Diff</Text>
        {hasChanges ? (
          <ReviewDiffViewer previewDiff={previewDiff} testId="detail-diff-viewer" />
        ) : hasEmptyChangedDiff ? (
          <Stack className="review-empty-diff" gap={8} mt="md">
            <Text className="review-empty-title" data-testid="detail-empty-diff-warning-title">
              The backend reported a file change, but the diff preview is empty
            </Text>
            <Text className="review-empty-copy" data-testid="detail-empty-diff-warning-message">
              Review the rationale carefully before approving. This usually means the generated markdown changed shape in a way the preview renderer did not surface.
            </Text>
          </Stack>
        ) : (
          <Stack className="review-empty-diff" gap={8} mt="md">
            <Text className="review-empty-title" data-testid="detail-no-change-title">
              No file edits proposed
            </Text>
            <Text className="review-empty-copy" data-testid="detail-no-change-message">
              The AI thinks this target does not need any detail-file changes yet. Approve to keep the current file as-is, skip it for a later sync, or request changes if something was missed.
            </Text>
          </Stack>
        )}
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
          placeholder="Use this when the detail proposal gets the canon wrong or misses a file-level change."
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
          Approve stages the merged markdown, skip leaves the current detail untouched, and canceling discards the entire sync.
        </Text>
        <Group gap="sm">
          <Button
            data-testid="skip-detail-button"
            disabled={isLoading}
            onClick={onSkip}
            variant="default"
          >
            {isSkipping ? 'Skipping...' : isLoading ? 'Loading...' : 'Skip'}
          </Button>
          <Button
            data-testid="request-changes-button"
            disabled={isLoading}
            onClick={handleRequestChanges}
            variant="default"
          >
            {isSubmittingChanges ? 'Submitting...' : isLoading ? 'Loading...' : 'Request Changes'}
          </Button>
          <Button
            data-testid="approve-detail-button"
            disabled={isLoading}
            onClick={onApprove}
          >
            {isApproving ? 'Applying...' : isLoading ? 'Loading...' : 'Approve'}
          </Button>
        </Group>
      </Group>
    </Box>
  )
}

DetailReviewStep.propTypes = {
  attemptNumber: PropTypes.number.isRequired,
  currentDetailIndex: PropTypes.number.isRequired,
  currentTarget: PropTypes.shape({
    delta_action: PropTypes.string.isRequired,
    file: PropTypes.string.isRequired,
    summary: PropTypes.string.isRequired,
    update_context: PropTypes.string.isRequired,
    uuid: PropTypes.string.isRequired,
  }).isRequired,
  error: PropTypes.string,
  isLoading: PropTypes.bool.isRequired,
  loadingAction: PropTypes.oneOf(['approve', 'proposal', 'request-changes', 'skip']),
  onApprove: PropTypes.func.isRequired,
  onRequestChanges: PropTypes.func.isRequired,
  onSkip: PropTypes.func.isRequired,
  previewDiff: PropTypes.string.isRequired,
  proposal: PropTypes.shape({
    changed: PropTypes.bool.isRequired,
    rationale: PropTypes.string.isRequired,
  }).isRequired,
  step: PropTypes.oneOf(DETAIL_REVIEW_STEP_VALUES).isRequired,
  totalTargets: PropTypes.number.isRequired,
}

export default DetailReviewStep
