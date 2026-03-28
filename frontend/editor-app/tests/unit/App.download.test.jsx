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

vi.mock('../../src/utils/projectArchive.js', async () => {
  const actual = await vi.importActual('../../src/utils/projectArchive.js')

  return {
    ...actual,
    checkSyncBeforeDownload: vi.fn(),
    exportProjectZip: vi.fn(),
  }
})

vi.mock('../../src/components/EditorPane.jsx', () => ({
  default: () => null,
}))

vi.mock('../../src/components/Sidebar.jsx', () => ({
  default: function SidebarStub({ onDownloadProject }) {
    return (
      <aside data-testid="sidebar-stub">
        <button data-testid="download-project-button" onClick={onDownloadProject} type="button">
          Download
        </button>
      </aside>
    )
  },
}))

vi.mock('../../src/components/WorldPanel.jsx', () => ({
  default: () => <section data-testid="world-panel-stub" />,
}))

vi.mock('../../src/components/SyncReviewPanel.jsx', () => ({
  default: function SyncReviewPanelStub({ reviewSession }) {
    if (!reviewSession) {
      return null
    }

    return <section data-testid="review-panel-stub" />
  },
}))

import {
  checkSyncBeforeDownload,
  exportProjectZip,
} from '../../src/utils/projectArchive.js'

function renderApp() {
  return render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  )
}

describe('App download flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkSyncBeforeDownload.mockReturnValue({
      needsWarning: false,
      changedFileCount: 0,
    })
    exportProjectZip.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the unsynced warning dialog before downloading when a warning is required', async () => {
    const user = userEvent.setup()

    checkSyncBeforeDownload.mockReturnValue({
      needsWarning: true,
      changedFileCount: 2,
    })

    renderApp()

    await user.click(screen.getByTestId('download-project-button'))

    expect(await screen.findByRole('dialog', { name: 'World Model Out of Sync' })).toBeVisible()
    expect(screen.getByText('2 files have changed since the last sync.')).toBeInTheDocument()
    expect(exportProjectZip).not.toHaveBeenCalled()
  })

  it('proceeds directly with the download when no warning is needed', async () => {
    const user = userEvent.setup()

    renderApp()

    await user.click(screen.getByTestId('download-project-button'))

    await waitFor(() => {
      expect(exportProjectZip).toHaveBeenCalledOnce()
    })

    expect(screen.queryByRole('dialog', { name: 'World Model Out of Sync' })).not.toBeInTheDocument()
  })

  it('starts the sync flow when the user chooses Sync First from the warning dialog', async () => {
    const user = userEvent.setup()

    checkSyncBeforeDownload.mockReturnValue({
      needsWarning: true,
      changedFileCount: 1,
    })

    renderApp()

    await user.click(screen.getByTestId('download-project-button'))
    await screen.findByRole('dialog', { name: 'World Model Out of Sync' })
    await user.click(screen.getByTestId('sync-first-button'))

    await waitFor(() => {
      expect(screen.getByTestId('review-panel-stub')).toBeInTheDocument()
    })

    expect(screen.queryByRole('dialog', { name: 'World Model Out of Sync' })).not.toBeInTheDocument()
    expect(exportProjectZip).not.toHaveBeenCalled()
  })
})
