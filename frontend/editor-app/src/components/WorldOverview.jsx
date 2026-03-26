import { Badge, Box, Stack, Text } from '@mantine/core'
import PropTypes from 'prop-types'
import { extractDetailSummary, isDetailPopulated } from '../utils/worldModel.js'

const ELEMENT_KIND_ORDER = ['person', 'place', 'item', 'animal', 'relationship', 'concept', 'group', 'other']

function formatTimestamp(isoString) {
  if (!isoString) {
    return null
  }

  try {
    return new Date(isoString).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

function countPopulatedDetails(entries, details) {
  return entries.filter(
    (entry) => {
      const uuid = entry.uuid ?? entry.display_name
      return isDetailPopulated(details[uuid] ?? '')
    },
  ).length
}

function buildKindBreakdown(entries) {
  const counts = {}

  for (const entry of entries) {
    const kind = (entry.kind ?? 'other').toLowerCase()
    counts[kind] = (counts[kind] ?? 0) + 1
  }

  return ELEMENT_KIND_ORDER
    .filter((kind) => counts[kind] > 0)
    .map((kind) => `${counts[kind]} ${kind}${counts[kind] === 1 ? '' : 's'}`)
    .join('  ·  ')
}

function buildChapterBreakdown(entries) {
  const chapters = new Set()

  for (const entry of entries) {
    const raw = entry.chapters ?? ''
    const parts = raw.split(',').map((part) => part.trim()).filter(Boolean)
    for (const chapter of parts) {
      chapters.add(chapter)
    }
  }

  return `${chapters.size} chapter${chapters.size === 1 ? '' : 's'} covered`
}

function RecentCard({ label, summary }) {
  return (
    <Box className="world-overview-recent-card">
      <Text className="world-overview-recent-label">{label}</Text>
      {summary ? (
        <Text className="world-overview-recent-summary">{summary}</Text>
      ) : (
        <Text className="world-overview-recent-summary is-muted">Not yet populated</Text>
      )}
    </Box>
  )
}

RecentCard.propTypes = {
  label: PropTypes.string.isRequired,
  summary: PropTypes.string,
}

function EmptyWorldState() {
  return (
    <Box className="world-overview-empty" data-testid="world-overview-empty">
      <Text className="world-overview-title">World Model</Text>
      <Stack gap="md" mt="lg">
        <Text className="topbar-context-meta">No world model yet.</Text>
        <Text className="topbar-context-meta">
          Write your story in the editor, then come back here and click
          &quot;Sync World Model&quot; to have the AI identify your characters,
          places, items, and events.
        </Text>
        <Text className="topbar-context-meta">
          The world model builds incrementally — sync whenever you&apos;ve made
          meaningful changes to your story.
        </Text>
      </Stack>
    </Box>
  )
}

function WorldOverview({ worldModel, syncState }) {
  if (!worldModel) {
    return <EmptyWorldState />
  }

  const { elements, events } = worldModel
  const elementCount = elements.entries.length
  const eventCount = events.entries.length
  const populatedElements = countPopulatedDetails(elements.entries, elements.details)
  const populatedEvents = countPopulatedDetails(events.entries, events.details)
  const kindBreakdown = buildKindBreakdown(elements.entries)
  const chapterBreakdown = buildChapterBreakdown(events.entries)
  const lastSyncedLabel = formatTimestamp(syncState?.lastSyncedAt)

  // Pick the first entry with a populated detail as a "recent" card
  const recentElement = elements.entries.find(
    (entry) => isDetailPopulated(elements.details[entry.uuid] ?? ''),
  )
  const recentEvent = events.entries.find(
    (entry) => isDetailPopulated(events.details[entry.uuid] ?? ''),
  )

  return (
    <Box className="world-overview" data-testid="world-overview">
      <Text className="eyebrow">World Model</Text>
      <Text className="world-overview-title">My Saga</Text>

      <div className="world-overview-stats">
        <Box className="world-overview-stat-card" data-testid="element-count">
          <Text className="world-overview-stat-number">{elementCount}</Text>
          <Text className="world-overview-stat-label">Elements</Text>
        </Box>
        <Box className="world-overview-stat-card" data-testid="event-count">
          <Text className="world-overview-stat-number">{eventCount}</Text>
          <Text className="world-overview-stat-label">Events</Text>
        </Box>
        {lastSyncedLabel ? (
          <Box className="world-overview-stat-card">
            <Text className="world-overview-stat-label">Last synced</Text>
            <Text className="world-overview-stat-number world-overview-stat-number--small">
              {lastSyncedLabel}
            </Text>
          </Box>
        ) : null}
      </div>

      <Stack gap="xs" mt="lg">
        <Text className="topbar-context-meta">
          <strong>Element breakdown:</strong> {kindBreakdown}
        </Text>
        <Text className="topbar-context-meta">
          {populatedElements} of {elementCount} details populated
        </Text>
      </Stack>

      <Stack gap="xs" mt="md">
        <Text className="topbar-context-meta">
          <strong>Event breakdown:</strong> {chapterBreakdown}  ·  {eventCount} events tracked
        </Text>
        <Text className="topbar-context-meta">
          {populatedEvents} of {eventCount} details populated
        </Text>
      </Stack>

      {(recentElement || recentEvent) ? (
        <Stack gap="sm" mt="xl">
          <Badge color="dark" variant="light" size="sm">Recently updated</Badge>
          {recentElement ? (
            <RecentCard
              label={`${recentElement.display_name} (${recentElement.kind})`}
              summary={extractDetailSummary(elements.details[recentElement.uuid] ?? '')}
            />
          ) : null}
          {recentEvent ? (
            <RecentCard
              label={`${recentEvent.summary} (event)`}
              summary={extractDetailSummary(events.details[recentEvent.uuid] ?? '')}
            />
          ) : null}
        </Stack>
      ) : null}
    </Box>
  )
}

WorldOverview.propTypes = {
  worldModel: PropTypes.object,
  syncState: PropTypes.object,
}

export default WorldOverview
