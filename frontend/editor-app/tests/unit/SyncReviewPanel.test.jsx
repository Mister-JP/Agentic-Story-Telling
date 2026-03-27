import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import SyncReviewPanel from '../../src/components/SyncReviewPanel.jsx'

function renderPanel(reviewSession) {
  return render(
    <MantineProvider>
      <SyncReviewPanel
        onApprove={vi.fn()}
        onRequestChanges={vi.fn()}
        onRetry={vi.fn()}
        reviewSession={reviewSession}
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

  it.each(['diff-preview', 'element-details', 'event-details', 'complete'])(
    'renders nothing for non-index review step %s',
    (step) => {
      renderPanel({
        attemptNumber: 2,
        currentProposal: {
          diff_summary: 'Deterministic summary',
          scan_summary: 'Event summary',
          deltas: [],
          identified_elements: [],
          rationale: 'Deterministic rationale',
        },
        error: 'Should stay hidden',
        isLoading: true,
        loadingAction: 'proposal',
        step,
      })

      expect(screen.queryByTestId('review-loading-state')).not.toBeInTheDocument()
      expect(screen.queryByTestId('review-error-state')).not.toBeInTheDocument()
      expect(screen.queryByTestId('events-index-review')).not.toBeInTheDocument()
      expect(screen.queryByTestId('elements-index-review')).not.toBeInTheDocument()
    },
  )
})
