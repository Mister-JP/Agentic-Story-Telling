// Extend vitest's expect with jest-dom matchers (toBeInTheDocument, etc.)
import '@testing-library/jest-dom'

// ── Polyfills for Mantine in jsdom ────────────────────────────────────────

// Mantine uses window.matchMedia for colour-scheme detection.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mantine (and some virtualized lists) call window.scrollTo.
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
})
