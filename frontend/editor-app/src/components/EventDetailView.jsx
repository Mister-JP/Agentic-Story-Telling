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

function EventDetailView({ entry, detailMarkdown }) {
  if (!entry) {
    return null
  }

  const sections = detailMarkdown
    ? splitIntoSections(detailMarkdown).filter(
        (section) => section.heading.trim() !== IDENTIFICATION_HEADING,
      )
    : []

  const metaParts = [
    entry.when ? `When: ${entry.when}` : null,
    entry.chapters ? `Chapters: ${entry.chapters}` : null,
    entry.uuid ?? null,
  ].filter(Boolean)

  return (
    <Box className="detail-view" data-testid="event-detail-view">
      <Box className="detail-header">
        <Badge
          className="detail-kind-badge"
          color="dark"
          variant="light"
          size="sm"
        >
          EVENT
        </Badge>
        <Text className="detail-view-title">{entry.summary}</Text>
        <Text className="detail-view-meta">{metaParts.join('  ·  ')}</Text>
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
            No detail file available. Run a sync to populate this event.
          </Text>
        )}
      </Stack>
    </Box>
  )
}

EventDetailView.propTypes = {
  entry: PropTypes.shape({
    uuid: PropTypes.string,
    when: PropTypes.string,
    chapters: PropTypes.string,
    summary: PropTypes.string.isRequired,
  }),
  detailMarkdown: PropTypes.string,
}

export default EventDetailView
