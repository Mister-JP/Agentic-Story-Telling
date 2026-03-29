import { Box, Button, Group, Stack, Text } from '@mantine/core'
import PropTypes from 'prop-types'

function FinalReviewGroup({ className, items, title, testId }) {
  return (
    <Box className={`review-summary-card final-review-card${className ? ` ${className}` : ''}`} data-testid={testId}>
      <Text className="review-delta-label">Summary</Text>
      <Text className="final-review-card-title">{title}</Text>
      <Stack className="final-review-list" gap={10} mt="md">
        {(items?.length ?? 0) > 0 ? items.map((item) => (
          <Text className="final-review-item" key={`${title}-${item}`}>
            {item}
          </Text>
        )) : (
          <Text className="final-review-empty">Nothing staged in this group.</Text>
        )}
      </Stack>
    </Box>
  )
}

FinalReviewGroup.propTypes = {
  className: PropTypes.string,
  items: PropTypes.arrayOf(PropTypes.string).isRequired,
  testId: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
}

function FinalReviewStep({ error, finalReviewGroups, isLoading, onApprove }) {
  return (
    <Stack className="review-panel final-review-panel" data-testid="final-review-step" gap="xl">
      <Box>
        <Text className="eyebrow">Review Mode</Text>
        <Text className="review-panel-title">Final Review</Text>
        <Text className="review-panel-subtitle">
          Confirm every staged index mutation, detail update, retained file, and file deletion before the world model is committed.
        </Text>
      </Box>

      <div className="final-review-grid">
        <FinalReviewGroup
          className="final-review-card--emphasis"
          items={finalReviewGroups?.indexMutations ?? []}
          testId="final-review-index-mutations"
          title="Index Creates & Updates"
        />
        <FinalReviewGroup
          items={finalReviewGroups?.indexDeletes ?? []}
          testId="final-review-index-deletes"
          title="Index Deletes"
        />
        <FinalReviewGroup
          className="final-review-card--emphasis"
          items={finalReviewGroups?.detailUpdates ?? []}
          testId="final-review-detail-updates"
          title="Detail Updates"
        />
        <FinalReviewGroup
          items={finalReviewGroups?.detailDeletes ?? []}
          testId="final-review-detail-deletes"
          title="Detail Deletes"
        />
        <FinalReviewGroup
          items={finalReviewGroups?.retainedNoChange ?? []}
          testId="final-review-retained-no-change"
          title="Retained Without Edits"
        />
      </div>

      {error ? (
        <Box className="review-feedback-card">
          <Text className="review-feedback-error">{error}</Text>
        </Box>
      ) : null}

      <Group className="review-action-row final-review-footer" justify="space-between">
        <Text className="review-panel-footnote">
          Commit applies every staged index mutation and detail-file decision together in one write.
        </Text>
        <Button data-testid="commit-final-review-button" disabled={isLoading} onClick={onApprove}>
          {isLoading ? 'Committing...' : 'Commit Sync'}
        </Button>
      </Group>
    </Stack>
  )
}

FinalReviewStep.propTypes = {
  error: PropTypes.string,
  finalReviewGroups: PropTypes.shape({
    detailDeletes: PropTypes.arrayOf(PropTypes.string),
    detailUpdates: PropTypes.arrayOf(PropTypes.string),
    indexDeletes: PropTypes.arrayOf(PropTypes.string),
    indexMutations: PropTypes.arrayOf(PropTypes.string),
    retainedNoChange: PropTypes.arrayOf(PropTypes.string),
  }),
  isLoading: PropTypes.bool.isRequired,
  onApprove: PropTypes.func.isRequired,
}

export default FinalReviewStep
