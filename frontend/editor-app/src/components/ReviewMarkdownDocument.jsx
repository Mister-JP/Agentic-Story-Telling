import { Box, Group, Stack, Text } from '@mantine/core'
import PropTypes from 'prop-types'
import { splitIntoSections } from '../utils/worldModel.js'

function extractDocumentTitle(markdown, fallbackTitle) {
  const titleLine = markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '))

  if (titleLine) {
    return titleLine.slice(2).trim()
  }

  return fallbackTitle
}

function parseMetadataRows(body) {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2))
    .map((line) => {
      const separatorIndex = line.indexOf(':')
      if (separatorIndex === -1) {
        return null
      }

      return {
        label: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim() || 'Not supplied',
      }
    })
    .filter(Boolean)
}

function splitIntoSubsections(body) {
  const lines = body.split('\n')
  const groups = []
  let currentGroup = { lines: [], title: null }

  function flushCurrentGroup() {
    const hasContent = currentGroup.title || currentGroup.lines.some((line) => line.trim() !== '')
    if (!hasContent) {
      return
    }

    groups.push(currentGroup)
  }

  lines.forEach((line) => {
    if (line.startsWith('### ')) {
      flushCurrentGroup()
      currentGroup = {
        lines: [],
        title: line.slice(4).trim(),
      }
      return
    }

    currentGroup.lines.push(line)
  })

  flushCurrentGroup()

  if (groups.length === 0) {
    return [{ lines, title: null }]
  }

  return groups
}

function buildContentBlocks(lines) {
  const blocks = []
  let currentBlock = null

  function flushCurrentBlock() {
    if (!currentBlock) {
      return
    }

    blocks.push(currentBlock)
    currentBlock = null
  }

  lines.forEach((line) => {
    const trimmedLine = line.trim()

    if (trimmedLine === '') {
      flushCurrentBlock()
      return
    }

    if (trimmedLine.startsWith('- ')) {
      if (!currentBlock || currentBlock.type !== 'list') {
        flushCurrentBlock()
        currentBlock = { items: [], type: 'list' }
      }

      currentBlock.items.push(trimmedLine.slice(2).trim())
      return
    }

    if (!currentBlock || currentBlock.type !== 'paragraph') {
      flushCurrentBlock()
      currentBlock = { lines: [], type: 'paragraph' }
    }

    currentBlock.lines.push(trimmedLine)
  })

  flushCurrentBlock()

  return blocks
}

function parseProvenanceItem(item) {
  const parts = item.split(' | ').map((part) => part.trim())
  if (parts.length !== 4) {
    return null
  }

  return {
    claim: parts[1],
    evidence: parts[3],
    section: parts[0],
    source: parts[2],
  }
}

function MetadataGrid({ rows }) {
  if (rows.length === 0) {
    return null
  }

  return (
    <Box className="review-doc-meta-grid">
      {rows.map((row) => (
        <Box className="review-doc-meta-card" key={row.label}>
          <Text className="review-delta-label">{row.label}</Text>
          <Text className="review-doc-meta-value">{row.value}</Text>
        </Box>
      ))}
    </Box>
  )
}

MetadataGrid.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired,
  })).isRequired,
}

function ContentBlock({ block }) {
  if (block.type === 'list') {
    return (
      <Stack className="review-doc-list" gap="xs">
        {block.items.map((item) => {
          const provenance = parseProvenanceItem(item)

          if (provenance) {
            return (
              <Box className="review-doc-bullet review-doc-bullet--provenance" key={item}>
                <Group justify="space-between" wrap="wrap">
                  <Text className="review-highlight-kicker">{provenance.section}</Text>
                  <Text className="review-delta-meta">{provenance.source}</Text>
                </Group>
                <Text className="review-doc-bullet-copy">{provenance.claim}</Text>
                <Text className="review-delta-meta">{provenance.evidence}</Text>
              </Box>
            )
          }

          return (
            <Box className="review-doc-bullet" key={item}>
              <Text className="review-doc-bullet-copy">{item}</Text>
            </Box>
          )
        })}
      </Stack>
    )
  }

  return (
    <Text className="review-doc-paragraph">
      {block.lines.join(' ')}
    </Text>
  )
}

ContentBlock.propTypes = {
  block: PropTypes.shape({
    items: PropTypes.arrayOf(PropTypes.string),
    lines: PropTypes.arrayOf(PropTypes.string),
    type: PropTypes.oneOf(['list', 'paragraph']).isRequired,
  }).isRequired,
}

function DocumentSection({ section }) {
  const metadataRows = section.heading.trim() === '## Identification'
    ? parseMetadataRows(section.body)
    : []
  const subsections = splitIntoSubsections(section.body)

  return (
    <Box className="review-doc-section">
      <Text className="review-doc-section-title">{section.heading.replace(/^##\s+/, '')}</Text>

      {metadataRows.length > 0 ? <MetadataGrid rows={metadataRows} /> : null}

      <Stack gap="md">
        {subsections.map((subsection, subsectionIndex) => {
          const blocks = buildContentBlocks(subsection.lines)
          const subsectionKey = `${section.heading}-${subsection.title ?? 'body'}-${subsectionIndex}`

          if (blocks.length === 0) {
            return (
              <Box className="review-doc-subsection" key={subsectionKey}>
                {subsection.title ? (
                  <Text className="review-doc-subtitle">{subsection.title}</Text>
                ) : null}
                <Text className="review-delta-meta">No supported content remains in this section.</Text>
              </Box>
            )
          }

          return (
            <Box className="review-doc-subsection" key={subsectionKey}>
              {subsection.title ? (
                <Text className="review-doc-subtitle">{subsection.title}</Text>
              ) : null}
              <Stack gap="sm">
                {blocks.map((block, blockIndex) => (
                  <ContentBlock block={block} key={`${subsectionKey}-${block.type}-${blockIndex}`} />
                ))}
              </Stack>
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}

DocumentSection.propTypes = {
  section: PropTypes.shape({
    body: PropTypes.string.isRequired,
    heading: PropTypes.string.isRequired,
  }).isRequired,
}

function ReviewMarkdownDocument({
  emptyCopy = 'No markdown content is available for this state.',
  fallbackTitle = 'Untitled dossier',
  filePath = '',
  label,
  markdown = '',
  statusLabel = '',
  statusTone = 'update',
  testId,
}) {
  const trimmedMarkdown = markdown.trim()
  const title = extractDocumentTitle(trimmedMarkdown, fallbackTitle)
  const sections = trimmedMarkdown ? splitIntoSections(trimmedMarkdown) : []

  return (
    <Box className="review-summary-card review-doc-shell" data-testid={testId}>
      <Group align="flex-start" justify="space-between" wrap="wrap">
        <Box className="review-delta-copy">
          <Text className="review-delta-label">{label}</Text>
          <Text className="review-doc-title">{title}</Text>
          {filePath ? (
            <Text className="review-delta-meta">{filePath}</Text>
          ) : null}
        </Box>
        {statusLabel ? (
          <Text className={`review-delta-badge review-delta-badge--${statusTone}`}>
            {statusLabel}
          </Text>
        ) : null}
      </Group>

      {trimmedMarkdown ? (
        <Stack gap="md" mt="lg">
          {sections.map((section) => (
            <DocumentSection key={section.heading} section={section} />
          ))}

          <details className="review-doc-raw">
            <summary className="review-doc-raw-toggle">Show raw markdown</summary>
            <Box className="review-doc-raw-viewer">
              <Text className="review-diff-line review-diff-line--context" component="pre">
                {trimmedMarkdown}
              </Text>
            </Box>
          </details>
        </Stack>
      ) : (
        <Box className="review-empty-diff" mt="lg">
          <Text className="review-empty-copy">{emptyCopy}</Text>
        </Box>
      )}
    </Box>
  )
}

ReviewMarkdownDocument.propTypes = {
  emptyCopy: PropTypes.string,
  fallbackTitle: PropTypes.string,
  filePath: PropTypes.string,
  label: PropTypes.string.isRequired,
  markdown: PropTypes.string,
  statusLabel: PropTypes.string,
  statusTone: PropTypes.oneOf(['create', 'delete', 'neutral', 'update']),
  testId: PropTypes.string,
}

export default ReviewMarkdownDocument
