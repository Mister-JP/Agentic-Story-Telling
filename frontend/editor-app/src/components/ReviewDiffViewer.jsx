import { Box, Group, Stack, Text } from '@mantine/core'
import PropTypes from 'prop-types'

function getDiffLineClassName(line) {
  if (line.startsWith('+++') || line.startsWith('---')) {
    return 'review-diff-line review-diff-line--header'
  }

  if (line.startsWith('+')) {
    return 'review-diff-line review-diff-line--added'
  }

  if (line.startsWith('-')) {
    return 'review-diff-line review-diff-line--removed'
  }

  if (line.startsWith('@@')) {
    return 'review-diff-line review-diff-line--hunk'
  }

  return 'review-diff-line review-diff-line--context'
}

function buildDiffSummary(previewDiff) {
  const diffLines = previewDiff.split('\n')
  let addedCount = 0
  let removedCount = 0
  let filePath = ''
  const highlights = []
  const seenHighlights = new Set()

  diffLines.forEach((line) => {
    if (line.startsWith('+++ ')) {
      filePath = line.replace('+++ b/', '').replace('+++ ', '').trim()
      return
    }

    if (line.startsWith('--- ') || line.startsWith('@@')) {
      return
    }

    if (line.startsWith('+')) {
      addedCount += 1
    } else if (line.startsWith('-')) {
      removedCount += 1
    } else {
      return
    }

    const normalizedLine = line.slice(1).trim()
    if (!normalizedLine || normalizedLine === 'TBD') {
      return
    }

    if (seenHighlights.has(normalizedLine) || highlights.length >= 4) {
      return
    }

    seenHighlights.add(normalizedLine)
    highlights.push({
      kind: line.startsWith('+') ? 'added' : 'removed',
      text: normalizedLine,
    })
  })

  return {
    addedCount,
    filePath,
    highlights,
    removedCount,
  }
}

function ReviewDiffViewer({ previewDiff, testId }) {
  const diffLines = previewDiff.split('\n')
  const { addedCount, filePath, highlights, removedCount } = buildDiffSummary(previewDiff)

  return (
    <Box className="review-diff-shell" data-testid={testId}>
      <Group className="review-diff-summary" gap="sm">
        {filePath ? (
          <Text className="review-diff-pill review-diff-pill--path">{filePath}</Text>
        ) : null}
        <Text className="review-diff-pill review-diff-pill--added">+{addedCount} added</Text>
        <Text className="review-diff-pill review-diff-pill--removed">-{removedCount} removed</Text>
      </Group>

      {highlights.length > 0 ? (
        <Stack className="review-diff-highlights" gap="xs">
          <Text className="review-delta-label">Readable highlights</Text>
          {highlights.map((highlight, index) => (
            <Box
              className={`review-highlight-row review-highlight-row--${highlight.kind}`}
              key={`${highlight.kind}-${highlight.text}-${index}`}
            >
              <Text className="review-highlight-kicker">
                {highlight.kind === 'added' ? 'Added' : 'Removed'}
              </Text>
              <Text className="review-highlight-copy">{highlight.text}</Text>
            </Box>
          ))}
        </Stack>
      ) : null}

      <details className="review-diff-details">
        <summary className="review-diff-toggle">Show raw diff</summary>
        <Box className="review-diff-viewer">
          {diffLines.map((line, index) => (
            <Text className={getDiffLineClassName(line)} component="pre" key={`${line}-${index}`}>
              {line || ' '}
            </Text>
          ))}
        </Box>
      </details>
    </Box>
  )
}

ReviewDiffViewer.propTypes = {
  previewDiff: PropTypes.string.isRequired,
  testId: PropTypes.string,
}

export default ReviewDiffViewer
