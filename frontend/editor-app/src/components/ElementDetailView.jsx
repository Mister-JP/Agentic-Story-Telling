import { Badge, Box, Collapse, Stack, Text, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import PropTypes from 'prop-types'
import { splitIntoSections } from '../utils/worldModel.js'

const TBD_MARKERS = new Set(['- TBD', 'TBD', ''])
const IDENTIFICATION_HEADING = '## Identification'

function SectionAccordion({ heading, body }) {
  const [opened, { toggle }] = useDisclosure(true)
  const label = heading.replace(/^##\s*/, '')
  const trimmedBody = body.trim()
  const isTbd = TBD_MARKERS.has(trimmedBody)

  return (
    <Box className="detail-section">
      <UnstyledButton
        className="detail-section-toggle"
        onClick={toggle}
        aria-expanded={opened}
      >
        <span className="detail-section-chevron">{opened ? '▼' : '▶'}</span>
        <Text className="detail-section-heading">{label}</Text>
      </UnstyledButton>

      <Collapse in={opened}>
        <Box className="detail-section-body">
          {isTbd ? (
            <Text className="detail-section-tbd" data-testid="tbd-placeholder">
              Not yet populated. Run a sync to fill this in.
            </Text>
          ) : (
            <Text className="detail-section-content" component="div">
              {trimmedBody.split('\n').map((line, index) => (
                <Text key={index} className="detail-section-line">
                  {line || '\u00A0'}
                </Text>
              ))}
            </Text>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

SectionAccordion.propTypes = {
  heading: PropTypes.string.isRequired,
  body: PropTypes.string.isRequired,
}

function ElementDetailView({ entry, detailMarkdown }) {
  if (!entry) {
    return null
  }

  const sections = detailMarkdown
    ? splitIntoSections(detailMarkdown).filter(
        (section) => section.heading.trim() !== IDENTIFICATION_HEADING,
      )
    : []

  const aliases = entry.aliases ?? ''
  const keys = entry.identification_keys ?? ''

  return (
    <Box className="detail-view" data-testid="element-detail-view">
      <Box className="detail-header">
        <Badge
          className="detail-kind-badge"
          color="dark"
          variant="light"
          size="sm"
        >
          {(entry.kind ?? 'element').toUpperCase()}
        </Badge>
        <Text className="detail-view-title">{entry.display_name}</Text>
        <Text className="detail-view-meta">
          {aliases ? `aka: ${aliases}` : ''}
          {aliases && entry.uuid ? '  ·  ' : ''}
          {entry.uuid ?? ''}
        </Text>
        {keys ? (
          <Text className="detail-view-keys">Keys: {keys}</Text>
        ) : null}
      </Box>

      <Stack gap="xs" mt="md">
        {sections.length > 0 ? (
          sections.map((section, index) => (
            <SectionAccordion
              key={index}
              heading={section.heading}
              body={section.body}
            />
          ))
        ) : (
          <Text className="detail-section-tbd" data-testid="tbd-placeholder">
            No detail file available. Run a sync to populate this element.
          </Text>
        )}
      </Stack>
    </Box>
  )
}

ElementDetailView.propTypes = {
  entry: PropTypes.shape({
    display_name: PropTypes.string.isRequired,
    uuid: PropTypes.string,
    kind: PropTypes.string,
    aliases: PropTypes.string,
    identification_keys: PropTypes.string,
  }),
  detailMarkdown: PropTypes.string,
}

export default ElementDetailView
