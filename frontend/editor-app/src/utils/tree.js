function createId(prefix) {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  return `${prefix}-${randomPart}`
}

function sortChildren(children) {
  return [...children].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'folder' ? -1 : 1
    }

    return left.name.localeCompare(right.name)
  })
}

export function normalizeNodeName(value) {
  return value.trim().replace(/\s+/g, ' ')
}

export function createFileNode(name) {
  return {
    id: createId('file'),
    name,
    type: 'file',
    content: '<p></p>',
  }
}

export function createFolderNode(name) {
  return {
    id: createId('folder'),
    name,
    type: 'folder',
    children: [],
  }
}

export function findNodeMeta(node, targetId, parent = null) {
  if (node.id === targetId) {
    return { node, parent }
  }

  if (node.type !== 'folder') {
    return null
  }

  for (const child of node.children) {
    const match = findNodeMeta(child, targetId, node)

    if (match) {
      return match
    }
  }

  return null
}

export function getFirstFileId(node) {
  if (node.type === 'file') {
    return node.id
  }

  for (const child of node.children) {
    const match = getFirstFileId(child)

    if (match) {
      return match
    }
  }

  return null
}

export function getNodePath(node, targetId, path = []) {
  if (node.id === targetId) {
    return [...path, node.id]
  }

  if (node.type !== 'folder') {
    return null
  }

  for (const child of node.children) {
    const match = getNodePath(child, targetId, [...path, node.id])

    if (match) {
      return match
    }
  }

  return null
}

export function getInsertionTarget(root, selectedNodeId) {
  if (!selectedNodeId) {
    return { node: root, parent: null }
  }

  const selectedMeta = findNodeMeta(root, selectedNodeId)

  if (!selectedMeta) {
    return { node: root, parent: null }
  }

  if (selectedMeta.node.type === 'folder') {
    return selectedMeta
  }

  if (selectedMeta.parent) {
    return findNodeMeta(root, selectedMeta.parent.id) ?? { node: root, parent: null }
  }

  return { node: root, parent: null }
}

export function isNameAvailable(root, parentId, name, excludeId = null) {
  const parentMeta = findNodeMeta(root, parentId)

  if (!parentMeta || parentMeta.node.type !== 'folder') {
    return false
  }

  return !parentMeta.node.children.some(
    (child) => child.id !== excludeId && child.name.toLowerCase() === name.toLowerCase(),
  )
}

export function addNode(root, parentId, nextNode) {
  if (root.id === parentId) {
    return {
      ...root,
      children: sortChildren([...root.children, nextNode]),
    }
  }

  if (root.type !== 'folder') {
    return root
  }

  return {
    ...root,
    children: root.children.map((child) => addNode(child, parentId, nextNode)),
  }
}

export function renameNode(root, targetId, nextName) {
  if (root.type !== 'folder') {
    return root
  }

  let changed = false

  const nextChildren = root.children.map((child) => {
    if (child.id === targetId) {
      changed = true
      return { ...child, name: nextName }
    }

    const nextChild = renameNode(child, targetId, nextName)

    if (nextChild !== child) {
      changed = true
    }

    return nextChild
  })

  if (!changed) {
    return root
  }

  return {
    ...root,
    children: sortChildren(nextChildren),
  }
}

export function deleteNode(root, targetId) {
  if (root.type !== 'folder') {
    return root
  }

  const remainingChildren = root.children.filter((child) => child.id !== targetId)

  if (remainingChildren.length !== root.children.length) {
    return {
      ...root,
      children: remainingChildren,
    }
  }

  let changed = false

  const nextChildren = root.children.map((child) => {
    const nextChild = deleteNode(child, targetId)

    if (nextChild !== child) {
      changed = true
    }

    return nextChild
  })

  if (!changed) {
    return root
  }

  return {
    ...root,
    children: nextChildren,
  }
}

export function getNodeDescendantStats(node) {
  if (node.type !== 'folder') {
    return {
      total: 0,
      files: 0,
      folders: 0,
    }
  }

  return node.children.reduce(
    (stats, child) => {
      stats.total += 1

      if (child.type === 'file') {
        stats.files += 1
        return stats
      }

      stats.folders += 1

      const childStats = getNodeDescendantStats(child)

      stats.total += childStats.total
      stats.files += childStats.files
      stats.folders += childStats.folders

      return stats
    },
    {
      total: 0,
      files: 0,
      folders: 0,
    },
  )
}

export function pruneExpandedState(root, expandedState) {
  return Object.entries(expandedState).reduce((nextState, [nodeId, isExpanded]) => {
    if (!isExpanded) {
      return nextState
    }

    const nodeMeta = findNodeMeta(root, nodeId)

    if (nodeMeta?.node?.type === 'folder') {
      nextState[nodeId] = true
    }

    return nextState
  }, {})
}

export function updateFileContent(root, fileId, content) {
  if (root.id === fileId && root.type === 'file') {
    if (root.content === content) {
      return root
    }

    return { ...root, content }
  }

  if (root.type !== 'folder') {
    return root
  }

  let changed = false

  const nextChildren = root.children.map((child) => {
    const nextChild = updateFileContent(child, fileId, content)

    if (nextChild !== child) {
      changed = true
    }

    return nextChild
  })

  if (!changed) {
    return root
  }

  return {
    ...root,
    children: nextChildren,
  }
}

function toMantineNode(node) {
  return {
    value: node.id,
    label: node.name,
    nodeProps: {
      kind: node.type,
      childCount: node.type === 'folder' ? node.children.length : 0,
    },
    children: node.type === 'folder' ? node.children.map(toMantineNode) : undefined,
  }
}

export function toMantineTreeData(root) {
  return [toMantineNode(root)]
}
