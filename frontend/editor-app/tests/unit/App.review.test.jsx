import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import App from '../../src/App.jsx'

vi.mock('@mantine/hooks', async () => {
  const React = await import('react')

  return {
    useLocalStorage: ({ defaultValue }) => React.useState(defaultValue),
  }
})

vi.mock('browser-fs-access', () => ({
  fileOpen: vi.fn(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
  fileSave: vi.fn(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
}))

vi.mock('../../src/components/EditorPane.jsx', () => ({
  default: () => null,
}))

vi.mock('../../src/components/Sidebar.jsx', () => ({
  default: function SidebarStub({ onDiscardReview, onStartSync, reviewSession, syncButtonDisabled }) {
    return (
      <aside data-testid="sidebar-stub">
        <button
          data-testid="sidebar-start-sync"
          disabled={syncButtonDisabled}
          onClick={onStartSync}
          type="button"
        >
          Start sync
        </button>
        {reviewSession ? (
          <button data-testid="discard-review-button" onClick={onDiscardReview} type="button">
            Discard review
          </button>
        ) : null}
      </aside>
    )
  },
}))

vi.mock('../../src/components/WorldPanel.jsx', () => ({
  default: function WorldPanelStub({ worldModel }) {
    const events = worldModel?.events?.entries ?? []

    return (
      <section data-testid="world-panel-stub">
        <div data-testid="world-panel-event-count">{events.length}</div>
        {events.map((entry) => (
          <div key={entry.uuid}>{`${entry.summary} (event)`}</div>
        ))}
      </section>
    )
  },
}))

function buildProposal(summary, reason) {
  return {
    scan_summary: summary,
    deltas: [
      {
        action: 'create',
        existing_event_uuid: null,
        when: 'June 28, 1998, 7:15 a.m.',
        chapters: 'Chapter 8',
        summary,
        reason,
        evidence_from_diff: ['She noticed the altar cloth.'],
      },
    ],
  }
}

function createDeferred() {
  let resolve
  let reject

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

function renderApp() {
  return render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  )
}

describe('App review flow', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends feedback history on the second events propose attempt and applies the approved result', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildProposal('First stub event', 'Initial pass'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildProposal('Revised stub event', 'Revised after feedback'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          actions: ['Created event evt_stub123.'],
          detail_files: {
            evt_stub123: '# Revised stub event\n\n## Core Understanding\nStub detail\n',
          },
          events_md: '# Events\n\n## Entries\n- evt_stub123 | June 28, 1998 | Chapter 8 | Revised stub event\n',
        }),
      })

    renderApp()

    await user.click(screen.getByTestId('sidebar-start-sync'))
    await screen.findByTestId('events-index-review')

    await user.type(
      screen.getByTestId('review-feedback-input'),
      'The timing needs to be tighter.',
    )
    await user.click(screen.getByTestId('request-changes-button'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(screen.getByTestId('review-attempt-indicator')).toHaveTextContent('Attempt 2')
    })

    const secondRequest = JSON.parse(fetch.mock.calls[1][1].body)
    expect(secondRequest.history).toHaveLength(1)
    expect(secondRequest.history[0].attempt_number).toBe(1)
    expect(secondRequest.history[0].reviewer_feedback).toBe('The timing needs to be tighter.')
    expect(secondRequest.history[0].previous_output).toContain('First stub event')

    await user.click(screen.getByTestId('approve-events-index-button'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(3)
    })
    await waitFor(() => {
      expect(screen.queryByTestId('events-index-review')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('world-panel-event-count')).toHaveTextContent('1')
    expect(screen.getByTestId('project-status-message')).toHaveTextContent(
      'World model updated from the events review.',
    )
    expect(screen.getByText('Revised stub event (event)')).toBeInTheDocument()
  })

  it('keeps button copy neutral while request changes is loading', async () => {
    const user = userEvent.setup()
    const secondProposalResponse = createDeferred()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildProposal('First stub event', 'Initial pass'),
        }),
      })
      .mockImplementationOnce(() => secondProposalResponse.promise)

    renderApp()

    await user.click(screen.getByTestId('sidebar-start-sync'))
    await screen.findByTestId('events-index-review')

    await user.type(
      screen.getByTestId('review-feedback-input'),
      'The timing needs to be tighter.',
    )
    await user.click(screen.getByTestId('request-changes-button'))

    expect(screen.getByTestId('request-changes-button')).toHaveTextContent('Submitting...')
    expect(screen.getByTestId('approve-events-index-button')).toHaveTextContent('Loading...')

    secondProposalResponse.resolve({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        proposal: buildProposal('Revised stub event', 'Revised after feedback'),
      }),
    })

    await waitFor(() => {
      expect(screen.getByTestId('review-attempt-indicator')).toHaveTextContent('Attempt 2')
    })
  })

  it('does not retain failed reviewer feedback in history for the next retry', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildProposal('First stub event', 'Initial pass'),
        }),
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildProposal('Recovered proposal', 'Retry after failed feedback'),
        }),
      })

    renderApp()

    await user.click(screen.getByTestId('sidebar-start-sync'))
    await screen.findByTestId('events-index-review')

    await user.type(
      screen.getByTestId('review-feedback-input'),
      'First feedback should not stick.',
    )
    await user.click(screen.getByTestId('request-changes-button'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(screen.getByText('Could not reach the backend. Please try again.')).toBeInTheDocument()
    })
    expect(screen.getByTestId('review-attempt-indicator')).toHaveTextContent('Attempt 1')

    await user.clear(screen.getByTestId('review-feedback-input'))
    await user.type(
      screen.getByTestId('review-feedback-input'),
      'Second feedback should be the only history entry.',
    )
    await user.click(screen.getByTestId('request-changes-button'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(3)
    })

    const recoveredRequest = JSON.parse(fetch.mock.calls[2][1].body)
    expect(recoveredRequest.history).toHaveLength(1)
    expect(recoveredRequest.history[0].attempt_number).toBe(1)
    expect(recoveredRequest.history[0].reviewer_feedback).toBe(
      'Second feedback should be the only history entry.',
    )
    expect(recoveredRequest.history[0].previous_output).toContain('First stub event')
    expect(recoveredRequest.history[0].reviewer_feedback).not.toContain('First feedback should not stick.')

    await waitFor(() => {
      expect(screen.getByTestId('review-attempt-indicator')).toHaveTextContent('Attempt 2')
    })
  })

  it('ignores an in-flight apply result after the review is discarded', async () => {
    const user = userEvent.setup()
    const applyResponse = createDeferred()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildProposal('Discarded proposal', 'Initial pass'),
        }),
      })
      .mockImplementationOnce(() => applyResponse.promise)

    renderApp()

    await user.click(screen.getByTestId('sidebar-start-sync'))
    await screen.findByTestId('events-index-review')

    await user.click(screen.getByTestId('approve-events-index-button'))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    await user.click(screen.getByTestId('discard-review-button'))
    await waitFor(() => {
      expect(screen.queryByTestId('events-index-review')).not.toBeInTheDocument()
    })

    applyResponse.resolve({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        actions: ['Created event evt_discarded.'],
        detail_files: {
          evt_discarded: '# Discarded proposal\n\n## Core Understanding\nShould never be applied.\n',
        },
        events_md: '# Events\n\n## Entries\n- evt_discarded | June 28, 1998 | Chapter 8 | Discarded proposal\n',
      }),
    })

    await waitFor(() => {
      expect(screen.getByTestId('world-panel-event-count')).toHaveTextContent('0')
    })
    expect(screen.queryByTestId('project-status-message')).not.toBeInTheDocument()
    expect(screen.queryByText('Discarded proposal (event)')).not.toBeInTheDocument()
  })

  it('does not crash when request changes is discarded before the retry resolves', async () => {
    const user = userEvent.setup()
    const secondProposalResponse = createDeferred()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildProposal('First stub event', 'Initial pass'),
        }),
      })
      .mockImplementationOnce(() => secondProposalResponse.promise)

    renderApp()

    await user.click(screen.getByTestId('sidebar-start-sync'))
    await screen.findByTestId('events-index-review')

    await user.type(
      screen.getByTestId('review-feedback-input'),
      'The timing needs to be tighter.',
    )
    await user.click(screen.getByTestId('request-changes-button'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    await user.click(screen.getByTestId('discard-review-button'))
    await waitFor(() => {
      expect(screen.queryByTestId('events-index-review')).not.toBeInTheDocument()
    })

    secondProposalResponse.resolve({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        proposal: buildProposal('Revised stub event', 'Revised after feedback'),
      }),
    })

    await waitFor(() => {
      expect(screen.getByTestId('world-panel-event-count')).toHaveTextContent('0')
    })
    expect(screen.queryByText('Revised stub event (event)')).not.toBeInTheDocument()
  })

  it('ignores a stale request-changes response when a second request starts before the first settles', async () => {
    const user = userEvent.setup()
    const firstRetryResponse = createDeferred()
    const secondRetryResponse = createDeferred()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildProposal('First stub event', 'Initial pass'),
        }),
      })
      .mockImplementationOnce(() => firstRetryResponse.promise)
      .mockImplementationOnce(() => secondRetryResponse.promise)

    renderApp()

    await user.click(screen.getByTestId('sidebar-start-sync'))
    await screen.findByTestId('events-index-review')

    await user.type(
      screen.getByTestId('review-feedback-input'),
      'The timing needs to be tighter.',
    )

    const requestChangesButton = screen.getByTestId('request-changes-button')
    requestChangesButton.click()
    requestChangesButton.click()

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(3)
    })

    secondRetryResponse.resolve({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        proposal: buildProposal('Second retry wins', 'Latest feedback'),
      }),
    })

    await waitFor(() => {
      expect(screen.getAllByText('Second retry wins').length).toBeGreaterThan(0)
    })
    expect(screen.getByTestId('review-attempt-indicator')).toHaveTextContent('Attempt 2')

    firstRetryResponse.resolve({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        proposal: buildProposal('First retry loses', 'Stale response'),
      }),
    })

    await waitFor(() => {
      expect(screen.getAllByText('Second retry wins').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('First retry loses')).not.toBeInTheDocument()
  })
})
