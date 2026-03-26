import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Tree,
} from '@mantine/core'
import PropTypes from 'prop-types'
import fileAltIcon from '../assets/icons/file-alt-svgrepo-com.svg'
import folderAddIcon from '../assets/icons/folder-add-svgrepo-com.svg'
import folderIcon from '../assets/icons/folder-svgrepo-com.svg'
import { toMantineTreeData } from '../utils/tree.js'
import SyncReviewSidebar from './SyncReviewSidebar.jsx'
import WorldSidebar from './WorldSidebar.jsx'

function getFolderMeta(count) {
  if (count === 0) {
    return 'Empty folder'
  }

  return `${count} item${count === 1 ? '' : 's'}`
}

function WriteSidebarContent({
  createTargetId,
  onDownloadProject,
  onOpenDialog,
  onUploadProject,
  projectAction,
  tree,
  workspace,
}) {
  const treeData = toMantineTreeData(workspace)[0]?.children ?? []
  const rootItemCount = workspace.children.length

  return (
    <>
      <Group className="sidebar-utility-bar" gap="sm" wrap="nowrap">
        <Menu position="bottom-start" shadow="md" width={190} withinPortal>
          <Menu.Target>
            <Button
              className="rail-menu-button rail-menu-button--primary"
              rightSection={<span className="menu-caret">▾</span>}
              size="sm"
            >
              New
            </Button>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item onClick={() => onOpenDialog('newFile', createTargetId)}>New file</Menu.Item>
            <Menu.Item onClick={() => onOpenDialog('newFolder', createTargetId)}>
              New folder
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <Menu position="bottom-start" shadow="md" width={220} withinPortal>
          <Menu.Target>
            <Button
              className="rail-menu-button"
              rightSection={<span className="menu-caret">▾</span>}
              size="sm"
              variant="default"
            >
              Project
            </Button>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item disabled={Boolean(projectAction)} onClick={onDownloadProject}>
              {projectAction === 'download' ? 'Downloading...' : 'Download'}
            </Menu.Item>
            <Menu.Item disabled={Boolean(projectAction)} onClick={onUploadProject}>
              {projectAction === 'upload' ? 'Uploading...' : 'Upload'}
            </Menu.Item>

            <Menu.Divider />

            <Menu.Item className="project-menu-danger" onClick={() => onOpenDialog('newProject')}>
              Reset project
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Group className="sidebar-section-head" justify="space-between" align="flex-start" gap="sm">
        <Box>
          <Text className="eyebrow">Workspace tree</Text>
          <Text className="panel-title">Workspace</Text>
        </Box>

        <Group className="sidebar-header-tools" gap="xs" wrap="nowrap">
          <ActionIcon
            aria-label="Create file"
            onClick={() => onOpenDialog('newFile', createTargetId)}
            radius="xl"
            size="md"
            variant="default"
          >
            <img alt="" className="sidebar-action-svg" src={fileAltIcon} />
          </ActionIcon>

          <ActionIcon
            aria-label="Create folder"
            onClick={() => onOpenDialog('newFolder', createTargetId)}
            radius="xl"
            size="md"
            variant="default"
          >
            <img alt="" className="sidebar-action-svg" src={folderAddIcon} />
          </ActionIcon>

          <Badge color="dark" variant="light">
            {rootItemCount} item{rootItemCount === 1 ? '' : 's'}
          </Badge>
        </Group>
      </Group>

      <ScrollArea className="sidebar-scroll" offsetScrollbars type="scroll">
        {treeData.length > 0 ? (
          <Tree
            data={treeData}
            tree={tree}
            levelOffset="md"
            selectOnClick
            renderNode={({ elementProps, expanded, node, selected }) => {
              const { className, onClick, style, ...others } = elementProps
              const kind = node.nodeProps.kind
              const childCount = node.nodeProps.childCount ?? 0
              const meta = kind === 'folder' ? getFolderMeta(childCount) : 'Story file'

              return (
                <Group
                  {...others}
                  className={`explorer-node${selected ? ' is-selected' : ''}${
                    className ? ` ${className}` : ''
                  }`}
                  gap="sm"
                  onClick={onClick}
                  style={style}
                  wrap="nowrap"
                >
                  <span className="explorer-leading" aria-hidden="true">
                    <span className="tree-chevron">
                      {kind === 'folder' ? (expanded ? '▾' : '▸') : '•'}
                    </span>
                    <img
                      alt=""
                      className="tree-svg-icon"
                      src={kind === 'folder' ? folderIcon : fileAltIcon}
                    />
                  </span>

                  <Box className="explorer-copy">
                    <Text className="explorer-label" truncate="end">
                      {node.label}
                    </Text>
                    <Text className="explorer-meta">{meta}</Text>
                  </Box>
                </Group>
              )
            }}
          />
        ) : (
          <Box className="sidebar-empty">
            <Text className="panel-meta">
              Workspace is empty. Use New or the header shortcuts to add your first item.
            </Text>
          </Box>
        )}
      </ScrollArea>
    </>
  )
}

WriteSidebarContent.propTypes = {
  createTargetId: PropTypes.string.isRequired,
  onDownloadProject: PropTypes.func.isRequired,
  onOpenDialog: PropTypes.func.isRequired,
  onUploadProject: PropTypes.func.isRequired,
  projectAction: PropTypes.string,
  tree: PropTypes.object.isRequired,
  workspace: PropTypes.shape({
    name: PropTypes.string.isRequired,
    children: PropTypes.array.isRequired,
  }).isRequired,
}

function Sidebar({
  createTargetId,
  onDiscardReview,
  onStartSync,
  onDownloadProject,
  onOpenDialog,
  onUploadProject,
  projectAction,
  reviewSession,
  syncButtonDisabled,
  syncButtonLabel,
  tree,
  viewMode,
  onViewModeChange,
  worldModel,
  syncState,
  worldSelection,
  onWorldSelect,
  workspace,
}) {
  return (
    <Paper className="sidebar-panel" radius="xl" shadow="sm">
      <Stack h="100%" gap="lg">
        {viewMode !== 'review' ? (
          <SegmentedControl
            className="mode-tabs"
            data={[
              { label: 'Write', value: 'write' },
              { label: 'World', value: 'world' },
            ]}
            value={viewMode}
            onChange={onViewModeChange}
            fullWidth
            size="sm"
            data-testid="mode-tabs"
          />
        ) : null}

        {viewMode === 'write' ? (
          <WriteSidebarContent
            createTargetId={createTargetId}
            onDownloadProject={onDownloadProject}
            onOpenDialog={onOpenDialog}
            onUploadProject={onUploadProject}
            projectAction={projectAction}
            tree={tree}
            workspace={workspace}
          />
        ) : null}

        {viewMode === 'world' ? (
          <WorldSidebar
            onStartSync={onStartSync}
            syncButtonDisabled={syncButtonDisabled}
            syncButtonLabel={syncButtonLabel}
            worldModel={worldModel}
            syncState={syncState}
            worldSelection={worldSelection}
            onWorldSelect={onWorldSelect}
          />
        ) : null}

        {viewMode === 'review' && reviewSession ? (
          <SyncReviewSidebar
            onDiscard={onDiscardReview}
            reviewSession={reviewSession}
          />
        ) : null}
      </Stack>
    </Paper>
  )
}

Sidebar.propTypes = {
  createTargetId: PropTypes.string.isRequired,
  onDiscardReview: PropTypes.func.isRequired,
  onStartSync: PropTypes.func.isRequired,
  onDownloadProject: PropTypes.func.isRequired,
  onOpenDialog: PropTypes.func.isRequired,
  onUploadProject: PropTypes.func.isRequired,
  projectAction: PropTypes.string,
  reviewSession: PropTypes.object,
  syncButtonDisabled: PropTypes.bool.isRequired,
  syncButtonLabel: PropTypes.string.isRequired,
  tree: PropTypes.object.isRequired,
  viewMode: PropTypes.oneOf(['write', 'world', 'review']).isRequired,
  onViewModeChange: PropTypes.func.isRequired,
  worldModel: PropTypes.object,
  syncState: PropTypes.object,
  worldSelection: PropTypes.string,
  onWorldSelect: PropTypes.func.isRequired,
  workspace: PropTypes.shape({
    name: PropTypes.string.isRequired,
    children: PropTypes.array.isRequired,
  }).isRequired,
}

export default Sidebar
