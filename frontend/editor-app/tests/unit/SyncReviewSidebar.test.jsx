import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import SyncReviewSidebar from '../../src/components/SyncReviewSidebar.jsx'

function renderSidebar(reviewSession) {
  return render(
    <MantineProvider>
      <SyncReviewSidebar onDiscard={vi.fn()} reviewSession={reviewSession} />
    </MantineProvider>,
  )
}

describe('SyncReviewSidebar', () => {
  it('shows attempt 1 while the first events proposal is loading', () => {
    renderSidebar({
      attemptNumber: 1,
      changedFiles: [{ fileId: 'chapter-08' }],
      isLoading: true,
      selectedFileIds: ['chapter-08'],
      step: 'events-index',
    })

    expect(screen.getByText('Current attempt: 1')).toBeInTheDocument()
  })

  it('disables discard while a review action is loading', () => {
    renderSidebar({
      attemptNumber: 1,
      changedFiles: [{ fileId: 'chapter-08' }],
      isLoading: true,
      selectedFileIds: ['chapter-08'],
      step: 'events-index',
    })

    expect(screen.getByTestId('discard-review-button')).toBeDisabled()
  })

  it('keeps discard enabled while review is idle', () => {
    renderSidebar({
      attemptNumber: 1,
      changedFiles: [{ fileId: 'chapter-08' }],
      isLoading: false,
      selectedFileIds: ['chapter-08'],
      step: 'elements-index',
    })

    expect(screen.getByTestId('discard-review-button')).toBeEnabled()
  })

  it('shows the elements step as active during stage 2 review', () => {
    renderSidebar({
      attemptNumber: 2,
      changedFiles: [{ fileId: 'chapter-08' }],
      isLoading: false,
      selectedFileIds: ['chapter-08'],
      step: 'elements-index',
    })

    expect(screen.getByText('Elements Index')).toBeInTheDocument()
    expect(screen.getByText('Approved and staged')).toBeInTheDocument()
  })

  it('keeps both index steps pending during diff preview', () => {
    renderSidebar({
      attemptNumber: 0,
      changedFiles: [{ fileId: 'chapter-08' }],
      isLoading: false,
      selectedFileIds: ['chapter-08'],
      step: 'diff-preview',
    })

    expect(screen.getAllByText('Waiting to begin')).toHaveLength(2)
    expect(screen.queryByText('Approve or request changes')).not.toBeInTheDocument()
    expect(screen.queryByText('Approved and staged')).not.toBeInTheDocument()
  })

  it.each(['element-details', 'event-details', 'complete'])(
    'marks both index steps completed after index review reaches %s',
    (step) => {
      renderSidebar({
        attemptNumber: 2,
        changedFiles: [{ fileId: 'chapter-08' }],
        isLoading: false,
        selectedFileIds: ['chapter-08'],
        step,
      })

      expect(screen.getAllByText('Approved and staged')).toHaveLength(2)
      expect(screen.queryByText('Approve or request changes')).not.toBeInTheDocument()
      expect(screen.queryByText('Waiting to begin')).not.toBeInTheDocument()
    },
  )
})
