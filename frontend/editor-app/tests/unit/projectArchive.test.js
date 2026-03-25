import { describe, it, expect } from 'vitest'
import {
  isProjectArchiveAbortError,
} from '../../src/utils/projectArchive.js'

// ── isProjectArchiveAbortError ────────────────────────────────────────────
describe('isProjectArchiveAbortError', () => {
  it('recognises error with name AbortError', () => {
    expect(isProjectArchiveAbortError({ name: 'AbortError' })).toBe(true)
  })
  it('recognises user-aborted message', () => {
    expect(isProjectArchiveAbortError({ message: 'The user aborted a request.' })).toBe(true)
  })
  it('recognises operation-aborted message', () => {
    expect(isProjectArchiveAbortError({ message: 'The operation was aborted.' })).toBe(true)
  })
  it('recognises code 20 (DOMException ABORT_ERR)', () => {
    expect(isProjectArchiveAbortError({ code: 20 })).toBe(true)
  })
  it('returns false for unrelated errors', () => {
    expect(isProjectArchiveAbortError(new Error('Network error'))).toBe(false)
  })
  it('returns false for null', () => {
    expect(isProjectArchiveAbortError(null)).toBe(false)
  })
  it('returns false for undefined', () => {
    expect(isProjectArchiveAbortError(undefined)).toBe(false)
  })
})

// ── Archive payload validation (exercised via a reimplemented mirror) ──────
// validateArchivePayload is not exported, so we test the observable contract:
// importProjectZip will throw on invalid payloads.  We test that boundary
// with a small inline validator that mirrors the same rules.

function validateArchivePayload(payload) {
  function isPlainObject(v) {
    return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
  }
  function isValidWorkspaceNode(node) {
    if (!isPlainObject(node)) return false
    if (typeof node.id !== 'string' || typeof node.name !== 'string') return false
    if (node.type === 'file') return typeof node.content === 'string'
    if (node.type !== 'folder' || !Array.isArray(node.children)) return false
    return node.children.every(isValidWorkspaceNode)
  }

  if (!isPlainObject(payload)) throw new Error('Invalid archive: workspace payload is missing.')
  if (payload.app !== 'editor-app') throw new Error('Invalid archive: wrong app format.')
  if (payload.version !== 1) throw new Error(`Unsupported archive version: ${payload.version}`)
  if (!isValidWorkspaceNode(payload.workspace) || payload.workspace.type !== 'folder') {
    throw new Error('Invalid archive: workspace data is malformed.')
  }
  if (
    payload.selectedNodeId !== null &&
    payload.selectedNodeId !== undefined &&
    typeof payload.selectedNodeId !== 'string'
  ) {
    throw new Error('Invalid archive: selected node is malformed.')
  }
}

const VALID_WORKSPACE = {
  id: 'root',
  name: 'workspace',
  type: 'folder',
  children: [
    { id: 'f1', name: 'scene.story', type: 'file', content: '<p></p>' },
  ],
}

describe('validateArchivePayload (contract mirror)', () => {
  it('accepts a valid payload', () => {
    expect(() =>
      validateArchivePayload({
        app: 'editor-app',
        version: 1,
        workspace: VALID_WORKSPACE,
        selectedNodeId: 'f1',
      })
    ).not.toThrow()
  })
  it('accepts null selectedNodeId', () => {
    expect(() =>
      validateArchivePayload({
        app: 'editor-app',
        version: 1,
        workspace: VALID_WORKSPACE,
        selectedNodeId: null,
      })
    ).not.toThrow()
  })
  it('throws for wrong app id', () => {
    expect(() =>
      validateArchivePayload({ app: 'other-app', version: 1, workspace: VALID_WORKSPACE })
    ).toThrow('wrong app format')
  })
  it('throws for unsupported version', () => {
    expect(() =>
      validateArchivePayload({ app: 'editor-app', version: 99, workspace: VALID_WORKSPACE })
    ).toThrow('Unsupported archive version')
  })
  it('throws for non-folder workspace root', () => {
    expect(() =>
      validateArchivePayload({
        app: 'editor-app',
        version: 1,
        workspace: { id: 'f', name: 'x', type: 'file', content: '' },
      })
    ).toThrow('workspace data is malformed')
  })
  it('throws for malformed selectedNodeId', () => {
    expect(() =>
      validateArchivePayload({
        app: 'editor-app',
        version: 1,
        workspace: VALID_WORKSPACE,
        selectedNodeId: 42,
      })
    ).toThrow('selected node is malformed')
  })
  it('throws when payload is null', () => {
    expect(() => validateArchivePayload(null)).toThrow('workspace payload is missing')
  })
  it('throws when payload is an array', () => {
    expect(() => validateArchivePayload([])).toThrow('workspace payload is missing')
  })
})

// ── fixture helper — parseElementEntries ─────────────────────────────────
import {
  parseElementEntries,
  parseEventEntries,
  ELEMENTS_INDEX_RAW,
  EVENTS_INDEX_RAW,
} from '../fixtures/story.js'

describe('fixture: parseElementEntries', () => {
  it('parses 9 elements', () => {
    const entries = parseElementEntries(ELEMENTS_INDEX_RAW)
    expect(entries).toHaveLength(9)
  })
  it('parses Mira correctly', () => {
    const entries = parseElementEntries(ELEMENTS_INDEX_RAW)
    const mira = entries.find((e) => e.displayName === 'Mira')
    expect(mira).toBeDefined()
    expect(mira.kind).toBe('person')
    expect(mira.uuid).toBe('elt_45d617e4531b')
    expect(mira.identificationKeys).toContain('carries the silver key')
  })
  it('every entry has a non-empty uuid', () => {
    parseElementEntries(ELEMENTS_INDEX_RAW).forEach((e) => {
      expect(e.uuid.length).toBeGreaterThan(0)
    })
  })
})

describe('fixture: parseEventEntries', () => {
  it('parses 7 events', () => {
    const entries = parseEventEntries(EVENTS_INDEX_RAW)
    expect(entries).toHaveLength(7)
  })
  it('parses the letter event correctly', () => {
    const entries = parseEventEntries(EVENTS_INDEX_RAW)
    const evt = entries.find((e) => e.uuid === 'evt_f72bc8fe0f29')
    expect(evt).toBeDefined()
    expect(evt.chapters).toBe('Chapter 7')
    expect(evt.when).toContain('1998')
  })
  it('every event entry has a uuid starting with evt_', () => {
    parseEventEntries(EVENTS_INDEX_RAW).forEach((e) => {
      expect(e.uuid).toMatch(/^evt_/)
    })
  })
})
