import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import App from '../../src/App.jsx'

let latestReviewPanelProps = null

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
  default: function SidebarStub({ onStartSync, syncButtonDisabled }) {
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
      </aside>
    )
  },
}))

vi.mock('../../src/components/WorldPanel.jsx', () => ({
  default: () => <section data-testid="world-panel-stub" />,
}))

vi.mock('../../src/components/SyncReviewPanel.jsx', () => ({
  default: function SyncReviewPanelStub(props) {
    latestReviewPanelProps = props

    if (!props.reviewSession) {
      return null
    }

    return (
      <section data-testid="review-panel-stub">
        {props.reviewSession.currentProposal?.scan_summary ?? props.reviewSession.error ?? 'loading'}
      </section>
    )
  },
}))

function buildProposal(summary) {
  return {
    scan_summary: summary,
    deltas: [],
  }
}

function createDeferred() {
  let resolve
  let reject

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, reject, resolve }
}

function renderApp() {
  return render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  )
}

describe('App retry flow', () => {
  beforeEach(() => {
    latestReviewPanelProps = null
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    latestReviewPanelProps = null
    vi.unstubAllGlobals()
  })

  it('ignores stale proposal responses when retry requests overlap', async () => {
    const user = userEvent.setup()
    const firstRetryResponse = createDeferred()
    const secondRetryResponse = createDeferred()

    fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => firstRetryResponse.promise)
      .mockImplementationOnce(() => secondRetryResponse.promise)

    renderApp()

    await user.click(screen.getByTestId('sidebar-start-sync'))

    await waitFor(() => {
      expect(latestReviewPanelProps?.reviewSession?.error).toBe(
        'Could not reach the backend. Please try again.',
      )
    })

    await act(async () => {
      void latestReviewPanelProps.onRetry()
      void latestReviewPanelProps.onRetry()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(3)
    })

    secondRetryResponse.resolve({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        proposal: buildProposal('Second retry wins'),
      }),
    })

    await waitFor(() => {
      expect(screen.getByTestId('review-panel-stub')).toHaveTextContent('Second retry wins')
    })

    firstRetryResponse.resolve({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        proposal: buildProposal('First retry resolves late'),
      }),
    })

    await waitFor(() => {
      expect(screen.getByTestId('review-panel-stub')).toHaveTextContent('Second retry wins')
    })
    expect(screen.getByTestId('review-panel-stub')).not.toHaveTextContent('First retry resolves late')
  })
})
