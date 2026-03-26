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
  it('disables discard while a review action is loading', () => {
    renderSidebar({
      attemptNumber: 1,
      changedFiles: [{ fileId: 'chapter-08' }],
      isLoading: true,
      selectedFileIds: ['chapter-08'],
    })

    expect(screen.getByTestId('discard-review-button')).toBeDisabled()
  })

  it('keeps discard enabled while review is idle', () => {
    renderSidebar({
      attemptNumber: 1,
      changedFiles: [{ fileId: 'chapter-08' }],
      isLoading: false,
      selectedFileIds: ['chapter-08'],
    })

    expect(screen.getByTestId('discard-review-button')).toBeEnabled()
  })
})
