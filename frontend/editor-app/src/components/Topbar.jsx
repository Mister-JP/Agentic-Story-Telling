import { ActionIcon, Badge, Text } from '@mantine/core'
import PropTypes from 'prop-types'
import editIcon from '../assets/icons/edit-2-svgrepo-com.svg'
import trashIcon from '../assets/icons/trash-delete-svgrepo-com.svg'

const nodeShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['file', 'folder']).isRequired,
  children: PropTypes.array,
})

function getHeaderCopy(selectionMode, selectedNode, selectedPathNames) {
  const breadcrumb = selectedPathNames.join(' / ')

  if (selectionMode === 'file') {
    return {
      eyebrow: 'File',
      breadcrumb,
      title: selectedNode?.name ?? 'Untitled story',
      meta: 'Editing the browser-saved copy. Downloads always include the latest content.',
    }
  }

  if (selectionMode === 'folder') {
    return {
      eyebrow: 'Folder',
      breadcrumb,
      title: selectedNode?.name ?? 'Folder',
      meta: 'Use this folder as a staging area for scenes, notes, and references.',
    }
  }

  return {
    eyebrow: 'Workspace',
    breadcrumb: selectedPathNames[0] ?? 'workspace',
    title: 'Select a file to begin writing',
    meta: 'Choose a story file from the tree or create something new from the left rail.',
  }
}

function getStatusLabel(projectAction, selectionMode, selectedNode) {
  if (projectAction === 'download') {
    return 'Preparing download'
  }

  if (projectAction === 'upload') {
    return 'Importing archive'
  }

  if (selectionMode === 'folder') {
    const itemCount = selectedNode?.children?.length ?? 0
    return `${itemCount} item${itemCount === 1 ? '' : 's'}`
  }

  if (selectionMode === 'empty') {
    return 'Workspace ready'
  }

  return 'Autosaved locally'
}

function Topbar({
  onOpenDialog,
  projectAction,
  projectStatus,
  selectedPathNames,
  selectionMode,
  selectedNode,
  syncBadgeProps,
}) {
  const headerCopy = getHeaderCopy(selectionMode, selectedNode, selectedPathNames)
  const statusLabel = getStatusLabel(projectAction, selectionMode, selectedNode)
  const showInlineActions = selectionMode === 'file' || selectionMode === 'folder'
  const selectionLabel = selectionMode === 'file' ? 'file' : 'folder'

  return (
    <div className="topbar-panel">
      <div className="topbar-main">
        <div className="topbar-copy">
          <Text className="eyebrow">{headerCopy.eyebrow}</Text>
          <Text className="topbar-location">{headerCopy.breadcrumb}</Text>
          <div className="topbar-title-row">
            <Text className="topbar-context-title">{headerCopy.title}</Text>

            {showInlineActions ? (
              <div className="topbar-title-actions">
                <ActionIcon
                  aria-label={`Rename ${selectionLabel}`}
                  className="topbar-title-action"
                  onClick={() => onOpenDialog('rename', selectedNode.id)}
                  radius="xl"
                  size="md"
                  variant="default"
                >
                  <img alt="" className="topbar-action-svg" src={editIcon} />
                </ActionIcon>

                <ActionIcon
                  aria-label={`Delete ${selectionLabel}`}
                  className="topbar-title-action topbar-title-action--danger"
                  onClick={() => onOpenDialog('delete', selectedNode.id)}
                  radius="xl"
                  size="md"
                  variant="default"
                >
                  <img alt="" className="topbar-action-svg" src={trashIcon} />
                </ActionIcon>
              </div>
            ) : null}
          </div>
          <Text className="topbar-context-meta">{headerCopy.meta}</Text>
        </div>

        <div className="topbar-actions">
          <Badge className="topbar-status-pill" variant="light">
            {statusLabel}
          </Badge>

          {syncBadgeProps ? (
            <Badge
              className="topbar-sync-pill"
              color={syncBadgeProps.color}
              data-testid="sync-status-badge"
              variant="light"
            >
              {syncBadgeProps.label}
            </Badge>
          ) : null}
        </div>
      </div>

      {projectStatus ? (
        <Text className={`project-status${projectStatus.kind === 'error' ? ' is-error' : ''}`}>
          {projectStatus.message}
        </Text>
      ) : null}
    </div>
  )
}

Topbar.propTypes = {
  onOpenDialog: PropTypes.func.isRequired,
  projectAction: PropTypes.string,
  projectStatus: PropTypes.shape({
    kind: PropTypes.oneOf(['success', 'error']).isRequired,
    message: PropTypes.string.isRequired,
  }),
  selectedPathNames: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectionMode: PropTypes.oneOf(['empty', 'file', 'folder']).isRequired,
  selectedNode: nodeShape.isRequired,
  syncBadgeProps: PropTypes.shape({
    label: PropTypes.string.isRequired,
    color: PropTypes.string.isRequired,
  }),
}

export default Topbar
