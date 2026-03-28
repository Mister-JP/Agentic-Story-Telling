import { Box, Button, Stack, Text } from '@mantine/core'
import PropTypes from 'prop-types'
import { buildSyncReviewSummary } from '../utils/syncReview.js'

function formatTimestamp(isoString) {
  if (!isoString) {
    return 'Just now'
  }

  try {
    return new Date(isoString).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

function SummaryCard({ lines, testId, title }) {
  return (
    <Box className="review-summary-card sync-complete-card" data-testid={testId}>
      <Text className="review-delta-label">Summary</Text>
      <Text className="sync-complete-card-title">{title}</Text>
      <Stack gap={8} mt="md">
        {lines.map((line) => (
          <Text className="sync-complete-metric" key={`${title}-${line.label}`}>
            <span className="sync-complete-metric-number">{line.value}</span>
            {' '}
            {line.label}
          </Text>
        ))}
      </Stack>
    </Box>
  )
}

SummaryCard.propTypes = {
  lines: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  }).isRequired).isRequired,
  testId: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
}

function SyncCompleteStep({ onComplete, reviewSession }) {
  const summary = buildSyncReviewSummary(reviewSession)
  const syncedAtLabel = formatTimestamp(reviewSession.completedSyncAt)

  return (
    <Stack className="review-panel sync-complete-step" data-testid="sync-complete-step" gap="xl">
      <Box>
        <Text className="eyebrow">Review Complete</Text>
        <Text className="review-panel-title">Sync Complete</Text>
        <Text className="review-panel-subtitle">
          Your world model has been updated. Review the totals below, then return to world view.
        </Text>
      </Box>

      <div className="sync-complete-grid">
        <SummaryCard
          lines={[
            { label: 'created', value: summary.events.createdCount },
            { label: 'updated', value: summary.events.updatedCount },
            { label: 'deleted', value: summary.events.deletedCount },
          ]}
          testId="sync-complete-events-summary"
          title="Events"
        />
        <SummaryCard
          lines={[
            { label: 'created', value: summary.elements.createdCount },
            { label: 'updated', value: summary.elements.updatedCount },
          ]}
          testId="sync-complete-elements-summary"
          title="Elements"
        />
        <SummaryCard
          lines={[
            { label: 'detail pages updated', value: summary.elementDetails.approvedCount },
            { label: 'detail pages skipped', value: summary.elementDetails.skippedCount },
          ]}
          testId="sync-complete-element-details-summary"
          title="Element Details"
        />
        <SummaryCard
          lines={[
            { label: 'detail pages updated', value: summary.eventDetails.approvedCount },
            { label: 'detail pages skipped', value: summary.eventDetails.skippedCount },
          ]}
          testId="sync-complete-event-details-summary"
          title="Event Details"
        />
        <SummaryCard
          lines={[
            { label: 'synced at', value: syncedAtLabel },
          ]}
          testId="sync-complete-timestamp"
          title="Timestamp"
        />
      </div>

      <Box className="sync-complete-footer">
        <Text className="review-panel-footnote">
          The staged review is now committed to the canonical world model.
        </Text>
        <Button data-testid="return-to-world-view-button" onClick={onComplete}>
          Return to World View
        </Button>
      </Box>
    </Stack>
  )
}

SyncCompleteStep.propTypes = {
  onComplete: PropTypes.func.isRequired,
  reviewSession: PropTypes.shape({
    completedSyncAt: PropTypes.string,
    detailResults: PropTypes.object,
    elementDetailTargets: PropTypes.array,
    eventDetailTargets: PropTypes.array,
    updatedElementsState: PropTypes.shape({
      actions: PropTypes.arrayOf(PropTypes.string),
    }),
    updatedEventsState: PropTypes.shape({
      actions: PropTypes.arrayOf(PropTypes.string),
    }),
  }).isRequired,
}

export default SyncCompleteStep
