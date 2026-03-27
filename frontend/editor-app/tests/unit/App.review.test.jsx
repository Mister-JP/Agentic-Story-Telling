import { act, render, screen, waitFor, within } from '@testing-library/react'
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
    const elements = worldModel?.elements?.entries ?? []
    const events = worldModel?.events?.entries ?? []

    return (
      <section data-testid="world-panel-stub">
        <div data-testid="world-panel-element-count">{elements.length}</div>
        <div data-testid="world-panel-event-count">{events.length}</div>
        {elements.map((entry) => (
          <div key={entry.uuid}>{`${entry.display_name} (${entry.kind})`}</div>
        ))}
        {events.map((entry) => (
          <div key={entry.uuid}>{`${entry.summary} (event)`}</div>
        ))}
      </section>
    )
  },
}))

function buildEventProposal(summary, reason) {
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

function buildElementsProposal(displayName, options = {}) {
  return {
    diff_summary: options.diffSummary ?? `${displayName} proposal summary`,
    rationale: options.rationale ?? `${displayName} proposal rationale`,
    identified_elements: [
      {
        display_name: displayName,
        kind: options.kind ?? 'item',
        aliases: options.aliases ?? ['cloth bundle'],
        identification_keys: options.identificationKeys ?? ['altar evidence'],
        snapshot: options.snapshot ?? `${displayName} matters to the world model.`,
        update_instruction: options.updateInstruction ?? `Track ${displayName} in detail review.`,
        evidence_from_diff: options.evidence ?? ['A cloth bundle rested at the altar.'],
        matched_existing_display_name: options.matchedExistingDisplayName ?? null,
        matched_existing_uuid: options.matchedExistingUuid ?? null,
        is_new: options.isNew ?? true,
      },
    ],
    approval_message: options.approvalMessage ?? 'Review the element proposal.',
  }
}

function buildEventsApplyResponse(summary) {
  return {
    actions: ['Created event evt_stub123.'],
    detail_files: {
      evt_stub123: '# Revised stub event\n\n## Core Understanding\nStub detail\n',
    },
    events_md: `# Events\n\n## Entries\n- evt_stub123 | June 28, 1998 | Chapter 8 | ${summary}\n`,
  }
}

function buildElementsApplyResponse(displayName) {
  return {
    actions: [`Created element elt_bundle123: ${displayName} (item).`],
    detail_files: {
      elt_bundle123: `# ${displayName}\n\n## Core Understanding\nStub detail\n`,
    },
    elements_md: `# Elements\n\n## Entries\n- item | ${displayName} | elt_bundle123 | cloth bundle | altar evidence\n`,
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

  it('keeps events feedback history, advances to elements review, and commits only after stage 2 approval', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('First stub event', 'Initial pass'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('Revised stub event', 'Revised after feedback'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          ...buildEventsApplyResponse('Revised stub event'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildElementsProposal('Cloth Bundle'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          ...buildElementsApplyResponse('Cloth Bundle'),
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
      expect(fetch).toHaveBeenCalledTimes(4)
    })
    await waitFor(() => {
      expect(screen.getByTestId('elements-index-review')).toBeInTheDocument()
    })

    const elementsRequest = JSON.parse(fetch.mock.calls[3][1].body)
    expect(elementsRequest.history).toHaveLength(1)
    expect(elementsRequest.history[0].reviewer_feedback).toBe('The timing needs to be tighter.')
    expect(screen.getByTestId('review-attempt-indicator')).toHaveTextContent('Attempt 1')
    expect(
      within(screen.getByTestId('elements-index-review')).getByText('Cloth Bundle (item)'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('world-panel-stub')).not.toBeInTheDocument()
    expect(screen.queryByText('Revised stub event (event)')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('approve-elements-index-button'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(5)
    })
    await waitFor(() => {
      expect(screen.queryByTestId('elements-index-review')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('world-panel-element-count')).toHaveTextContent('1')
    expect(screen.getByTestId('world-panel-event-count')).toHaveTextContent('1')
    expect(screen.getByTestId('project-status-message')).toHaveTextContent(
      'World model updated from the review.',
    )
    expect(
      within(screen.getByTestId('world-panel-stub')).getByText('Cloth Bundle (item)'),
    ).toBeInTheDocument()
    expect(within(screen.getByTestId('world-panel-stub')).getByText('Revised stub event (event)')).toBeInTheDocument()
  })

  it('reuses carried events history when the first elements proposal fails and retry succeeds', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('First stub event', 'Initial pass'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('Revised stub event', 'Revised after feedback'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          ...buildEventsApplyResponse('Revised stub event'),
        }),
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildElementsProposal('Cloth Bundle'),
        }),
      })

    renderApp()

    await user.click(screen.getByTestId('sidebar-start-sync'))
    await screen.findByTestId('events-index-review')

    await user.type(
      screen.getByTestId('review-feedback-input'),
      'Carry this event context into the next stage.',
    )
    await user.click(screen.getByTestId('request-changes-button'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    await user.click(screen.getByTestId('approve-events-index-button'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(4)
    })
    await screen.findByTestId('review-error-state')

    const firstElementsRequest = JSON.parse(fetch.mock.calls[3][1].body)
    expect(firstElementsRequest.history).toHaveLength(1)
    expect(firstElementsRequest.history[0].reviewer_feedback).toBe(
      'Carry this event context into the next stage.',
    )

    await user.click(screen.getByTestId('retry-review-button'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(5)
    })
    await waitFor(() => {
      expect(screen.getByTestId('elements-index-review')).toBeInTheDocument()
    })

    const retryElementsRequest = JSON.parse(fetch.mock.calls[4][1].body)
    expect(retryElementsRequest.history).toHaveLength(1)
    expect(retryElementsRequest.history[0].reviewer_feedback).toBe(
      'Carry this event context into the next stage.',
    )
    expect(screen.getByTestId('review-attempt-indicator')).toHaveTextContent('Attempt 1')
  })

  it('keeps button copy neutral while request changes is loading', async () => {
    const user = userEvent.setup()
    const secondProposalResponse = createDeferred()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('First stub event', 'Initial pass'),
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
        proposal: buildEventProposal('Revised stub event', 'Revised after feedback'),
      }),
    })

    await waitFor(() => {
      expect(screen.getByTestId('review-attempt-indicator')).toHaveTextContent('Attempt 2')
    })
  })

  it('discards staged events output when the elements review is abandoned', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('First stub event', 'Initial pass'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          ...buildEventsApplyResponse('First stub event'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildElementsProposal('Cloth Bundle'),
        }),
      })

    renderApp()

    await user.click(screen.getByTestId('sidebar-start-sync'))
    await screen.findByTestId('events-index-review')

    await user.click(screen.getByTestId('approve-events-index-button'))
    await screen.findByTestId('elements-index-review')
    expect(screen.queryByText('First stub event (event)')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('discard-review-button'))

    await waitFor(() => {
      expect(screen.queryByTestId('elements-index-review')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('world-panel-event-count')).toHaveTextContent('0')
    expect(screen.getByTestId('world-panel-element-count')).toHaveTextContent('0')
    expect(screen.queryByText('First stub event (event)')).not.toBeInTheDocument()
    expect(screen.queryByText('Cloth Bundle (item)')).not.toBeInTheDocument()
  })

  it('does not retain failed reviewer feedback in history for the next retry', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('First stub event', 'Initial pass'),
        }),
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('Recovered proposal', 'Retry after failed feedback'),
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

  it('does not start overlapping elements apply requests when approve is double-invoked', async () => {
    const user = userEvent.setup()
    const elementsApplyResponse = createDeferred()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('First stub event', 'Initial pass'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          ...buildEventsApplyResponse('First stub event'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildElementsProposal('Cloth Bundle'),
        }),
      })
      .mockImplementationOnce(() => elementsApplyResponse.promise)

    renderApp()

    await user.click(screen.getByTestId('sidebar-start-sync'))
    await screen.findByTestId('events-index-review')

    await user.click(screen.getByTestId('approve-events-index-button'))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(3)
    })
    await screen.findByTestId('elements-index-review')

    const approveButton = screen.getByTestId('approve-elements-index-button')
    await act(async () => {
      approveButton.click()
      approveButton.click()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(4)
    })

    elementsApplyResponse.resolve({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        ...buildElementsApplyResponse('Cloth Bundle'),
      }),
    })

    await waitFor(() => {
      expect(screen.queryByTestId('elements-index-review')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('world-panel-element-count')).toHaveTextContent('1')
    expect(screen.getByTestId('project-status-message')).toHaveTextContent(
      'World model updated from the review.',
    )
  })

  it('ignores an in-flight apply result after the review is discarded', async () => {
    const user = userEvent.setup()
    const applyResponse = createDeferred()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('Discarded proposal', 'Initial pass'),
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
          proposal: buildEventProposal('First stub event', 'Initial pass'),
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
        proposal: buildEventProposal('Revised stub event', 'Revised after feedback'),
      }),
    })

    await waitFor(() => {
      expect(screen.getByTestId('world-panel-event-count')).toHaveTextContent('0')
    })
    expect(screen.queryByText('Revised stub event (event)')).not.toBeInTheDocument()
  })

  it('does not start overlapping request-changes requests when the button is double-clicked', async () => {
    const user = userEvent.setup()
    const retryResponse = createDeferred()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('First stub event', 'Initial pass'),
        }),
      })
      .mockImplementationOnce(() => retryResponse.promise)

    renderApp()

    await user.click(screen.getByTestId('sidebar-start-sync'))
    await screen.findByTestId('events-index-review')

    await user.type(
      screen.getByTestId('review-feedback-input'),
      'The timing needs to be tighter.',
    )

    const requestChangesButton = screen.getByTestId('request-changes-button')
    await act(async () => {
      requestChangesButton.click()
      requestChangesButton.click()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    retryResponse.resolve({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        proposal: buildEventProposal('Single retry wins', 'Latest feedback'),
      }),
    })

    await waitFor(() => {
      expect(screen.getAllByText('Single retry wins').length).toBeGreaterThan(0)
    })
    expect(screen.getByTestId('review-attempt-indicator')).toHaveTextContent('Attempt 2')
  })
})
