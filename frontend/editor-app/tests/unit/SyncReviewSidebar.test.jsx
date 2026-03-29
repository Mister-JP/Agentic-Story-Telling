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

    expect(screen.getByText('Selection confirmed')).toBeInTheDocument()
    expect(screen.getByText('Elements Index')).toBeInTheDocument()
    expect(screen.getByText('Approved and staged')).toBeInTheDocument()
  })

  it('shows detail step counters once the session reaches element detail review', () => {
    renderSidebar({
      attemptNumber: 1,
      changedFiles: [{ fileId: 'chapter-08' }],
      detailResults: {
        elt_stub123: { action: 'approved', updatedMd: '# Approved detail' },
      },
      elementDetailTargets: [
        {
          uuid: 'elt_stub123',
        },
        {
          uuid: 'elt_mira123',
        },
      ],
      eventDetailTargets: [
        {
          uuid: 'evt_stub123',
        },
      ],
      isLoading: false,
      selectedFileIds: ['chapter-08'],
      step: 'element-details',
    })

    expect(screen.getByText('Element Details (1/2)')).toBeInTheDocument()
    expect(screen.getByText('Event Details (0/1)')).toBeInTheDocument()
  })

  it('shows Select Changes as active while the review is in diff preview', () => {
    renderSidebar({
      attemptNumber: 0,
      changedFiles: [{ fileId: 'chapter-08' }],
      isLoading: false,
      selectedFileIds: ['chapter-08'],
      step: 'diff-preview',
    })

    expect(screen.getByText('Select Changes')).toBeInTheDocument()
    expect(screen.getByText('Choose files to include')).toBeInTheDocument()
    expect(screen.getAllByText('Waiting to begin')).toHaveLength(4)
    expect(screen.queryByText('Approve or request changes')).not.toBeInTheDocument()
    expect(screen.queryByText('Approved and staged')).not.toBeInTheDocument()
  })

  it.each([
    ['element-details', 2],
    ['event-details', 3],
    ['complete', 4],
  ])(
    'marks completed steps correctly after review reaches %s',
    (step, completedCount) => {
      renderSidebar({
        attemptNumber: 2,
        changedFiles: [{ fileId: 'chapter-08' }],
        detailResults: {},
        elementDetailTargets: [],
        eventDetailTargets: [],
        isLoading: false,
        selectedFileIds: ['chapter-08'],
        step,
      })

      expect(screen.getAllByText('Approved and staged')).toHaveLength(completedCount)
      if (step === 'element-details') {
        expect(screen.getAllByText('Waiting to begin')).toHaveLength(1)
      } else {
        expect(screen.queryByText('Waiting to begin')).not.toBeInTheDocument()
      }
    },
  )

  it.each([
    ['final-review', 'Ready to commit'],
    ['complete', 'Sync applied'],
  ])('hides cancel sync once the review reaches the %s step', (step, noteTitle) => {
    renderSidebar({
      attemptNumber: 2,
      changedFiles: [{ fileId: 'chapter-08' }],
      detailResults: {},
      elementDetailTargets: [],
      eventDetailTargets: [],
      isLoading: false,
      selectedFileIds: ['chapter-08'],
      step,
    })

    expect(screen.queryByTestId('discard-review-button')).not.toBeInTheDocument()
    expect(screen.getByText(noteTitle)).toBeInTheDocument()
  })
})
