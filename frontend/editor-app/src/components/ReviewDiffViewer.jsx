import { Box, Text } from '@mantine/core'
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

function ReviewDiffViewer({ previewDiff, testId }) {
  const diffLines = previewDiff.split('\n')

  return (
    <Box className="review-diff-viewer" data-testid={testId}>
      {diffLines.map((line, index) => (
        <Text className={getDiffLineClassName(line)} component="pre" key={`${line}-${index}`}>
          {line || ' '}
        </Text>
      ))}
    </Box>
  )
}

ReviewDiffViewer.propTypes = {
  previewDiff: PropTypes.string.isRequired,
  testId: PropTypes.string,
}

export default ReviewDiffViewer
