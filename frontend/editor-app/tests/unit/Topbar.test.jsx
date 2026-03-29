import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import Topbar from '../../src/components/Topbar.jsx'

const defaultProps = {
  onOpenDialog: vi.fn(),
  onOpenLlmSettings: vi.fn(),
  projectAction: null,
  projectStatus: null,
  reviewStep: 'events-index',
  selectedPathNames: ['workspace'],
  selectionMode: 'empty',
  selectedNode: {
    children: [],
    id: 'root',
    name: 'workspace',
    type: 'folder',
  },
  syncBadgeProps: null,
  viewMode: 'review',
}

function renderTopbar(props = {}) {
  return render(
    <MantineProvider>
      <Topbar {...defaultProps} {...props} />
    </MantineProvider>,
  )
}

describe('Topbar', () => {
  it.each(['diff-preview', 'element-details', 'event-details', 'complete'])(
    'uses neutral review copy for non-index review step %s',
    (reviewStep) => {
      renderTopbar({ reviewStep })

      expect(screen.getByText('World Sync Review')).toBeInTheDocument()
      expect(screen.getByText('Continue the world sync workflow without staging a partial world model update.')).toBeInTheDocument()
      expect(screen.queryByText('Events Index Review')).not.toBeInTheDocument()
      expect(screen.queryByText('Elements Index Review')).not.toBeInTheDocument()
    },
  )

  it('keeps the elements-specific review copy during the elements index step', () => {
    renderTopbar({ reviewStep: 'elements-index' })

    expect(screen.getByText('Elements Index Review')).toBeInTheDocument()
    expect(screen.getByText('Approve or request changes before the element proposal is staged for the world model.')).toBeInTheDocument()
  })

  it('exposes the model settings control', () => {
    renderTopbar({ viewMode: 'write', selectionMode: 'empty' })

    expect(screen.getByRole('button', { name: 'Model settings' })).toBeInTheDocument()
  })
})
