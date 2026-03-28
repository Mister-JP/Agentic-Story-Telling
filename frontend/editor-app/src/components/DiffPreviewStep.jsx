import { Box, Button, Checkbox, Group, Stack, Text } from '@mantine/core'
import PropTypes from 'prop-types'
import { useMemo, useState } from 'react'
import ReviewDiffViewer from './ReviewDiffViewer.jsx'

function getStageCopy() {
  return {
    continueTestId: 'continue-diff-preview-button',
    panelTestId: 'diff-preview-review',
    subtitle: 'Choose which changed files should feed the sync pipeline. Unselected files stay unsynced and will appear again next time.',
    title: 'Select Changes',
  }
}

function getFileStatusBadge(status) {
  if (status === 'added') {
    return {
      badgeClassName: 'review-delta-badge review-delta-badge--create',
      label: 'Added',
    }
  }

  if (status === 'deleted') {
    return {
      badgeClassName: 'review-delta-badge review-delta-badge--delete',
      label: 'Deleted',
    }
  }

  return {
    badgeClassName: 'review-delta-badge review-delta-badge--update',
    label: 'Modified',
  }
}

function buildSelectionSummary(changedFiles, selectedFileIds) {
  const totalCount = changedFiles.length
  const selectedCount = selectedFileIds.length
  const selectedLabel = `${selectedCount} of ${totalCount} selected`

  if (selectedCount === totalCount) {
    return `${selectedLabel}. Every changed file will be included in the first review request.`
  }

  if (selectedCount === 0) {
    return `${selectedLabel}. Select at least one file to continue.`
  }

  return `${selectedLabel}. Only the checked files will be included in the diff sent to the harness.`
}

function DiffPreviewFileCard({
  changedFile,
  isExpanded,
  isSelected,
  onToggleExpanded,
  onToggleSelected,
}) {
  const statusBadge = getFileStatusBadge(changedFile.status)
  const checkboxTestId = `diff-preview-file-checkbox-${changedFile.fileId}`

  return (
    <Box className="review-delta-card review-file-card" data-testid={`diff-preview-file-card-${changedFile.fileId}`}>
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Group align="flex-start" gap="md" wrap="nowrap">
          <Checkbox
            aria-label={`Include ${changedFile.fileName}`}
            checked={isSelected}
            data-testid={checkboxTestId}
            onChange={(event) => onToggleSelected(changedFile.fileId, event.currentTarget.checked)}
            mt={4}
          />
          <Box className="review-delta-copy">
            <Text className="review-delta-title">{changedFile.fileName}</Text>
            <Text className="review-delta-meta">{changedFile.filePath}</Text>
          </Box>
        </Group>

        <Group align="center" gap="xs" wrap="nowrap">
          <Text className={statusBadge.badgeClassName}>{statusBadge.label}</Text>
          <Button
            data-testid={`toggle-diff-preview-button-${changedFile.fileId}`}
            onClick={() => onToggleExpanded(changedFile.fileId)}
            size="xs"
            variant="default"
          >
            {isExpanded ? 'Hide Diff' : 'Show Diff'}
          </Button>
        </Group>
      </Group>

      {isExpanded ? (
        <Box className="review-file-diff" mt="md">
          <Text className="review-delta-label">Inline Diff</Text>
          <ReviewDiffViewer
            previewDiff={changedFile.diffText}
            testId={`diff-preview-file-diff-${changedFile.fileId}`}
          />
        </Box>
      ) : null}
    </Box>
  )
}

DiffPreviewFileCard.propTypes = {
  changedFile: PropTypes.shape({
    diffText: PropTypes.string.isRequired,
    fileId: PropTypes.string.isRequired,
    fileName: PropTypes.string.isRequired,
    filePath: PropTypes.string.isRequired,
    status: PropTypes.oneOf(['added', 'modified', 'deleted']).isRequired,
  }).isRequired,
  isExpanded: PropTypes.bool.isRequired,
  isSelected: PropTypes.bool.isRequired,
  onToggleExpanded: PropTypes.func.isRequired,
  onToggleSelected: PropTypes.func.isRequired,
}

function DiffPreviewStep({ changedFiles, onContinue, onSelectionChange, selectedFileIds }) {
  const [expandedFileIds, setExpandedFileIds] = useState({})
  const stageCopy = getStageCopy()
  const selectedFileIdSet = useMemo(() => new Set(selectedFileIds), [selectedFileIds])
  const canContinue = selectedFileIds.length > 0

  function handleToggleExpanded(fileId) {
    setExpandedFileIds((current) => ({
      ...current,
      [fileId]: !current[fileId],
    }))
  }

  function handleToggleSelected(fileId, isChecked) {
    const nextSelectedFileIds = changedFiles
      .map((changedFile) => changedFile.fileId)
      .filter((currentFileId) => {
        if (currentFileId === fileId) {
          return isChecked
        }

        return selectedFileIdSet.has(currentFileId)
      })

    onSelectionChange(nextSelectedFileIds)
  }

  return (
    <Box className="review-panel" data-testid={stageCopy.panelTestId}>
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Box>
          <Text className="eyebrow">Review Mode</Text>
          <Text className="review-panel-title">{stageCopy.title}</Text>
          <Text className="review-panel-subtitle">{stageCopy.subtitle}</Text>
        </Box>
        <Text className="review-progress-pill" data-testid="diff-preview-selection-pill">
          {selectedFileIds.length} selected
        </Text>
      </Group>

      <Box className="review-summary-card" mt="xl">
        <Text className="review-delta-label">Selection Summary</Text>
        <Text className="review-summary-copy">
          {buildSelectionSummary(changedFiles, selectedFileIds)}
        </Text>
      </Box>

      <Stack gap="md" mt="xl">
        {changedFiles.map((changedFile) => (
          <DiffPreviewFileCard
            changedFile={changedFile}
            isExpanded={expandedFileIds[changedFile.fileId] === true}
            isSelected={selectedFileIdSet.has(changedFile.fileId)}
            key={changedFile.fileId}
            onToggleExpanded={handleToggleExpanded}
            onToggleSelected={handleToggleSelected}
          />
        ))}
      </Stack>

      <Group className="review-action-row" justify="space-between" mt="xl">
        <Text className="review-panel-footnote">
          Continue starts the first events-index proposal using only the checked files. Cancel Sync still discards the entire review.
        </Text>
        <Button
          data-testid={stageCopy.continueTestId}
          disabled={!canContinue}
          onClick={onContinue}
        >
          Continue
        </Button>
      </Group>
    </Box>
  )
}

DiffPreviewStep.propTypes = {
  changedFiles: PropTypes.arrayOf(PropTypes.shape({
    diffText: PropTypes.string.isRequired,
    fileId: PropTypes.string.isRequired,
    fileName: PropTypes.string.isRequired,
    filePath: PropTypes.string.isRequired,
    status: PropTypes.oneOf(['added', 'modified', 'deleted']).isRequired,
  })).isRequired,
  onContinue: PropTypes.func.isRequired,
  onSelectionChange: PropTypes.func.isRequired,
  selectedFileIds: PropTypes.arrayOf(PropTypes.string).isRequired,
}

export default DiffPreviewStep
