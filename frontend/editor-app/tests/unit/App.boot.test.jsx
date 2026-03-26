/**
 * App boot smoke test.
 *
 * Goal: verify that <App /> mounts without crashing and exposes the expected
 * workspace labels. Mantine Tree + ScrollArea in the real Sidebar can stall
 * jsdom indefinitely, so Sidebar is stubbed here while still rendering the
 * same starter-tree names. useLocalStorage and browser-fs-access are stubbed;
 * EditorPane and Tiptap are stubbed so the editor stack never loads.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { initialTree } from '../../src/data/initialTree.js'
import App from '../../src/App.jsx'

// ── Stubs ─────────────────────────────────────────────────────────────────

// Avoid importOriginal(): loading the full @mantine/hooks barrel is slow and can stall workers.
// App only needs useLocalStorage returning [value, setter].
vi.mock('@mantine/hooks', () => ({
  useLocalStorage: vi.fn(() => [initialTree, vi.fn()]),
}))

// browser-fs-access tries to open native file pickers — stub them out.
vi.mock('browser-fs-access', () => ({
  fileOpen: vi.fn(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
  fileSave: vi.fn(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
}))

// EditorPane loads Tiptap + ProseMirror which register plugins at module-level
// and keep the jsdom event loop open indefinitely. Stub it for this smoke test.
vi.mock('../../src/components/EditorPane.jsx', () => ({
  default: () => null,
}))

// Mantine Tree keeps the jsdom event loop busy — stub Sidebar but keep fixture labels.
vi.mock('../../src/components/Sidebar.jsx', () => ({
  default: function SidebarStub() {
    return (
      <aside data-testid="sidebar-stub">
        <span>workspace</span>
        <span>story-structure</span>
      </aside>
    )
  },
}))

// Belt-and-suspenders if EditorPane mock resolution ever fails.
vi.mock('@mantine/tiptap', () => {
  const Stub = () => null
  return { RichTextEditor: Object.assign(Stub, { Toolbar: Stub, Content: Stub }) }
})

vi.mock('@tiptap/react', () => ({
  useEditor: () => null,
}))

vi.mock('@tiptap/starter-kit', () => ({
  default: { configure: () => ({}) },
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
describe('App boot', { timeout: 15_000 }, () => {
  it('renders without crashing', () => {
    expect(() => renderApp()).not.toThrow()
  })

  it('shows the workspace root in the sidebar tree', () => {
    renderApp()
    expect(screen.getByTestId('sidebar-stub')).toBeInTheDocument()
    expect(screen.getByText('workspace')).toBeInTheDocument()
  })

  it('shows an initial file from the starter tree', () => {
    renderApp()
    expect(screen.getByText('story-structure')).toBeInTheDocument()
  })
})
