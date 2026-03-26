import { Badge, Box, Button, Stack, Stepper, Text } from '@mantine/core'
import PropTypes from 'prop-types'

function buildChangedFilesLabel(changedFiles) {
  const fileCount = changedFiles.length
  return `${fileCount} changed file${fileCount === 1 ? '' : 's'}`
}

function buildSelectedFilesLabel(selectedFileIds) {
  const fileCount = selectedFileIds.length
  return `${fileCount} selected`
}

function SyncReviewSidebar({ onDiscard, reviewSession }) {
  return (
    <Stack className="review-sidebar" gap="lg" h="100%" justify="space-between">
      <Stack gap="lg">
        <Box>
          <Text className="eyebrow">Review Mode</Text>
          <Text className="panel-title review-sidebar-title">World Sync</Text>
          <Text className="panel-meta">
            Stage 1 focuses on event creation and update review before anything is applied.
          </Text>
        </Box>

        <Stack className="review-sidebar-metrics" gap="xs">
          <Badge color="dark" variant="light">
            {buildChangedFilesLabel(reviewSession.changedFiles)}
          </Badge>
          <Text className="review-sidebar-meta">
            {buildSelectedFilesLabel(reviewSession.selectedFileIds)}
          </Text>
          <Text className="review-sidebar-meta">
            {reviewSession.attemptNumber > 0
              ? `Current attempt: ${reviewSession.attemptNumber}`
              : 'Waiting for the first proposal'}
          </Text>
        </Stack>

        <Stepper
          active={0}
          allowNextStepsSelect={false}
          className="review-stepper"
          orientation="vertical"
        >
          <Stepper.Step
            description="Approve or request changes"
            label="Events Index"
          />
        </Stepper>

        <Box className="review-sidebar-note">
          <Text className="review-sidebar-note-title">All-or-nothing for this slice</Text>
          <Text className="review-sidebar-note-copy">
            Discarding exits review mode and leaves the current world model untouched.
          </Text>
        </Box>
      </Stack>

      <Button
        data-testid="discard-review-button"
        disabled={reviewSession.isLoading}
        onClick={onDiscard}
        variant="default"
      >
        Discard Review
      </Button>
    </Stack>
  )
}

SyncReviewSidebar.propTypes = {
  onDiscard: PropTypes.func.isRequired,
  reviewSession: PropTypes.shape({
    attemptNumber: PropTypes.number.isRequired,
    changedFiles: PropTypes.arrayOf(PropTypes.object).isRequired,
    isLoading: PropTypes.bool.isRequired,
    selectedFileIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  }).isRequired,
}

export default SyncReviewSidebar
