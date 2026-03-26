import { Box, ScrollArea } from '@mantine/core'
import PropTypes from 'prop-types'
import ElementDetailView from './ElementDetailView.jsx'
import EventDetailView from './EventDetailView.jsx'
import WorldOverview from './WorldOverview.jsx'

function findEntryByUuid(entries, uuid) {
  return entries.find((entry) => entry.uuid === uuid) ?? null
}

function WorldPanel({ worldModel, syncState, worldSelection }) {
  if (!worldSelection || !worldModel) {
    return (
      <ScrollArea className="world-panel-scroll" offsetScrollbars type="scroll">
        <WorldOverview worldModel={worldModel} syncState={syncState} />
      </ScrollArea>
    )
  }

  if (worldSelection.startsWith('elt_')) {
    const entry = findEntryByUuid(worldModel.elements.entries, worldSelection)
    const detailMarkdown = worldModel.elements.details[worldSelection] ?? null

    return (
      <ScrollArea className="world-panel-scroll" offsetScrollbars type="scroll">
        <ElementDetailView entry={entry} detailMarkdown={detailMarkdown} />
      </ScrollArea>
    )
  }

  if (worldSelection.startsWith('evt_')) {
    const entry = findEntryByUuid(worldModel.events.entries, worldSelection)
    const detailMarkdown = worldModel.events.details[worldSelection] ?? null

    return (
      <ScrollArea className="world-panel-scroll" offsetScrollbars type="scroll">
        <EventDetailView entry={entry} detailMarkdown={detailMarkdown} />
      </ScrollArea>
    )
  }

  // Fallback: unknown selection prefix — show overview
  return (
    <Box className="world-panel-scroll">
      <WorldOverview worldModel={worldModel} syncState={syncState} />
    </Box>
  )
}

WorldPanel.propTypes = {
  worldModel: PropTypes.object,
  syncState: PropTypes.object,
  worldSelection: PropTypes.string,
}

export default WorldPanel
