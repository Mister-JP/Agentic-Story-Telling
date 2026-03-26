import { Box, Button, Loader, Stack, Text } from '@mantine/core'
import PropTypes from 'prop-types'
import IndexReviewStep from './IndexReviewStep.jsx'

function ReviewLoadingState() {
  return (
    <Stack align="center" className="review-panel review-panel--empty" data-testid="review-loading-state" gap="md" justify="center">
      <Loader color="dark" size="sm" />
      <Text className="review-empty-title">Building the event proposal</Text>
      <Text className="review-empty-copy">
        The backend is preparing the first events-index pass from your latest story diff.
      </Text>
    </Stack>
  )
}

function ReviewErrorState({ error, onRetry }) {
  return (
    <Stack className="review-panel review-panel--empty" data-testid="review-error-state" gap="md" justify="center">
      <Text className="review-empty-title">Could not load the event proposal</Text>
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

  if (!reviewSession.currentProposal) {
    if (reviewSession.error) {
      return <ReviewErrorState error={reviewSession.error} onRetry={onRetry} />
    }

    if (reviewSession.isLoading) {
      return <ReviewLoadingState />
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
  }),
}

export default SyncReviewPanel
