import { Box, Button, Group, Stack, Tabs, Text, Textarea } from '@mantine/core'
import PropTypes from 'prop-types'
import { useEffect, useMemo, useState } from 'react'
import ReviewDiffViewer from './ReviewDiffViewer.jsx'
import ReviewMarkdownDocument from './ReviewMarkdownDocument.jsx'
import { DETAIL_REVIEW_STEP_VALUES, REVIEW_STEPS } from '../utils/reviewSteps.js'

function getStageCopy(step) {
  if (step === REVIEW_STEPS.EVENT_DETAILS) {
    return {
      panelTestId: 'event-detail-review',
      subtitle: 'Review one event dossier at a time. Start with the decision summary, then inspect only the tab you need.',
      targetLabel: 'Event Detail',
      title: 'Event Detail Review',
    }
  }

  return {
    panelTestId: 'element-detail-review',
    subtitle: 'Review one element dossier at a time. Start with the decision summary, then inspect only the tab you need.',
    targetLabel: 'Element Detail',
    title: 'Element Detail Review',
  }
}

function getDetailMode(currentTarget, proposal) {
  if (proposal?.file_action === 'delete' || currentTarget?.delta_action === 'delete') {
    return 'delete'
  }

  if (currentTarget?.delta_action === 'create') {
    return 'create'
  }

  if (proposal?.file_action === 'no_change') {
    return 'no_change'
  }

  return 'update'
}

function getFileActionPresentation(detailMode) {
  if (detailMode === 'delete') {
    return {
      badgeClassName: 'review-delta-badge review-delta-badge--delete',
      focusLabel: 'Decide whether the file should disappear entirely.',
      label: 'Delete dossier',
      summary: 'This proposal removes the file because the surviving support may no longer justify keeping it.',
    }
  }

  if (detailMode === 'create') {
    return {
      badgeClassName: 'review-delta-badge review-delta-badge--create',
      focusLabel: 'Read the proposed dossier as the first canonical draft.',
      label: 'Create dossier',
      summary: 'This is a newly introduced canonical file. Review the proposed markdown directly, not every supporting artifact at once.',
    }
  }

  if (detailMode === 'no_change') {
    return {
      badgeClassName: 'review-delta-badge review-delta-badge--update',
      focusLabel: 'Decide whether the current dossier is safe to keep unchanged.',
      label: 'Keep dossier',
      summary: 'The AI thinks the existing dossier is already correct and does not need a markdown edit.',
    }
  }

  return {
    badgeClassName: 'review-delta-badge review-delta-badge--update',
    focusLabel: 'Review the change summary first, then read the proposed markdown if the summary looks right.',
    label: 'Update dossier',
    summary: 'This proposal revises the existing dossier and stages a new markdown version for this target.',
  }
}

function formatChronologyBlocks(blocks) {
  return (blocks ?? []).map((block) => {
    const entries = block.entries?.join(' / ') || 'No entries listed'
    return `${block.heading}: ${entries}`
  })
}

function buildSectionChanges(step, proposal) {
  if (!proposal) {
    return []
  }

  if (step === REVIEW_STEPS.EVENT_DETAILS) {
    return [
      {
        added: [],
        removed: [],
        replacement: proposal.core_understanding_replacement ? [proposal.core_understanding_replacement] : [],
        title: 'Core Understanding',
      },
      {
        added: proposal.causal_context_to_add ?? [],
        removed: proposal.causal_context_to_remove ?? [],
        replacement: [],
        title: 'Causal Context',
      },
      {
        added: proposal.consequences_to_add ?? [],
        removed: proposal.consequences_to_remove ?? [],
        replacement: [],
        title: 'Consequences',
      },
      {
        added: proposal.participants_to_add ?? [],
        removed: proposal.participants_to_remove ?? [],
        replacement: [],
        title: 'Participants',
      },
      {
        added: proposal.evidence_to_add ?? [],
        removed: proposal.evidence_to_remove ?? [],
        replacement: [],
        title: 'Evidence',
      },
      {
        added: proposal.open_threads_to_add ?? [],
        removed: proposal.open_threads_to_remove ?? [],
        replacement: [],
        title: 'Open Threads',
      },
      {
        added: [],
        removed: [],
        replacement: proposal.provenance_replacement ?? [],
        title: 'Provenance',
      },
    ]
  }

  return [
    {
      added: [],
      removed: [],
      replacement: proposal.core_understanding_replacement ? [proposal.core_understanding_replacement] : [],
      title: 'Core Understanding',
    },
    {
      added: proposal.stable_profile_to_add ?? [],
      removed: proposal.stable_profile_to_remove ?? [],
      replacement: [],
      title: 'Stable Profile',
    },
    {
      added: proposal.interpretation_to_add ?? [],
      removed: proposal.interpretation_to_remove ?? [],
      replacement: [],
      title: 'Interpretation',
    },
    {
      added: proposal.knowledge_to_add ?? [],
      removed: proposal.knowledge_to_remove ?? [],
      replacement: [],
      title: 'Knowledge',
    },
    {
      added: formatChronologyBlocks(proposal.chronology_blocks_to_add),
      removed: formatChronologyBlocks(proposal.chronology_blocks_to_remove),
      replacement: [],
      title: 'Chronology',
    },
    {
      added: proposal.open_threads_to_add ?? [],
      removed: proposal.open_threads_to_remove ?? [],
      replacement: [],
      title: 'Open Threads',
    },
    {
      added: [],
      removed: [],
      replacement: proposal.provenance_replacement ?? [],
      title: 'Provenance',
    },
  ]
}

function summarizeSectionChanges(changes) {
  return changes.reduce((summary, change) => ({
    additions: summary.additions + change.added.length,
    removals: summary.removals + change.removed.length,
    replacements: summary.replacements + change.replacement.length,
    sectionsTouched: summary.sectionsTouched + (
      change.added.length > 0 || change.removed.length > 0 || change.replacement.length > 0 ? 1 : 0
    ),
  }), {
    additions: 0,
    removals: 0,
    replacements: 0,
    sectionsTouched: 0,
  })
}

function getDefaultPanel(detailMode) {
  if (detailMode === 'create') {
    return 'proposed'
  }

  if (detailMode === 'delete') {
    return 'decision'
  }

  if (detailMode === 'no_change') {
    return 'decision'
  }

  return 'changes'
}

function buildTabConfig(detailMode) {
  if (detailMode === 'create') {
    return [
      { label: 'Proposed Dossier', value: 'proposed' },
      { label: 'Change Summary', value: 'changes' },
      { label: 'Current Scaffold', value: 'current' },
      { label: 'Raw Diff', value: 'diff' },
    ]
  }

  if (detailMode === 'delete') {
    return [
      { label: 'Decision Summary', value: 'decision' },
      { label: 'Current Dossier', value: 'current' },
      { label: 'Raw Diff', value: 'diff' },
    ]
  }

  if (detailMode === 'no_change') {
    return [
      { label: 'Decision Summary', value: 'decision' },
      { label: 'Current Dossier', value: 'current' },
    ]
  }

  return [
    { label: 'Change Summary', value: 'changes' },
    { label: 'Proposed Dossier', value: 'proposed' },
    { label: 'Current Dossier', value: 'current' },
    { label: 'Raw Diff', value: 'diff' },
  ]
}

function ChangeList({ items, label, tone }) {
  if (items.length === 0) {
    return null
  }

  return (
    <Box className="review-change-list">
      <Text className={`review-change-kicker review-change-kicker--${tone}`}>{label}</Text>
      <Stack gap="xs" mt="xs">
        {items.map((item) => (
          <Box className={`review-change-chip review-change-chip--${tone}`} key={`${label}-${item}`}>
            <Text className="review-doc-bullet-copy">{item}</Text>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}

ChangeList.propTypes = {
  items: PropTypes.arrayOf(PropTypes.string).isRequired,
  label: PropTypes.string.isRequired,
  tone: PropTypes.oneOf(['create', 'delete', 'update']).isRequired,
}

function ChangeSummaryTab({ changes, detailMode }) {
  const relevantChanges = changes.filter((change) => (
    change.added.length > 0 || change.removed.length > 0 || change.replacement.length > 0
  ))

  if (detailMode === 'no_change') {
    return (
      <Box className="review-focus-card">
        <Text className="review-empty-copy">
          No section-level changes are proposed. Review the rationale and the current dossier before approving.
        </Text>
      </Box>
    )
  }

  if (relevantChanges.length === 0) {
    return (
      <Box className="review-focus-card">
        <Text className="review-empty-copy">
          The proposal did not enumerate section-level changes. Inspect the proposed markdown and raw diff carefully before approving.
        </Text>
      </Box>
    )
  }

  return (
    <Box className="review-change-grid">
      {relevantChanges.map((change) => (
        <Box className="review-change-card" key={change.title}>
          <Text className="review-delta-label">Section</Text>
          <Text className="review-change-title">{change.title}</Text>
          <ChangeList items={change.replacement} label="Replace with" tone="update" />
          <ChangeList items={change.added} label="Add" tone="create" />
          <ChangeList items={change.removed} label="Remove" tone="delete" />
        </Box>
      ))}
    </Box>
  )
}

ChangeSummaryTab.propTypes = {
  changes: PropTypes.arrayOf(PropTypes.shape({
    added: PropTypes.arrayOf(PropTypes.string).isRequired,
    removed: PropTypes.arrayOf(PropTypes.string).isRequired,
    replacement: PropTypes.arrayOf(PropTypes.string).isRequired,
    title: PropTypes.string.isRequired,
  })).isRequired,
  detailMode: PropTypes.oneOf(['create', 'delete', 'no_change', 'update']).isRequired,
}

function DecisionSummaryTab({
  currentTarget,
  detailMode,
  fileActionPresentation,
  proposal,
  sectionSummary,
}) {
  const hasChangeCounts = sectionSummary.sectionsTouched > 0

  return (
    <Stack className="review-focus-card" gap="lg">
      <Box className="review-summary-card review-summary-card--attention">
        <Text className="review-delta-label">What to decide</Text>
        <Text className="review-summary-copy">{fileActionPresentation.focusLabel}</Text>
        <Text className="review-delta-meta" mt="sm">{fileActionPresentation.summary}</Text>
      </Box>

      <Box className="review-metric-strip">
        <Box className="review-metric-pill">
          <Text className="review-highlight-kicker">Target</Text>
          <Text className="review-doc-bullet-copy">{currentTarget.file}</Text>
        </Box>
        <Box className="review-metric-pill">
          <Text className="review-highlight-kicker">Action</Text>
          <Text className="review-doc-bullet-copy">{detailMode.replace('_', ' ')}</Text>
        </Box>
        {hasChangeCounts ? (
          <Box className="review-metric-pill">
            <Text className="review-highlight-kicker">Sections touched</Text>
            <Text className="review-doc-bullet-copy">{sectionSummary.sectionsTouched}</Text>
          </Box>
        ) : null}
      </Box>

      <Box className="review-summary-card">
        <Text className="review-delta-label">AI rationale</Text>
        <Text className="review-summary-copy">{proposal.rationale}</Text>
        {proposal.retention_reason ? (
          <Text className="review-delta-meta" mt="sm">{proposal.retention_reason}</Text>
        ) : null}
      </Box>
    </Stack>
  )
}

DecisionSummaryTab.propTypes = {
  currentTarget: PropTypes.shape({
    file: PropTypes.string.isRequired,
  }).isRequired,
  detailMode: PropTypes.oneOf(['create', 'delete', 'no_change', 'update']).isRequired,
  fileActionPresentation: PropTypes.shape({
    focusLabel: PropTypes.string.isRequired,
    summary: PropTypes.string.isRequired,
  }).isRequired,
  proposal: PropTypes.shape({
    rationale: PropTypes.string.isRequired,
    retention_reason: PropTypes.string,
  }).isRequired,
  sectionSummary: PropTypes.shape({
    sectionsTouched: PropTypes.number.isRequired,
  }).isRequired,
}

function DiffTab({ hasChanges, hasEmptyChangedDiff, previewDiff }) {
  return (
    <Box className="review-focus-card">
      {hasChanges ? (
        <ReviewDiffViewer previewDiff={previewDiff} testId="detail-diff-viewer" />
      ) : hasEmptyChangedDiff ? (
        <Stack className="review-empty-diff" gap={8}>
          <Text className="review-empty-title" data-testid="detail-empty-diff-warning-title">
            The backend reported a file change, but the diff preview is empty
          </Text>
          <Text className="review-empty-copy" data-testid="detail-empty-diff-warning-message">
            Inspect the proposed markdown carefully before approving. The renderer did not surface a textual diff for this change.
          </Text>
        </Stack>
      ) : (
        <Stack className="review-empty-diff" gap={8}>
          <Text className="review-empty-title" data-testid="detail-no-change-title">
            No file edits proposed
          </Text>
          <Text className="review-empty-copy" data-testid="detail-no-change-message">
            The AI thinks this dossier should remain as-is after reviewing its provenance.
          </Text>
        </Stack>
      )}
    </Box>
  )
}

DiffTab.propTypes = {
  hasChanges: PropTypes.bool.isRequired,
  hasEmptyChangedDiff: PropTypes.bool.isRequired,
  previewDiff: PropTypes.string.isRequired,
}

function DetailReviewStep({
  attemptNumber,
  currentDetailIndex,
  currentDetailMd = '',
  currentTarget,
  error,
  isLoading,
  loadingAction,
  onApprove,
  onDiscard,
  onRequestChanges,
  onSkip,
  previewDiff,
  proposal,
  step,
  totalTargets,
  updatedDetailMd = '',
}) {
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackError, setFeedbackError] = useState('')
  const stageCopy = getStageCopy(step)
  const progressLabel = `${Math.min(currentDetailIndex + 1, totalTargets)} of ${totalTargets}`
  const detailMode = getDetailMode(currentTarget, proposal)
  const fileActionPresentation = getFileActionPresentation(detailMode)
  const sectionChanges = useMemo(() => buildSectionChanges(step, proposal), [proposal, step])
  const sectionSummary = useMemo(() => summarizeSectionChanges(sectionChanges), [sectionChanges])
  const [activePanel, setActivePanel] = useState(getDefaultPanel(detailMode))
  const tabs = buildTabConfig(detailMode)
  const isSubmittingChanges = isLoading && loadingAction === 'request-changes'
  const isApproving = isLoading && loadingAction === 'approve'
  const isSkipping = isLoading && loadingAction === 'skip'
  const backendReportedChanges = proposal?.file_action === 'update' || proposal?.file_action === 'delete'
  const hasPreviewDiff = previewDiff.trim() !== ''
  const hasChanges = backendReportedChanges && hasPreviewDiff
  const hasEmptyChangedDiff = backendReportedChanges && !hasPreviewDiff

  useEffect(() => {
    setFeedbackError('')
    setFeedbackText('')
  }, [attemptNumber, currentTarget?.uuid, step])

  useEffect(() => {
    setActivePanel(getDefaultPanel(detailMode))
  }, [detailMode, currentTarget?.uuid, step])

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
      <Group align="flex-start" justify="space-between" wrap="wrap">
        <Box>
          <Text className="eyebrow">Review Mode</Text>
          <Text className="review-panel-title">{stageCopy.title}</Text>
          <Text className="review-panel-subtitle">{stageCopy.subtitle}</Text>
        </Box>
        <Stack align="flex-end" className="review-header-actions" gap={8}>
          <Text className="review-progress-pill" data-testid="detail-review-progress">
            {progressLabel}
          </Text>
          <Text className="review-attempt-pill" data-testid="review-attempt-indicator">
            Attempt {attemptNumber}
          </Text>
          <Button
            data-testid="cancel-review-inline-button"
            disabled={isLoading}
            onClick={onDiscard}
            variant="default"
          >
            Cancel Sync
          </Button>
        </Stack>
      </Group>

      <Box className="review-decision-hero" mt="xl">
        <Group align="flex-start" justify="space-between" wrap="nowrap">
          <Box className="review-delta-copy">
            <Text className="review-delta-label">{stageCopy.targetLabel}</Text>
            <Text className="review-panel-headline">{currentTarget.summary}</Text>
            <Group className="review-chip-row" gap="xs" mt="sm">
              <Text className="review-chip">{currentTarget.uuid}</Text>
              <Text className="review-chip">{currentTarget.file}</Text>
              <Text className="review-chip">{currentTarget.delta_action}</Text>
            </Group>
          </Box>
          <Text className={fileActionPresentation.badgeClassName}>{fileActionPresentation.label}</Text>
        </Group>
        <Text className="review-summary-copy" mt="md">{fileActionPresentation.summary}</Text>
      </Box>

      <Box className="review-metric-strip" mt="md">
        <Box className="review-metric-pill">
          <Text className="review-highlight-kicker">Review focus</Text>
          <Text className="review-doc-bullet-copy">{currentTarget.update_context}</Text>
        </Box>
        <Box className="review-metric-pill">
          <Text className="review-highlight-kicker">Sections touched</Text>
          <Text className="review-doc-bullet-copy">{sectionSummary.sectionsTouched}</Text>
        </Box>
        {currentTarget.provenance_summary ? (
          <Box className="review-metric-pill">
            <Text className="review-highlight-kicker">Provenance impact</Text>
            <Text className="review-doc-bullet-copy">{currentTarget.provenance_summary}</Text>
          </Box>
        ) : null}
      </Box>

      <Box className="review-workspace-panel" mt="xl">
        <Tabs className="review-detail-tabs" onChange={(value) => setActivePanel(value ?? getDefaultPanel(detailMode))} value={activePanel}>
          <Tabs.List>
            {tabs.map((tab) => (
              <Tabs.Tab key={tab.value} value={tab.value}>
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>

          {tabs.some((tab) => tab.value === 'decision') ? (
            <Tabs.Panel pt="md" value="decision">
              <DecisionSummaryTab
                currentTarget={currentTarget}
                detailMode={detailMode}
                fileActionPresentation={fileActionPresentation}
                proposal={proposal}
                sectionSummary={sectionSummary}
              />
            </Tabs.Panel>
          ) : null}

          {tabs.some((tab) => tab.value === 'changes') ? (
            <Tabs.Panel pt="md" value="changes">
              <ChangeSummaryTab changes={sectionChanges} detailMode={detailMode} />
            </Tabs.Panel>
          ) : null}

          {tabs.some((tab) => tab.value === 'proposed') ? (
            <Tabs.Panel pt="md" value="proposed">
              <ReviewMarkdownDocument
                emptyCopy={detailMode === 'delete'
                  ? 'Approving this proposal removes the file from the world model.'
                  : 'No proposed markdown was returned for this dossier.'}
                fallbackTitle={currentTarget.summary}
                filePath={currentTarget.file}
                label={detailMode === 'create' ? 'Proposed first dossier' : 'Proposed revised dossier'}
                markdown={detailMode === 'delete' ? '' : updatedDetailMd}
                statusLabel="Proposed"
                statusTone={detailMode === 'create' ? 'create' : 'update'}
                testId="detail-proposed-markdown"
              />
            </Tabs.Panel>
          ) : null}

          {tabs.some((tab) => tab.value === 'current') ? (
            <Tabs.Panel pt="md" value="current">
              <ReviewMarkdownDocument
                emptyCopy={detailMode === 'create'
                  ? 'No current dossier exists yet. Review the proposed markdown as the first canonical file.'
                  : 'No current markdown is available for this dossier.'}
                fallbackTitle={currentTarget.summary}
                filePath={currentTarget.file}
                label={detailMode === 'create' ? 'Current scaffold' : 'Current dossier'}
                markdown={currentDetailMd}
                statusLabel="Current"
                statusTone="update"
                testId="detail-current-markdown"
              />
            </Tabs.Panel>
          ) : null}

          {tabs.some((tab) => tab.value === 'diff') ? (
            <Tabs.Panel pt="md" value="diff">
              <DiffTab
                hasChanges={hasChanges}
                hasEmptyChangedDiff={hasEmptyChangedDiff}
                previewDiff={previewDiff}
              />
            </Tabs.Panel>
          ) : null}
        </Tabs>
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
          placeholder="Reference the active tab and explain what is wrong, unsupported, or too broad."
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
          Approve stages the reviewed markdown, skip leaves the current detail untouched, and canceling discards the entire sync.
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
  currentDetailMd: PropTypes.string,
  currentTarget: PropTypes.shape({
    delta_action: PropTypes.string.isRequired,
    file: PropTypes.string.isRequired,
    provenance_summary: PropTypes.string,
    summary: PropTypes.string.isRequired,
    update_context: PropTypes.string.isRequired,
    uuid: PropTypes.string.isRequired,
  }).isRequired,
  error: PropTypes.string,
  isLoading: PropTypes.bool.isRequired,
  loadingAction: PropTypes.oneOf(['approve', 'proposal', 'request-changes', 'skip']),
  onApprove: PropTypes.func.isRequired,
  onDiscard: PropTypes.func.isRequired,
  onRequestChanges: PropTypes.func.isRequired,
  onSkip: PropTypes.func.isRequired,
  previewDiff: PropTypes.string.isRequired,
  proposal: PropTypes.shape({
    file_action: PropTypes.oneOf(['no_change', 'update', 'delete']).isRequired,
    rationale: PropTypes.string.isRequired,
    retention_reason: PropTypes.string,
  }).isRequired,
  step: PropTypes.oneOf(DETAIL_REVIEW_STEP_VALUES).isRequired,
  totalTargets: PropTypes.number.isRequired,
  updatedDetailMd: PropTypes.string,
}

export default DetailReviewStep
