import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import SyncReviewPanel from '../../src/components/SyncReviewPanel.jsx'

describe('SyncReviewPanel', () => {
  it('renders nothing when review mode is active before a session exists', () => {
    render(
      <MantineProvider>
        <SyncReviewPanel
          onApprove={vi.fn()}
          onRequestChanges={vi.fn()}
          onRetry={vi.fn()}
          reviewSession={null}
        />
      </MantineProvider>,
    )

    expect(screen.queryByTestId('review-loading-state')).not.toBeInTheDocument()
    expect(screen.queryByTestId('events-index-review')).not.toBeInTheDocument()
  })

  it('renders nothing when the session has no proposal, is not loading, and has no error', () => {
    render(
      <MantineProvider>
        <SyncReviewPanel
          onApprove={vi.fn()}
          onRequestChanges={vi.fn()}
          onRetry={vi.fn()}
          reviewSession={{
            attemptNumber: 0,
            currentProposal: null,
            error: null,
            isLoading: false,
            loadingAction: null,
          }}
        />
      </MantineProvider>,
    )

    expect(screen.queryByTestId('review-loading-state')).not.toBeInTheDocument()
    expect(screen.queryByTestId('review-error-state')).not.toBeInTheDocument()
    expect(screen.queryByTestId('events-index-review')).not.toBeInTheDocument()
  })
})
