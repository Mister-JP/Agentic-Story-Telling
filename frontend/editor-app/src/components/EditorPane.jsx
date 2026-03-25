import { Button, Group, Text, UnstyledButton } from '@mantine/core'
import { RichTextEditor } from '@mantine/tiptap'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import PropTypes from 'prop-types'
import { useEffect, useRef } from 'react'
import fileAltIcon from '../assets/icons/file-alt-svgrepo-com.svg'
import folderIcon from '../assets/icons/folder-svgrepo-com.svg'
import { ROOT_ID } from '../data/initialTree.js'

const EMPTY_DOCUMENT = '<p></p>'
const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3, 4, 5, 6],
    },
  }),
]

function ToolbarSvg({ children, style, viewBox }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      style={{ display: 'block', ...style }}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  )
}

ToolbarSvg.propTypes = {
  children: PropTypes.node.isRequired,
  style: PropTypes.object,
  viewBox: PropTypes.string.isRequired,
}

function CodeIcon({ style }) {
  return (
    <ToolbarSvg style={style} viewBox="0 0 24 24">
      <path
        d="M9 8L5 11.6923L9 16M15 8L19 11.6923L15 16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </ToolbarSvg>
  )
}

CodeIcon.propTypes = {
  style: PropTypes.object,
}

function CodeBlockIcon({ style }) {
  return (
    <ToolbarSvg style={style} viewBox="0 0 24 24">
      <path
        d="M3 6H3.01919M3.01919 6H20.9809M3.01919 6C3 6.31438 3 6.70191 3 7.2002V16.8002C3 17.9203 3 18.4796 3.21799 18.9074C3.40973 19.2837 3.71547 19.5905 4.0918 19.7822C4.51921 20 5.079 20 6.19694 20L17.8031 20C18.921 20 19.48 20 19.9074 19.7822C20.2837 19.5905 20.5905 19.2837 20.7822 18.9074C21 18.48 21 17.921 21 16.8031L21 7.19691C21 6.70021 21 6.31368 20.9809 6M3.01919 6C3.04314 5.60768 3.09697 5.3293 3.21799 5.0918C3.40973 4.71547 3.71547 4.40973 4.0918 4.21799C4.51962 4 5.08009 4 6.2002 4H17.8002C18.9203 4 19.4796 4 19.9074 4.21799C20.2837 4.40973 20.5905 4.71547 20.7822 5.0918C20.9032 5.3293 20.957 5.60768 20.9809 6M20.9809 6H21M14 11L16 13L14 15M10 15L8 13L10 11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </ToolbarSvg>
  )
}

CodeBlockIcon.propTypes = {
  style: PropTypes.object,
}

function HorizontalRuleIcon({ style }) {
  return (
    <ToolbarSvg style={style} viewBox="0 0 20 20">
      <path
        d="M2 9.75C2 9.33579 2.33579 9 2.75 9H17.25C17.6642 9 18 9.33579 18 9.75C18 10.1642 17.6642 10.5 17.25 10.5H2.75C2.33579 10.5 2 10.1642 2 9.75Z"
        fill="currentColor"
      />
    </ToolbarSvg>
  )
}

HorizontalRuleIcon.propTypes = {
  style: PropTypes.object,
}

const childNodeShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['file', 'folder']).isRequired,
  children: PropTypes.array,
})

const nodeShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['file', 'folder']).isRequired,
  children: PropTypes.arrayOf(childNodeShape),
})

const fileShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['file']).isRequired,
  content: PropTypes.string.isRequired,
})

function getFolderMeta(item) {
  if (item.type === 'folder') {
    const count = item.children?.length ?? 0
    return `${count} item${count === 1 ? '' : 's'}`
  }

  return 'Story file'
}

function EditorPane({
  onOpenDialog,
  onSave,
  onSelectNode,
  selectedFile,
  selectedNode,
  selectionMode,
}) {
  const hasSelectedFile = Boolean(selectedFile)
  const latestOnSaveRef = useRef(onSave)
  const initialContentRef = useRef(selectedFile?.content ?? EMPTY_DOCUMENT)
  const latestSelectedFileIdRef = useRef(selectedFile?.id ?? null)
  const lastSyncedContentRef = useRef(initialContentRef.current)
  const folderItems = selectedNode?.type === 'folder' ? selectedNode.children ?? [] : []

  useEffect(() => {
    latestOnSaveRef.current = onSave
  }, [onSave])

  const editor = useEditor({
    content: initialContentRef.current,
    editable: hasSelectedFile,
    extensions: EDITOR_EXTENSIONS,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: activeEditor }) => {
      const nextContent = activeEditor.getHTML()
      const nextFileId = latestSelectedFileIdRef.current

      lastSyncedContentRef.current = nextContent

      if (nextFileId) {
        latestOnSaveRef.current(nextFileId, nextContent)
      }
    },
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    editor.setEditable(hasSelectedFile)
  }, [editor, hasSelectedFile])

  useEffect(() => {
    if (!editor) {
      return
    }

    const nextFileId = selectedFile?.id ?? null
    const nextContent = selectedFile?.content ?? EMPTY_DOCUMENT
    const switchedFiles = latestSelectedFileIdRef.current !== nextFileId
    const contentChangedOutsideEditor = nextContent !== lastSyncedContentRef.current

    latestSelectedFileIdRef.current = nextFileId

    if (switchedFiles || contentChangedOutsideEditor) {
      editor.commands.setContent(nextContent, false)
      lastSyncedContentRef.current = nextContent
    }
  }, [editor, selectedFile?.content, selectedFile?.id])

  if (selectionMode === 'empty') {
    return (
      <div className="editor-panel editor-panel--context">
        <div className="editor-empty-state">
          <Text className="eyebrow">Workspace ready</Text>
          <Text className="panel-title">Start with a scene, note, or folder.</Text>
          <Text className="panel-meta">
            Your left rail is now the control deck. Create a file or folder there, then use this
            space for drafting and revision.
          </Text>

          <Group className="empty-state-actions" gap="sm">
            <Button onClick={() => onOpenDialog('newFile', ROOT_ID)} size="sm">
              New file
            </Button>
            <Button onClick={() => onOpenDialog('newFolder', ROOT_ID)} size="sm" variant="subtle">
              Create folder
            </Button>
          </Group>
        </div>
      </div>
    )
  }

  if (selectionMode === 'folder') {
    return (
      <div className="editor-panel editor-panel--context">
        <div className="editor-context-actions">
          <Button onClick={() => onOpenDialog('newFile', selectedNode.id)} size="sm">
            New file in folder
          </Button>
          <Button
            onClick={() => onOpenDialog('newFolder', selectedNode.id)}
            size="sm"
            variant="default"
          >
            New folder inside
          </Button>
        </div>

        <div className="editor-context-card">
          <div className="folder-contents">
            <div className="folder-contents-header">
              <Text className="eyebrow">Contents</Text>
              <Text className="folder-count-pill">
                {folderItems.length} item{folderItems.length === 1 ? '' : 's'}
              </Text>
            </div>

            {folderItems.length > 0 ? (
              <div className="folder-item-list">
                {folderItems.map((item) => (
                  <UnstyledButton
                    className="folder-item-row"
                    key={item.id}
                    onClick={() => onSelectNode(item.id)}
                    type="button"
                  >
                    <div className="folder-item-leading" aria-hidden="true">
                      <img
                        alt=""
                        className="folder-item-icon"
                        src={item.type === 'folder' ? folderIcon : fileAltIcon}
                      />
                    </div>
                    <div className="folder-item-copy">
                      <Text className="folder-item-label">{item.name}</Text>
                      <Text className="folder-item-meta">{getFolderMeta(item)}</Text>
                    </div>
                  </UnstyledButton>
                ))}
              </div>
            ) : (
              <div className="folder-empty-note">
                <Text className="panel-meta">
                  This folder is empty. Use the actions above to add your first file or subfolder.
                </Text>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-panel editor-panel--file">
      <div className="editor-surface">
        <RichTextEditor editor={editor} variant="default">
          <RichTextEditor.Toolbar sticky stickyOffset={4}>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Undo />
              <RichTextEditor.Redo />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Bold />
              <RichTextEditor.Italic />
              <RichTextEditor.Underline />
              <RichTextEditor.Strikethrough />
              <RichTextEditor.ClearFormatting />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Link />
              <RichTextEditor.Unlink />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.BulletList />
              <RichTextEditor.OrderedList />
              <RichTextEditor.Blockquote />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.H1 />
              <RichTextEditor.H2 />
              <RichTextEditor.H3 />
              <RichTextEditor.H4 />
              <RichTextEditor.H5 />
              <RichTextEditor.H6 />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Code icon={CodeIcon} />
              <RichTextEditor.CodeBlock icon={CodeBlockIcon} />
              <RichTextEditor.Hr icon={HorizontalRuleIcon} />
            </RichTextEditor.ControlsGroup>
          </RichTextEditor.Toolbar>

          <RichTextEditor.Content />
        </RichTextEditor>
      </div>
    </div>
  )
}

EditorPane.propTypes = {
  onOpenDialog: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onSelectNode: PropTypes.func.isRequired,
  selectedFile: fileShape,
  selectedNode: nodeShape.isRequired,
  selectionMode: PropTypes.oneOf(['empty', 'file', 'folder']).isRequired,
}

export default EditorPane
