/**
 * App boot smoke test.
 *
 * Goal: verify that <App /> mounts without crashing and renders the key
 * structural elements (sidebar + editor pane).  Mantine's useLocalStorage
 * and browser-fs-access file-picker APIs don't exist in jsdom, so we stub
 * both here.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import App from '../../src/App.jsx'
import { initialTree } from '../../src/data/initialTree.js'

// ── Stubs ─────────────────────────────────────────────────────────────────

// Mantine's useLocalStorage needs to return [value, setter].
vi.mock('@mantine/hooks', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useLocalStorage: vi.fn(() => [initialTree, vi.fn()]),
  }
})

// browser-fs-access tries to open native file pickers — stub them out.
vi.mock('browser-fs-access', () => ({
  fileOpen: vi.fn(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
  fileSave: vi.fn(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
}))

// EditorPane loads Tiptap + ProseMirror which register plugins at module-level
// and keep the jsdom event loop open indefinitely.  Smoke tests only verify
// the sidebar tree, so stub the entire component.
vi.mock('../../src/components/EditorPane.jsx', () => ({
  default: () => null,
}))



// Tiptap uses ResizeObserver in its editor setup.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() { }
      unobserve() { }
      disconnect() { }
    }
  }
})

// ── Render helper ─────────────────────────────────────────────────────────
function renderApp() {
  return render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────
describe('App boot', () => {
  it('renders without crashing', () => {
    expect(() => renderApp()).not.toThrow()
  })

  it('shows the workspace root in the sidebar tree', () => {
    renderApp()
    // The workspace node is labelled "workspace" in the Mantine tree
    expect(screen.getByText('workspace')).toBeInTheDocument()
  })

  it('shows an initial file from the starter tree', () => {
    renderApp()
    // initialTree has "story-structure" folder which should appear in sidebar
    expect(screen.getByText('story-structure')).toBeInTheDocument()
  })
})
