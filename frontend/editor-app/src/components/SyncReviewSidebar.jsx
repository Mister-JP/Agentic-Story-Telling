import { Badge, Box, Button, Stack, Stepper, Text } from '@mantine/core'
import PropTypes from 'prop-types'
import {
  REVIEW_STEPS,
  REVIEW_STEP_VALUES,
  getIndexReviewStepStatus,
  getIndexReviewStepperActive,
} from '../utils/reviewSteps.js'

function buildChangedFilesLabel(changedFiles) {
  const fileCount = changedFiles.length
  return `${fileCount} changed file${fileCount === 1 ? '' : 's'}`
}

function buildSelectedFilesLabel(selectedFileIds) {
  const fileCount = selectedFileIds.length
  return `${fileCount} selected`
}

function getStepDescription(status) {
  if (status === 'active') {
    return 'Approve or request changes'
  }

  if (status === 'completed') {
    return 'Approved and staged'
  }

  return 'Waiting to begin'
}

function buildAttemptLabel(reviewSession) {
  if (reviewSession.attemptNumber > 0) {
    return `Current attempt: ${reviewSession.attemptNumber}`
  }

  return 'Waiting for the first proposal'
}

function SyncReviewSidebar({ onDiscard, reviewSession }) {
  const eventsStepStatus = getIndexReviewStepStatus(reviewSession.step, REVIEW_STEPS.EVENTS_INDEX)
  const elementsStepStatus = getIndexReviewStepStatus(reviewSession.step, REVIEW_STEPS.ELEMENTS_INDEX)

  return (
    <Stack className="review-sidebar" gap="lg" h="100%" justify="space-between">
      <Stack gap="lg">
        <Box>
          <Text className="eyebrow">Review Mode</Text>
          <Text className="panel-title review-sidebar-title">World Sync</Text>
          <Text className="panel-meta">
            Stage 2 adds element creation and update review while keeping the world model untouched until both steps are approved.
          </Text>
        </Box>

        <Stack className="review-sidebar-metrics" gap="xs">
          <Badge color="dark" variant="light">
            {buildChangedFilesLabel(reviewSession.changedFiles)}
          </Badge>
          <Text className="review-sidebar-meta">
            {buildSelectedFilesLabel(reviewSession.selectedFileIds)}
          </Text>
          <Text className="review-sidebar-meta">{buildAttemptLabel(reviewSession)}</Text>
        </Stack>

        <Stepper
          active={getIndexReviewStepperActive(reviewSession.step)}
          allowNextStepsSelect={false}
          className="review-stepper"
          orientation="vertical"
        >
          <Stepper.Step
            description={getStepDescription(eventsStepStatus)}
            label="Events Index"
          />
          <Stepper.Step
            description={getStepDescription(elementsStepStatus)}
            label="Elements Index"
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
    step: PropTypes.oneOf(REVIEW_STEP_VALUES).isRequired,
  }).isRequired,
}

export default SyncReviewSidebar
