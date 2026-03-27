import { Box, Button, Loader, Stack, Text } from '@mantine/core'
import PropTypes from 'prop-types'
import IndexReviewStep from './IndexReviewStep.jsx'
import {
  INDEX_REVIEW_STEP_VALUES,
  REVIEW_STEP_VALUES,
  isIndexReviewStep,
} from '../utils/reviewSteps.js'

function getStageCopy(step) {
  if (step === 'elements-index') {
    return {
      errorTitle: 'Could not load the element proposal',
      loadingCopy: 'The backend is preparing the elements-index pass from your latest story diff.',
      loadingTitle: 'Building the element proposal',
    }
  }

  return {
    errorTitle: 'Could not load the event proposal',
    loadingCopy: 'The backend is preparing the first events-index pass from your latest story diff.',
    loadingTitle: 'Building the event proposal',
  }
}

function ReviewLoadingState({ step }) {
  const stageCopy = getStageCopy(step)

  return (
    <Stack align="center" className="review-panel review-panel--empty" data-testid="review-loading-state" gap="md" justify="center">
      <Loader color="dark" size="sm" />
      <Text className="review-empty-title">{stageCopy.loadingTitle}</Text>
      <Text className="review-empty-copy">{stageCopy.loadingCopy}</Text>
    </Stack>
  )
}

ReviewLoadingState.propTypes = {
  step: PropTypes.oneOf(INDEX_REVIEW_STEP_VALUES).isRequired,
}

function ReviewErrorState({ error, onRetry, step }) {
  const stageCopy = getStageCopy(step)

  return (
    <Stack className="review-panel review-panel--empty" data-testid="review-error-state" gap="md" justify="center">
      <Text className="review-empty-title">{stageCopy.errorTitle}</Text>
      <Text className="review-empty-copy">{error}</Text>
      <Box>
        <Button data-testid="retry-review-button" onClick={onRetry}>
          Retry Proposal
        </Button>
      </Box>
    </Stack>
  )
}

ReviewErrorState.propTypes = {
  error: PropTypes.string.isRequired,
  onRetry: PropTypes.func.isRequired,
  step: PropTypes.oneOf(INDEX_REVIEW_STEP_VALUES).isRequired,
}

function SyncReviewPanel({
  onApprove,
  onRequestChanges,
  onRetry,
  reviewSession,
}) {
  if (!reviewSession) {
    return null
  }

  if (!isIndexReviewStep(reviewSession.step)) {
    return null
  }

  if (!reviewSession.currentProposal) {
    if (reviewSession.error) {
      return <ReviewErrorState error={reviewSession.error} onRetry={onRetry} step={reviewSession.step} />
    }

    if (reviewSession.isLoading) {
      return <ReviewLoadingState step={reviewSession.step} />
    }

    return null
  }

  return (
    <IndexReviewStep
      attemptNumber={reviewSession.attemptNumber}
      error={reviewSession.error}
      isLoading={reviewSession.isLoading}
      loadingAction={reviewSession.loadingAction}
      onApprove={onApprove}
      onRequestChanges={onRequestChanges}
      proposal={reviewSession.currentProposal}
      step={reviewSession.step}
    />
  )
}

SyncReviewPanel.propTypes = {
  onApprove: PropTypes.func.isRequired,
  onRequestChanges: PropTypes.func.isRequired,
  onRetry: PropTypes.func.isRequired,
  reviewSession: PropTypes.shape({
    attemptNumber: PropTypes.number,
    currentProposal: PropTypes.object,
    error: PropTypes.string,
    isLoading: PropTypes.bool,
    loadingAction: PropTypes.oneOf(['approve', 'proposal', 'request-changes']),
    step: PropTypes.oneOf(REVIEW_STEP_VALUES),
  }),
}

export default SyncReviewPanel
