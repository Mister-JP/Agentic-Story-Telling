import {
  Box,
  Button,
  Collapse,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import {
  groupElementsByKind,
  groupEventsByChapter,
  isDetailPopulated,
} from '../utils/worldModel.js'

const ELEMENT_KIND_ORDER = ['person', 'place', 'item', 'animal', 'relationship', 'concept', 'group', 'other']

// ── Collapsible group header ──────────────────────────────────────────────

function GroupSection({ title, count, children }) {
  const [opened, { toggle }] = useDisclosure(true)

  return (
    <Box className="world-sidebar-group">
      <UnstyledButton className="world-sidebar-group-toggle" onClick={toggle}>
        <Text className="world-sidebar-group-label">
          {title} ({count})
        </Text>
        <span className="world-sidebar-group-chevron">{opened ? '▾' : '▸'}</span>
      </UnstyledButton>

      <Collapse in={opened}>
        <Stack gap={2} className="world-sidebar-group-items">
          {children}
        </Stack>
      </Collapse>
    </Box>
  )
}

GroupSection.propTypes = {
  title: PropTypes.string.isRequired,
  count: PropTypes.number.isRequired,
  children: PropTypes.node.isRequired,
}

// ── Single item row ───────────────────────────────────────────────────────

function WorldItem({ label, isPopulated, isSelected, onClick }) {
  const dotClass = isPopulated ? 'world-dot is-populated' : 'world-dot'
  const rowClass = `world-sidebar-item${isSelected ? ' is-selected' : ''}`

  return (
    <UnstyledButton className={rowClass} onClick={onClick} data-testid="world-item">
      <span className={dotClass} aria-hidden="true">
        {isPopulated ? '●' : '○'}
      </span>
      <Text className="world-sidebar-item-label" truncate="end">{label}</Text>
    </UnstyledButton>
  )
}

WorldItem.propTypes = {
  label: PropTypes.string.isRequired,
  isPopulated: PropTypes.bool.isRequired,
  isSelected: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
}

// ── Search filter logic ───────────────────────────────────────────────────

function matchesQuery(text, query) {
  if (!query) {
    return true
  }

  return text.toLowerCase().includes(query.toLowerCase())
}

function filterEntries(entries, query, labelField) {
  if (!query) {
    return entries
  }

  return entries.filter((entry) => matchesQuery(entry[labelField] ?? '', query))
}

function WorldSyncButton({ disabled, label, onStartSync }) {
  return (
    <Button
      className="world-sidebar-sync-button"
      data-testid="world-sync-button"
      disabled={disabled}
      fullWidth
      onClick={onStartSync}
      size="sm"
    >
      {label}
    </Button>
  )
}

WorldSyncButton.propTypes = {
  disabled: PropTypes.bool.isRequired,
  label: PropTypes.string.isRequired,
  onStartSync: PropTypes.func.isRequired,
}

function PopulatedWorldSyncBlock({ disabled, label, lastSyncLabel, onStartSync, syncStatusLabel }) {
  return (
    <Box className="world-sidebar-sync-block">
      <WorldSyncButton disabled={disabled} label={label} onStartSync={onStartSync} />
      <Text className="world-sidebar-sync-status">{syncStatusLabel}</Text>
      {lastSyncLabel ? (
        <Text className="world-sidebar-sync-meta">{lastSyncLabel}</Text>
      ) : null}
    </Box>
  )
}

PopulatedWorldSyncBlock.propTypes = {
  disabled: PropTypes.bool.isRequired,
  label: PropTypes.string.isRequired,
  lastSyncLabel: PropTypes.string,
  onStartSync: PropTypes.func.isRequired,
  syncStatusLabel: PropTypes.string.isRequired,
}

// ── Main sidebar ──────────────────────────────────────────────────────────

function WorldSidebar({
  onStartSync,
  syncButtonDisabled,
  syncButtonLabel,
  worldModel,
  syncState,
  worldSelection,
  onWorldSelect,
}) {
  const [searchQuery, setSearchQuery] = useState('')

  const elementGroups = useMemo(() => {
    if (!worldModel) {
      return {}
    }

    return groupElementsByKind(worldModel.elements.entries)
  }, [worldModel])

  const eventGroups = useMemo(() => {
    if (!worldModel) {
      return {}
    }

    return groupEventsByChapter(worldModel.events.entries)
  }, [worldModel])

  // No world model — empty state
  if (!worldModel) {
    return (
      <Stack gap="md" className="world-sidebar-content" data-testid="world-sidebar-empty">
        <WorldSyncButton
          disabled={syncButtonDisabled}
          label={syncButtonLabel}
          onStartSync={onStartSync}
        />
        <Text className="topbar-context-meta">
          No world model yet. Write some story content and sync to build your world.
        </Text>
      </Stack>
    )
  }

  const syncStatusLabel = syncState?.status === 'synced' ? '● Synced' : '● Not synced'
  const lastSyncLabel = syncState?.lastSyncedAt
    ? `Last sync: ${new Date(syncState.lastSyncedAt).toLocaleString()}`
    : null

  return (
    <Stack h="100%" gap="sm" className="world-sidebar-content" data-testid="world-sidebar">
      <PopulatedWorldSyncBlock
        disabled={syncButtonDisabled}
        label={syncButtonLabel}
        lastSyncLabel={lastSyncLabel}
        onStartSync={onStartSync}
        syncStatusLabel={syncStatusLabel}
      />

      {/* Search */}
      <TextInput
        className="world-sidebar-search"
        placeholder="Search elements / events…"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.currentTarget.value)}
        data-testid="world-search-input"
        size="sm"
      />

      {/* Scrollable list */}
      <ScrollArea className="world-sidebar-scroll" offsetScrollbars type="scroll">
        <Stack gap="sm">
          {/* Element groups */}
          {ELEMENT_KIND_ORDER.map((kind) => {
            const entries = elementGroups[kind]

            if (!entries || entries.length === 0) {
              return null
            }

            const filtered = filterEntries(entries, searchQuery, 'display_name')

            if (filtered.length === 0) {
              return null
            }

            return (
              <GroupSection
                key={kind}
                title={kind.toUpperCase()}
                count={filtered.length}
              >
                {filtered.map((entry) => (
                  <WorldItem
                    key={entry.uuid}
                    label={entry.display_name}
                    isPopulated={isDetailPopulated(worldModel.elements.details[entry.uuid] ?? '')}
                    isSelected={worldSelection === entry.uuid}
                    onClick={() => onWorldSelect(entry.uuid)}
                  />
                ))}
              </GroupSection>
            )
          })}

          {/* Event groups */}
          {Object.keys(eventGroups)
            .sort()
            .map((chapterKey) => {
              const entries = eventGroups[chapterKey]
              const filtered = filterEntries(entries, searchQuery, 'summary')

              if (filtered.length === 0) {
                return null
              }

              return (
                <GroupSection
                  key={chapterKey}
                  title={chapterKey}
                  count={filtered.length}
                >
                  {filtered.map((entry) => (
                    <WorldItem
                      key={entry.uuid}
                      label={entry.summary}
                      isPopulated={isDetailPopulated(worldModel.events.details[entry.uuid] ?? '')}
                      isSelected={worldSelection === entry.uuid}
                      onClick={() => onWorldSelect(entry.uuid)}
                    />
                  ))}
                </GroupSection>
              )
            })}
        </Stack>
      </ScrollArea>
    </Stack>
  )
}

WorldSidebar.propTypes = {
  onStartSync: PropTypes.func.isRequired,
  syncButtonDisabled: PropTypes.bool.isRequired,
  syncButtonLabel: PropTypes.string.isRequired,
  worldModel: PropTypes.object,
  syncState: PropTypes.object,
  worldSelection: PropTypes.string,
  onWorldSelect: PropTypes.func.isRequired,
}

export default WorldSidebar
