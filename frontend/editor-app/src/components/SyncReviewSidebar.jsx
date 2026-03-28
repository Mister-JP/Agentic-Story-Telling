import { Badge, Box, Button, Stack, Stepper, Text } from '@mantine/core'
import PropTypes from 'prop-types'
import {
  REVIEW_STEPS,
  REVIEW_STEP_VALUES,
  getReviewStepStatus,
  getReviewStepperActive,
} from '../utils/reviewSteps.js'
import { countCompletedDetailTargets } from '../utils/syncReview.js'

function buildChangedFilesLabel(changedFiles) {
  const fileCount = changedFiles.length
  return `${fileCount} changed file${fileCount === 1 ? '' : 's'}`
}

function buildSelectedFilesLabel(selectedFileIds) {
  const fileCount = selectedFileIds.length
  return `${fileCount} selected`
}

function getStepDescription(status, step) {
  if (step === REVIEW_STEPS.DIFF_PREVIEW) {
    if (status === 'active') {
      return 'Choose files to include'
    }

    if (status === 'completed') {
      return 'Selection confirmed'
    }

    return 'Waiting to begin'
  }

  if (status === 'active') {
    return 'Approve or request changes'
  }

  if (status === 'completed') {
    return 'Approved and staged'
  }

  return 'Waiting to begin'
}

function buildDetailStepLabel(baseLabel, completedCount, totalCount) {
  return `${baseLabel} (${completedCount}/${totalCount})`
}

function buildAttemptLabel(reviewSession) {
  if (reviewSession.attemptNumber > 0) {
    return `Current attempt: ${reviewSession.attemptNumber}`
  }

  return 'Waiting for the first proposal'
}

function SyncReviewSidebar({ onDiscard, reviewSession }) {
  const diffPreviewStatus = getReviewStepStatus(reviewSession.step, REVIEW_STEPS.DIFF_PREVIEW)
  const eventsStepStatus = getReviewStepStatus(reviewSession.step, REVIEW_STEPS.EVENTS_INDEX)
  const elementsStepStatus = getReviewStepStatus(reviewSession.step, REVIEW_STEPS.ELEMENTS_INDEX)
  const elementDetailsStepStatus = getReviewStepStatus(reviewSession.step, REVIEW_STEPS.ELEMENT_DETAILS)
  const eventDetailsStepStatus = getReviewStepStatus(reviewSession.step, REVIEW_STEPS.EVENT_DETAILS)
  const completedElementDetails = countCompletedDetailTargets(reviewSession, REVIEW_STEPS.ELEMENT_DETAILS)
  const completedEventDetails = countCompletedDetailTargets(reviewSession, REVIEW_STEPS.EVENT_DETAILS)
  const totalElementDetails = reviewSession.elementDetailTargets?.length ?? 0
  const totalEventDetails = reviewSession.eventDetailTargets?.length ?? 0

  return (
    <Stack className="review-sidebar" gap="lg" h="100%" justify="space-between">
      <Stack gap="lg">
        <Box>
          <Text className="eyebrow">Review Mode</Text>
          <Text className="panel-title review-sidebar-title">World Sync</Text>
          <Text className="panel-meta">
            Select the changed files first, then review the index passes and resolve each detail file while the canonical world model stays untouched.
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
          active={getReviewStepperActive(reviewSession.step) + 1}
          allowNextStepsSelect={false}
          className="review-stepper"
          orientation="vertical"
        >
          <Stepper.Step
            description={getStepDescription(diffPreviewStatus, REVIEW_STEPS.DIFF_PREVIEW)}
            label="Select Changes"
          />
          <Stepper.Step
            description={getStepDescription(eventsStepStatus, REVIEW_STEPS.EVENTS_INDEX)}
            label="Events Index"
          />
          <Stepper.Step
            description={getStepDescription(elementsStepStatus, REVIEW_STEPS.ELEMENTS_INDEX)}
            label="Elements Index"
          />
          <Stepper.Step
            description={getStepDescription(elementDetailsStepStatus, REVIEW_STEPS.ELEMENT_DETAILS)}
            label={buildDetailStepLabel('Element Details', completedElementDetails, totalElementDetails)}
          />
          <Stepper.Step
            description={getStepDescription(eventDetailsStepStatus, REVIEW_STEPS.EVENT_DETAILS)}
            label={buildDetailStepLabel('Event Details', completedEventDetails, totalEventDetails)}
          />
        </Stepper>

        <Box className="review-sidebar-note">
          <Text className="review-sidebar-note-title">All-or-nothing sync</Text>
          <Text className="review-sidebar-note-copy">
            Canceling exits review mode, discards staged results, and leaves the current world model untouched.
          </Text>
        </Box>
      </Stack>

      <Button
        data-testid="discard-review-button"
        disabled={reviewSession.isLoading}
        onClick={onDiscard}
        variant="default"
      >
        Cancel Sync
      </Button>
    </Stack>
  )
}

SyncReviewSidebar.propTypes = {
  onDiscard: PropTypes.func.isRequired,
  reviewSession: PropTypes.shape({
    attemptNumber: PropTypes.number.isRequired,
    changedFiles: PropTypes.arrayOf(PropTypes.object).isRequired,
    detailResults: PropTypes.object,
    elementDetailTargets: PropTypes.array,
    eventDetailTargets: PropTypes.array,
    isLoading: PropTypes.bool.isRequired,
    selectedFileIds: PropTypes.arrayOf(PropTypes.string).isRequired,
    step: PropTypes.oneOf(REVIEW_STEP_VALUES).isRequired,
  }).isRequired,
}

export default SyncReviewSidebar
