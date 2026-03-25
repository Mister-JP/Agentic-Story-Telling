export const ROOT_ID = 'workspace-root'
export const DEFAULT_OPEN_FOLDER_ID = 'story-structure'
export const DEFAULT_FILE_ID = 'opening-scene'

const INITIAL_TREE_TEMPLATE = {
  id: ROOT_ID,
  name: 'workspace',
  type: 'folder',
  children: [
    {
      id: 'story-structure',
      name: 'story-structure',
      type: 'folder',
      children: [
        {
          id: 'opening-scene',
          name: 'opening-scene.story',
          type: 'file',
          content:
            '<h1>Opening scene</h1><p>Start close to the character, inside a small concrete action.</p><ul><li>Hook the reader with one unusual detail.</li><li>Reveal the problem before the end of the scene.</li></ul>',
        },
        {
          id: 'character-arc',
          name: 'character-arc.story',
          type: 'file',
          content:
            '<h2>Character arc</h2><p>Track the emotional movement across the draft.</p><p><strong>Beginning:</strong> guarded and reactive.</p><p><strong>Ending:</strong> decisive and honest.</p>',
        },
      ],
    },
    {
      id: 'reference-notes',
      name: 'reference-notes',
      type: 'folder',
      children: [
        {
          id: 'tone-guide',
          name: 'tone-guide.story',
          type: 'file',
          content:
            '<h2>Tone guide</h2><p>Keep the prose vivid, specific, and grounded in action.</p><ul><li>Use short paragraphs when tension rises.</li><li>Reserve headings for major beats.</li></ul>',
        },
      ],
    },
    {
      id: 'workspace-log',
      name: 'workspace-log.story',
      type: 'file',
      content:
        '<h2>Workspace log</h2><p>This starter file lives at the root so the explorer shows both folders and files.</p><p>Changes are saved automatically in your browser, so project downloads always include your latest edits.</p>',
    },
  ],
}

function cloneTreeNode(node) {
  if (node.type === 'file') {
    return { ...node }
  }

  return {
    ...node,
    children: node.children.map(cloneTreeNode),
  }
}

export function createInitialTree() {
  return cloneTreeNode(INITIAL_TREE_TEMPLATE)
}

export const initialTree = createInitialTree()
