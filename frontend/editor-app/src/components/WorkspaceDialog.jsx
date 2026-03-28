import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import PropTypes from 'prop-types'

const nodeShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['file', 'folder']).isRequired,
  children: PropTypes.array,
})

function formatItemCount(count, label) {
  return `${count} ${label}${count === 1 ? '' : 's'}`
}

function formatChangedFileCopy(count) {
  return `${count} file${count === 1 ? ' has' : 's have'} changed since the last sync.`
}

function getDialogTitle(action, targetNode) {
  if (action === 'newFile') {
    return 'Create file'
  }

  if (action === 'newFolder') {
    return 'Create folder'
  }

  if (action === 'rename') {
    return 'Rename item'
  }

  if (action === 'newProject') {
    return 'Start a new project'
  }

  if (action === 'cancelReview') {
    return 'Cancel world sync'
  }

  if (action === 'downloadWarning') {
    return 'World Model Out of Sync'
  }

  if (targetNode?.type === 'folder') {
    return 'Delete folder'
  }

  if (targetNode?.type === 'file') {
    return 'Delete file'
  }

  return 'Delete item'
}

function getDeleteCopy(targetNode, deleteStats) {
  if (!targetNode) {
    return {
      confirmLabel: 'Delete',
      description: 'Delete this item from the workspace?',
      impact: null,
      statLine: null,
    }
  }

  if (targetNode.type === 'file') {
    return {
      confirmLabel: 'Delete file',
      description: `Delete "${targetNode.name}"?`,
      impact: 'This removes the file and its editor content from the workspace.',
      statLine: null,
    }
  }

  if (!deleteStats || deleteStats.total === 0) {
    return {
      confirmLabel: 'Delete folder',
      description: `Delete folder "${targetNode.name}"?`,
      impact: 'This folder is empty, so only the folder itself will be removed.',
      statLine: null,
    }
  }

  return {
    confirmLabel: 'Delete folder',
    description: `Delete folder "${targetNode.name}"?`,
    impact: 'Everything inside this folder will also be deleted from the workspace.',
    statLine: `${formatItemCount(deleteStats.total, 'nested item')} · ${formatItemCount(
      deleteStats.files,
      'file',
    )} · ${formatItemCount(deleteStats.folders, 'folder')}`,
  }
}

function WorkspaceDialog({
  action,
  deleteStats,
  downloadWarning,
  draftName,
  error,
  onClose,
  onConfirmCancelReview,
  onConfirmDownloadAnyway,
  onConfirmDelete,
  onConfirmNewProject,
  onConfirmSyncFirst,
  onDraftNameChange,
  onSubmit,
  targetNode,
}) {
  const isConfirmationAction = action === 'delete'
    || action === 'newProject'
    || action === 'cancelReview'
    || action === 'downloadWarning'
  const deleteCopy = action === 'delete' ? getDeleteCopy(targetNode, deleteStats) : null

  return (
    <Modal
      centered
      onClose={onClose}
      opened={Boolean(action)}
      size="sm"
      title={getDialogTitle(action, targetNode)}
    >
      {isConfirmationAction ? (
        <Stack gap="md">
          {action === 'newProject' ? (
            <Text>
              Start a new project? This replaces the current browser copy with the starter
              workspace. Download the current project first if you want a backup.
            </Text>
          ) : action === 'cancelReview' ? (
            <Stack gap={6}>
              <Text fw={600}>Cancel the current world sync?</Text>
              <Text className="panel-meta">
                This discards every staged index approval and detail review result, then returns to World mode with the existing world model unchanged.
              </Text>
            </Stack>
          ) : action === 'downloadWarning' ? (
            <Stack gap={6}>
              <Text fw={600}>
                Your world model hasn&apos;t been synced with recent story changes.
              </Text>
              <Text className="dialog-impact-chip">
                {formatChangedFileCopy(downloadWarning?.changedFileCount ?? 0)}
              </Text>
              <Text className="panel-meta">
                If you download now, the zip will include the current world model and a record
                of unsynced changes, so you can sync after reloading.
              </Text>
            </Stack>
          ) : (
            <>
              <Stack gap={6}>
                <Text fw={600}>{deleteCopy.description}</Text>
                <Text className="panel-meta">{deleteCopy.impact}</Text>
              </Stack>

              {deleteCopy.statLine ? <Text className="dialog-impact-chip">{deleteCopy.statLine}</Text> : null}
            </>
          )}

          <Group justify="flex-end">
            <Button onClick={onClose} variant="default">
              Cancel
            </Button>
            {action === 'newProject' ? (
              <Button onClick={onConfirmNewProject}>
                Replace project
              </Button>
            ) : action === 'cancelReview' ? (
              <Button data-testid="confirm-cancel-review-button" onClick={onConfirmCancelReview}>
                Cancel sync
              </Button>
            ) : action === 'downloadWarning' ? (
              <>
                <Button data-testid="download-anyway-button" onClick={onConfirmDownloadAnyway} variant="default">
                  Download Anyway
                </Button>
                <Button data-testid="sync-first-button" onClick={onConfirmSyncFirst}>
                  Sync First
                </Button>
              </>
            ) : (
              <Button className="dialog-destructive-action" onClick={onConfirmDelete}>
                {deleteCopy.confirmLabel}
              </Button>
            )}
          </Group>
        </Stack>
      ) : (
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            <Text className="panel-meta">
              {action === 'rename'
                ? `Rename the selected ${targetNode?.type}.`
                : `Create inside ${targetNode?.name ?? 'workspace'}.`}
            </Text>

            <TextInput
              autoFocus
              label="Name"
              onChange={(event) => onDraftNameChange(event.currentTarget.value)}
              placeholder={action === 'newFile' ? 'scene-notes.story' : 'story-beats'}
              value={draftName}
            />

            {error ? <Text className="dialog-error">{error}</Text> : null}

            <Group justify="flex-end">
              <Button onClick={onClose} type="button" variant="default">
                Cancel
              </Button>
              <Button type="submit">
                {action === 'rename'
                  ? 'Save name'
                  : action === 'newFolder'
                    ? 'Create folder'
                    : 'Create file'}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  )
}

WorkspaceDialog.propTypes = {
  action: PropTypes.string,
  deleteStats: PropTypes.shape({
    files: PropTypes.number.isRequired,
    folders: PropTypes.number.isRequired,
    total: PropTypes.number.isRequired,
  }),
  downloadWarning: PropTypes.shape({
    changedFileCount: PropTypes.number.isRequired,
  }).isRequired,
  draftName: PropTypes.string.isRequired,
  error: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirmCancelReview: PropTypes.func.isRequired,
  onConfirmDownloadAnyway: PropTypes.func.isRequired,
  onConfirmDelete: PropTypes.func.isRequired,
  onConfirmNewProject: PropTypes.func.isRequired,
  onConfirmSyncFirst: PropTypes.func.isRequired,
  onDraftNameChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  targetNode: nodeShape,
}

export default WorkspaceDialog
