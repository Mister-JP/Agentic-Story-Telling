import { describe, it, expect } from 'vitest'
import {
  createFileNode,
  createFolderNode,
  normalizeNodeName,
  findNodeMeta,
  getFirstFileId,
  getNodePath,
  getInsertionTarget,
  isNameAvailable,
  addNode,
  renameNode,
  deleteNode,
  updateFileContent,
  getNodeDescendantStats,
  pruneExpandedState,
  toMantineTreeData,
} from '../../src/utils/tree.js'

// ── Helpers ──────────────────────────────────────────────────────────────
function makeTree() {
  return {
    id: 'root',
    name: 'workspace',
    type: 'folder',
    children: [
      {
        id: 'folder-a',
        name: 'chapter-one',
        type: 'folder',
        children: [
          { id: 'file-1', name: 'scene-1.story', type: 'file', content: '<p>Hello</p>' },
          { id: 'file-2', name: 'scene-2.story', type: 'file', content: '<p>World</p>' },
        ],
      },
      { id: 'file-root', name: 'notes.story', type: 'file', content: '<p>Notes</p>' },
    ],
  }
}

// ── normalizeNodeName ─────────────────────────────────────────────────────
describe('normalizeNodeName', () => {
  it('trims whitespace', () => {
    expect(normalizeNodeName('  foo  ')).toBe('foo')
  })
  it('collapses internal whitespace', () => {
    expect(normalizeNodeName('foo   bar')).toBe('foo bar')
  })
  it('handles empty string', () => {
    expect(normalizeNodeName('')).toBe('')
  })
})

// ── createFileNode ────────────────────────────────────────────────────────
describe('createFileNode', () => {
  it('returns a file node with correct shape', () => {
    const node = createFileNode('chapter.story')
    expect(node.name).toBe('chapter.story')
    expect(node.type).toBe('file')
    expect(typeof node.id).toBe('string')
    expect(node.content).toBe('<p></p>')
  })
  it('generates a unique id each time', () => {
    const a = createFileNode('a.story')
    const b = createFileNode('b.story')
    expect(a.id).not.toBe(b.id)
  })
})

// ── createFolderNode ──────────────────────────────────────────────────────
describe('createFolderNode', () => {
  it('returns a folder node with empty children', () => {
    const node = createFolderNode('chapter-two')
    expect(node.name).toBe('chapter-two')
    expect(node.type).toBe('folder')
    expect(node.children).toEqual([])
    expect(typeof node.id).toBe('string')
  })
})

// ── findNodeMeta ──────────────────────────────────────────────────────────
describe('findNodeMeta', () => {
  it('finds a top-level file', () => {
    const tree = makeTree()
    const meta = findNodeMeta(tree, 'file-root')
    expect(meta?.node.id).toBe('file-root')
    expect(meta?.parent.id).toBe('root')
  })
  it('finds a nested file', () => {
    const tree = makeTree()
    const meta = findNodeMeta(tree, 'file-1')
    expect(meta?.node.id).toBe('file-1')
    expect(meta?.parent.id).toBe('folder-a')
  })
  it('finds a folder', () => {
    const tree = makeTree()
    const meta = findNodeMeta(tree, 'folder-a')
    expect(meta?.node.id).toBe('folder-a')
    expect(meta?.parent.id).toBe('root')
  })
  it('returns null for unknown id', () => {
    const tree = makeTree()
    expect(findNodeMeta(tree, 'does-not-exist')).toBeNull()
  })
  it('finds root itself', () => {
    const tree = makeTree()
    const meta = findNodeMeta(tree, 'root')
    expect(meta?.node.id).toBe('root')
    expect(meta?.parent).toBeNull()
  })
})

// ── getFirstFileId ────────────────────────────────────────────────────────
describe('getFirstFileId', () => {
  it('returns the id of the first file in a folder', () => {
    const tree = makeTree()
    // First file in DFS order: file-1 (inside folder-a which comes before file-root)
    expect(getFirstFileId(tree)).toBe('file-1')
  })
  it('returns null for an empty folder', () => {
    const emptyFolder = { id: 'e', name: 'empty', type: 'folder', children: [] }
    expect(getFirstFileId(emptyFolder)).toBeNull()
  })
  it('returns its own id when called on a file', () => {
    const file = { id: 'f', name: 'x.story', type: 'file', content: '' }
    expect(getFirstFileId(file)).toBe('f')
  })
})

// ── getNodePath ───────────────────────────────────────────────────────────
describe('getNodePath', () => {
  it('returns path to a nested file', () => {
    const tree = makeTree()
    expect(getNodePath(tree, 'file-1')).toEqual(['root', 'folder-a', 'file-1'])
  })
  it('returns path to root', () => {
    const tree = makeTree()
    expect(getNodePath(tree, 'root')).toEqual(['root'])
  })
  it('returns null for unknown id', () => {
    const tree = makeTree()
    expect(getNodePath(tree, 'ghost')).toBeNull()
  })
})

// ── isNameAvailable ───────────────────────────────────────────────────────
describe('isNameAvailable', () => {
  it('returns true when name is not taken', () => {
    const tree = makeTree()
    expect(isNameAvailable(tree, 'folder-a', 'scene-99.story')).toBe(true)
  })
  it('returns false when name is already used (case-insensitive)', () => {
    const tree = makeTree()
    expect(isNameAvailable(tree, 'folder-a', 'SCENE-1.STORY')).toBe(false)
  })
  it('returns true when name matches the excluded id (rename scenario)', () => {
    const tree = makeTree()
    expect(isNameAvailable(tree, 'folder-a', 'scene-1.story', 'file-1')).toBe(true)
  })
  it('returns false for unknown parent', () => {
    const tree = makeTree()
    expect(isNameAvailable(tree, 'ghost-folder', 'new.story')).toBe(false)
  })
})

// ── addNode ───────────────────────────────────────────────────────────────
describe('addNode', () => {
  it('adds a file to the correct folder', () => {
    const tree = makeTree()
    const newFile = createFileNode('scene-3.story')
    newFile.id = 'file-3' // deterministic for test
    const next = addNode(tree, 'folder-a', newFile)
    const meta = findNodeMeta(next, 'file-3')
    expect(meta?.parent.id).toBe('folder-a')
  })
  it('sorts children after insertion (folders before files)', () => {
    const tree = makeTree()
    const newFolder = createFolderNode('a-new-folder')
    newFolder.id = 'new-folder'
    const next = addNode(tree, 'root', newFolder)
    expect(next.children[0].type).toBe('folder')
  })
  it('does not mutate the original tree', () => {
    const tree = makeTree()
    const original = tree.children.length
    addNode(tree, 'root', createFileNode('x.story'))
    expect(tree.children.length).toBe(original)
  })
})

// ── renameNode ────────────────────────────────────────────────────────────
describe('renameNode', () => {
  it('renames a nested file', () => {
    const tree = makeTree()
    const next = renameNode(tree, 'file-1', 'renamed.story')
    const meta = findNodeMeta(next, 'file-1')
    expect(meta?.node.name).toBe('renamed.story')
  })
  it('returns same reference when id not found (no-op)', () => {
    const tree = makeTree()
    const next = renameNode(tree, 'ghost', 'x.story')
    expect(next).toBe(tree)
  })
  it('does not mutate original', () => {
    const tree = makeTree()
    renameNode(tree, 'file-1', 'changed.story')
    expect(findNodeMeta(tree, 'file-1')?.node.name).toBe('scene-1.story')
  })
})

// ── deleteNode ────────────────────────────────────────────────────────────
describe('deleteNode', () => {
  it('removes a top-level file', () => {
    const tree = makeTree()
    const next = deleteNode(tree, 'file-root')
    expect(findNodeMeta(next, 'file-root')).toBeNull()
  })
  it('removes a nested file', () => {
    const tree = makeTree()
    const next = deleteNode(tree, 'file-1')
    expect(findNodeMeta(next, 'file-1')).toBeNull()
    // sibling still exists
    expect(findNodeMeta(next, 'file-2')).not.toBeNull()
  })
  it('removes a folder and all its children', () => {
    const tree = makeTree()
    const next = deleteNode(tree, 'folder-a')
    expect(findNodeMeta(next, 'folder-a')).toBeNull()
    expect(findNodeMeta(next, 'file-1')).toBeNull()
  })
  it('returns same reference when id not found', () => {
    const tree = makeTree()
    const next = deleteNode(tree, 'ghost')
    expect(next).toBe(tree)
  })
})

// ── updateFileContent ─────────────────────────────────────────────────────
describe('updateFileContent', () => {
  it('updates content of a matching file', () => {
    const tree = makeTree()
    const next = updateFileContent(tree, 'file-1', '<p>Updated</p>')
    const meta = findNodeMeta(next, 'file-1')
    expect(meta?.node.content).toBe('<p>Updated</p>')
  })
  it('returns same reference when content is unchanged', () => {
    const tree = makeTree()
    const next = updateFileContent(tree, 'file-1', '<p>Hello</p>')
    expect(next).toBe(tree)
  })
  it('does not mutate original', () => {
    const tree = makeTree()
    updateFileContent(tree, 'file-1', '<p>Changed</p>')
    expect(findNodeMeta(tree, 'file-1')?.node.content).toBe('<p>Hello</p>')
  })
})

// ── getNodeDescendantStats ────────────────────────────────────────────────
describe('getNodeDescendantStats', () => {
  it('counts files and folders correctly', () => {
    const tree = makeTree()
    const stats = getNodeDescendantStats(tree)
    // root has folder-a + file-root (direct) + file-1 + file-2 (inside folder-a)
    expect(stats.files).toBe(3)
    expect(stats.folders).toBe(1)
    expect(stats.total).toBe(4)
  })
  it('returns zeros for a file node', () => {
    const file = { id: 'f', name: 'x.story', type: 'file', content: '' }
    expect(getNodeDescendantStats(file)).toEqual({ total: 0, files: 0, folders: 0 })
  })
  it('returns zeros for an empty folder', () => {
    const folder = { id: 'f', name: 'empty', type: 'folder', children: [] }
    expect(getNodeDescendantStats(folder)).toEqual({ total: 0, files: 0, folders: 0 })
  })
})

// ── pruneExpandedState ────────────────────────────────────────────────────
describe('pruneExpandedState', () => {
  it('keeps entries for valid folder ids', () => {
    const tree = makeTree()
    const expanded = { root: true, 'folder-a': true }
    const pruned = pruneExpandedState(tree, expanded)
    expect(pruned['root']).toBe(true)
    expect(pruned['folder-a']).toBe(true)
  })
  it('drops entries for non-folder or missing ids', () => {
    const tree = makeTree()
    const expanded = { 'file-1': true, ghost: true, 'folder-a': true }
    const pruned = pruneExpandedState(tree, expanded)
    expect('file-1' in pruned).toBe(false)
    expect('ghost' in pruned).toBe(false)
    expect(pruned['folder-a']).toBe(true)
  })
  it('drops falsy entries', () => {
    const tree = makeTree()
    const expanded = { root: false, 'folder-a': true }
    const pruned = pruneExpandedState(tree, expanded)
    expect('root' in pruned).toBe(false)
    expect(pruned['folder-a']).toBe(true)
  })
})

// ── getInsertionTarget ────────────────────────────────────────────────────
describe('getInsertionTarget', () => {
  it('returns root when selectedNodeId is null', () => {
    const tree = makeTree()
    const target = getInsertionTarget(tree, null)
    expect(target.node.id).toBe('root')
  })
  it('returns the folder itself when a folder is selected', () => {
    const tree = makeTree()
    const target = getInsertionTarget(tree, 'folder-a')
    expect(target.node.id).toBe('folder-a')
  })
  it('returns the parent folder when a file is selected', () => {
    const tree = makeTree()
    const target = getInsertionTarget(tree, 'file-1')
    expect(target.node.id).toBe('folder-a')
  })
})

// ── toMantineTreeData ─────────────────────────────────────────────────────
describe('toMantineTreeData', () => {
  it('converts tree to mantine format', () => {
    const tree = makeTree()
    const data = toMantineTreeData(tree)
    expect(Array.isArray(data)).toBe(true)
    expect(data[0].value).toBe('root')
    expect(data[0].label).toBe('workspace')
    expect(Array.isArray(data[0].children)).toBe(true)
  })
  it('leaves children undefined for file nodes', () => {
    const tree = makeTree()
    const data = toMantineTreeData(tree)
    const folderNode = data[0].children.find((c) => c.value === 'folder-a')
    const fileNode = folderNode.children.find((c) => c.value === 'file-1')
    expect(fileNode.children).toBeUndefined()
  })
})
