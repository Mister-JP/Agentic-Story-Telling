import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import SyncReviewPanel from '../../src/components/SyncReviewPanel.jsx'

function renderPanel(reviewSession, handlers = {}) {
  return render(
    <MantineProvider>
      <SyncReviewPanel
        onApprove={vi.fn()}
        onComplete={vi.fn()}
        onContinue={vi.fn()}
        onRequestChanges={vi.fn()}
        onSelectionChange={vi.fn()}
        onRetry={vi.fn()}
        onSkip={vi.fn()}
        reviewSession={reviewSession}
        {...handlers}
      />
    </MantineProvider>,
  )
}

describe('SyncReviewPanel', () => {
  it('renders nothing when review mode is active before a session exists', () => {
    renderPanel(null)

    expect(screen.queryByTestId('review-loading-state')).not.toBeInTheDocument()
    expect(screen.queryByTestId('events-index-review')).not.toBeInTheDocument()
  })

  it('renders nothing when the session has no proposal, is not loading, and has no error', () => {
    renderPanel({
      attemptNumber: 0,
      currentProposal: null,
      error: null,
      isLoading: false,
      loadingAction: null,
      step: 'events-index',
    })

    expect(screen.queryByTestId('review-loading-state')).not.toBeInTheDocument()
    expect(screen.queryByTestId('review-error-state')).not.toBeInTheDocument()
    expect(screen.queryByTestId('events-index-review')).not.toBeInTheDocument()
  })

  it('renders the diff preview step before the first proposal request', () => {
    renderPanel({
      attemptNumber: 0,
      changedFiles: [
        {
          diffText: '--- a/story-structure/chapter-07.story\n+++ b/story-structure/chapter-07.story',
          fileId: 'chapter-07',
          fileName: 'chapter-07.story',
          filePath: 'story-structure/chapter-07.story',
          status: 'modified',
        },
      ],
      currentProposal: null,
      error: null,
      isLoading: false,
      loadingAction: null,
      selectedFileIds: ['chapter-07'],
      step: 'diff-preview',
    })

    expect(screen.getByTestId('diff-preview-review')).toBeInTheDocument()
    expect(screen.getByTestId('continue-diff-preview-button')).toBeEnabled()
    expect(screen.getByTestId('diff-preview-file-checkbox-chapter-07')).toBeChecked()
  })

  it('disables continue when no diff-preview files are selected', () => {
    renderPanel({
      attemptNumber: 0,
      changedFiles: [
        {
          diffText: '--- a/story-structure/chapter-07.story\n+++ b/story-structure/chapter-07.story',
          fileId: 'chapter-07',
          fileName: 'chapter-07.story',
          filePath: 'story-structure/chapter-07.story',
          status: 'modified',
        },
      ],
      currentProposal: null,
      error: null,
      isLoading: false,
      loadingAction: null,
      selectedFileIds: [],
      step: 'diff-preview',
    })

    expect(screen.getByTestId('continue-diff-preview-button')).toBeDisabled()
  })

  it('renders the event review summary from scan_summary', () => {
    renderPanel({
      attemptNumber: 1,
      currentProposal: {
        scan_summary: 'Event summary from the scan',
        diff_summary: 'This should not render',
        deltas: [],
      },
      error: null,
      isLoading: false,
      loadingAction: null,
      step: 'events-index',
    })

    expect(screen.getByTestId('events-index-review')).toBeInTheDocument()
    expect(screen.getByText('AI Scan Summary')).toBeInTheDocument()
    expect(screen.getByText('Event summary from the scan')).toBeInTheDocument()
    expect(screen.queryByText('Diff Summary')).not.toBeInTheDocument()
  })

  it('renders the elements review state when the current step is elements-index', () => {
    renderPanel({
      attemptNumber: 2,
      currentProposal: {
        diff_summary: 'Deterministic summary',
        scan_summary: 'This should not render',
        rationale: 'Deterministic rationale',
        identified_elements: [
          {
            display_name: 'Cloth Bundle',
            kind: 'item',
            aliases: ['cloth bundle'],
            identification_keys: ['altar evidence'],
            snapshot: 'Tracked bundle.',
            update_instruction: 'Create the bundle.',
            evidence_from_diff: ['A cloth bundle rested at the altar.'],
            matched_existing_display_name: null,
            matched_existing_uuid: null,
            is_new: true,
          },
        ],
        approval_message: 'Review the proposal.',
      },
      error: null,
      isLoading: false,
      loadingAction: null,
      step: 'elements-index',
    })

    expect(screen.getByTestId('elements-index-review')).toBeInTheDocument()
    expect(screen.getByText('Elements Index')).toBeInTheDocument()
    expect(screen.getByText('Diff Summary')).toBeInTheDocument()
    expect(screen.getByText('Deterministic summary')).toBeInTheDocument()
    expect(screen.getByText('Deterministic rationale')).toBeInTheDocument()
    expect(screen.queryByText('AI Scan Summary')).not.toBeInTheDocument()
  })

  it('renders the events review summary when deltas are missing', () => {
    renderPanel({
      attemptNumber: 1,
      currentProposal: {
        scan_summary: 'Event summary from the scan',
      },
      error: null,
      isLoading: false,
      loadingAction: null,
      step: 'events-index',
    })

    expect(screen.getByTestId('events-index-review')).toBeInTheDocument()
    expect(screen.getByText('Event summary from the scan')).toBeInTheDocument()
    expect(screen.queryByTestId('event-delta-card')).not.toBeInTheDocument()
  })

  it('renders the elements review summary when identified_elements are missing', () => {
    renderPanel({
      attemptNumber: 1,
      currentProposal: {
        diff_summary: 'Deterministic summary',
        rationale: 'Deterministic rationale',
        approval_message: 'Review the proposal.',
      },
      error: null,
      isLoading: false,
      loadingAction: null,
      step: 'elements-index',
    })

    expect(screen.getByTestId('elements-index-review')).toBeInTheDocument()
    expect(screen.getByText('Deterministic summary')).toBeInTheDocument()
    expect(screen.getByText('Deterministic rationale')).toBeInTheDocument()
    expect(screen.queryByTestId('element-decision-card')).not.toBeInTheDocument()
  })

  it('renders the detail review state for element detail targets', () => {
    renderPanel({
      attemptNumber: 2,
      currentDetailIndex: 1,
      currentPreviewDiff: '--- a/elements/elt_stub123.md\n+++ b/elements/elt_stub123.md',
      currentProposal: {
        changed: true,
        rationale: 'Adds a chronology entry.',
      },
      detailTargets: [
        {
          uuid: 'elt_stub123',
          summary: 'Cloth Bundle',
          file: 'elements/elt_stub123.md',
          delta_action: 'create',
          update_context: 'Create the detail dossier.',
        },
        {
          uuid: 'elt_mira123',
          summary: 'Mira',
          file: 'elements/elt_mira123.md',
          delta_action: 'update',
          update_context: 'Tighten the chronology.',
        },
      ],
      error: null,
      isLoading: false,
      loadingAction: null,
      step: 'element-details',
    })

    expect(screen.getByTestId('element-detail-review')).toBeInTheDocument()
    expect(screen.getByTestId('detail-review-progress')).toHaveTextContent('2 of 2')
    expect(screen.getByTestId('detail-diff-viewer')).toBeInTheDocument()
  })

  it('shows a no-change message instead of a blank diff for detail review', () => {
    renderPanel({
      attemptNumber: 1,
      currentDetailIndex: 0,
      currentPreviewDiff: '',
      currentProposal: {
        changed: false,
        rationale: 'Nothing in the diff affects this file.',
      },
      detailTargets: [
        {
          uuid: 'evt_stub123',
          summary: 'Chapel arrival',
          file: 'events/evt_stub123.md',
          delta_action: 'update',
          update_context: 'No change needed.',
        },
      ],
      error: null,
      isLoading: false,
      loadingAction: null,
      step: 'event-details',
    })

    expect(screen.getByTestId('event-detail-review')).toBeInTheDocument()
    expect(screen.getByTestId('detail-no-change-message')).toBeInTheDocument()
  })

  it('shows a warning when the backend reports changes but the preview diff is empty', () => {
    renderPanel({
      attemptNumber: 1,
      currentDetailIndex: 0,
      currentPreviewDiff: '   ',
      currentProposal: {
        changed: true,
        rationale: 'The generated markdown changed shape even though the diff is blank.',
      },
      detailTargets: [
        {
          uuid: 'evt_stub123',
          summary: 'Chapel arrival',
          file: 'events/evt_stub123.md',
          delta_action: 'update',
          update_context: 'Investigate the blank diff.',
        },
      ],
      error: null,
      isLoading: false,
      loadingAction: null,
      step: 'event-details',
    })

    expect(screen.getByTestId('detail-empty-diff-warning-title')).toBeInTheDocument()
    expect(screen.queryByTestId('detail-no-change-message')).not.toBeInTheDocument()
  })

  it('renders the sync-complete summary and returns through onComplete', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()

    renderPanel({
      completedSyncAt: '2026-03-25T14:30:00.000Z',
      detailResults: {
        elt_bundle123: { action: 'approved', updatedMd: '# Approved cloth bundle detail' },
        elt_lantern456: { action: 'skipped' },
        evt_stub123: { action: 'approved', updatedMd: '# Approved event detail' },
      },
      elementDetailTargets: [
        { uuid: 'elt_bundle123' },
        { uuid: 'elt_lantern456' },
      ],
      eventDetailTargets: [
        { uuid: 'evt_stub123' },
      ],
      step: 'complete',
      updatedElementsState: {
        actions: [
          'Created element elt_bundle123: Cloth Bundle (item).',
          'Updated element elt_lantern456: Lantern.',
        ],
      },
      updatedEventsState: {
        actions: [
          'Created event evt_stub123: Chapel arrival.',
        ],
      },
    }, { onComplete })

    expect(screen.getByTestId('sync-complete-step')).toBeInTheDocument()
    expect(screen.getByTestId('sync-complete-elements-summary')).toHaveTextContent('1 created')
    expect(screen.getByTestId('sync-complete-elements-summary')).toHaveTextContent('1 updated')
    expect(screen.getByTestId('sync-complete-element-details-summary')).toHaveTextContent('1 detail pages updated')
    expect(screen.getByTestId('sync-complete-element-details-summary')).toHaveTextContent('1 detail pages skipped')

    await user.click(screen.getByTestId('return-to-world-view-button'))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
