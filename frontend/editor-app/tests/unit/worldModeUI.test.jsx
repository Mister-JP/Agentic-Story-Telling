import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'

import WorldSidebar from '../../src/components/WorldSidebar.jsx'
import WorldOverview from '../../src/components/WorldOverview.jsx'
import ElementDetailView from '../../src/components/ElementDetailView.jsx'
import EventDetailView from '../../src/components/EventDetailView.jsx'
import {
  buildWorldModelFixture,
  POPULATED_ELEMENT_DETAIL_MD,
  TBD_ELEMENT_DETAIL_MD,
  POPULATED_EVENT_DETAIL_MD,
  TBD_EVENT_DETAIL_MD,
} from '../fixtures/worldModel.js'

// Wrap in MantineProvider for Mantine components
function renderWithMantine(ui) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

// ── WorldSidebar ──────────────────────────────────────────────────────────

describe('WorldSidebar', () => {
  const worldModel = buildWorldModelFixture()
  const defaultSyncState = { status: 'synced', lastSyncedAt: null, lastSyncedSnapshot: {} }
  const noopSelect = vi.fn()
  const noopSync = vi.fn()

  function renderWorldSidebar(overrideProps = {}) {
    return renderWithMantine(
      <WorldSidebar
        onStartSync={noopSync}
        syncButtonDisabled={false}
        syncButtonLabel="Sync World Model"
        worldModel={worldModel}
        syncState={defaultSyncState}
        worldSelection={null}
        onWorldSelect={noopSelect}
        {...overrideProps}
      />,
    )
  }

  it('renders element kind groups with correct labels', () => {
    renderWorldSidebar()

    // The fixture has persons, places, and items
    expect(screen.getByText(/PERSON/i)).toBeInTheDocument()
    expect(screen.getByText(/PLACE/i)).toBeInTheDocument()
    expect(screen.getByText(/ITEM/i)).toBeInTheDocument()
  })

  it('renders element names within groups', () => {
    renderWorldSidebar()

    expect(screen.getByText('Mira')).toBeInTheDocument()
    expect(screen.getByText('Arun')).toBeInTheDocument()
    expect(screen.getByText('Silver Key')).toBeInTheDocument()
    expect(screen.getByText('Saint Alder Chapel')).toBeInTheDocument()
  })

  it('renders event chapter groups and summaries', () => {
    renderWorldSidebar()

    // Events are grouped by chapter
    expect(screen.getByText(/Chapter 7/)).toBeInTheDocument()
    expect(screen.getByText(/Chapter 8/)).toBeInTheDocument()
  })

  it('shows populated dot for elements with detail content and TBD dot for empty ones', () => {
    renderWorldSidebar()

    const allItems = screen.getAllByTestId('world-item')

    // Mira (elt_45d617e4531b) has populated detail → filled dot ●
    const miraItem = allItems.find((item) => within(item).queryByText('Mira'))
    expect(miraItem).toBeDefined()
    expect(within(miraItem).getByText('●')).toBeInTheDocument()

    // Saint Alder Chapel (elt_03e8d4548117) has TBD detail → hollow dot ○
    const chapelItem = allItems.find((item) => within(item).queryByText('Saint Alder Chapel'))
    expect(chapelItem).toBeDefined()
    expect(within(chapelItem).getByText('○')).toBeInTheDocument()
  })

  it('filters elements and events by search query', async () => {
    const user = userEvent.setup()

    renderWorldSidebar()

    const searchInput = screen.getByTestId('world-search-input')
    await user.type(searchInput, 'Mira')

    // Mira should be visible
    expect(screen.getByText('Mira')).toBeInTheDocument()

    // Arun and Silver Key should be hidden
    expect(screen.queryByText('Arun')).not.toBeInTheDocument()
    expect(screen.queryByText('Silver Key')).not.toBeInTheDocument()
  })

  it('shows empty state when worldModel is null', () => {
    renderWorldSidebar({
      worldModel: null,
      syncState: null,
    })

    expect(screen.getByTestId('world-sidebar-empty')).toBeInTheDocument()
    expect(screen.getByText(/no world model yet/i)).toBeInTheDocument()
  })

  it('renders the sync button with the provided CTA state', () => {
    renderWorldSidebar({
      syncButtonDisabled: true,
      syncButtonLabel: 'Starting Sync...',
    })

    expect(screen.getByTestId('world-sync-button')).toBeDisabled()
    expect(screen.getByTestId('world-sync-button')).toHaveTextContent('Starting Sync...')
  })
})

// ── WorldOverview ─────────────────────────────────────────────────────────

describe('WorldOverview', () => {
  const worldModel = buildWorldModelFixture()
  const syncState = { status: 'synced', lastSyncedAt: '2026-03-25T14:30:00.000Z', lastSyncedSnapshot: {} }

  it('renders element and event counts', () => {
    renderWithMantine(
      <WorldOverview worldModel={worldModel} syncState={syncState} />,
    )

    // The fixture has 9 elements and 7 events
    expect(screen.getByTestId('element-count')).toHaveTextContent('9')
    expect(screen.getByTestId('event-count')).toHaveTextContent('7')
  })

  it('renders empty state when worldModel is null', () => {
    renderWithMantine(
      <WorldOverview worldModel={null} syncState={null} />,
    )

    expect(screen.getByTestId('world-overview-empty')).toBeInTheDocument()
    expect(screen.getByText(/no world model yet/i)).toBeInTheDocument()
  })
})

// ── ElementDetailView ─────────────────────────────────────────────────────

describe('ElementDetailView', () => {
  const entry = {
    kind: 'person',
    display_name: 'Mira',
    uuid: 'elt_45d617e4531b',
    aliases: 'Mira',
    identification_keys: 'carries the silver key',
  }

  it('renders section headings from populated markdown', () => {
    renderWithMantine(
      <ElementDetailView entry={entry} detailMarkdown={POPULATED_ELEMENT_DETAIL_MD} />,
    )

    expect(screen.getByTestId('element-detail-view')).toBeInTheDocument()
    expect(screen.getByText('Core Understanding')).toBeInTheDocument()
    expect(screen.getByText('Stable Profile')).toBeInTheDocument()
    expect(screen.getByText('Open Threads')).toBeInTheDocument()
  })

  it('renders header metadata', () => {
    renderWithMantine(
      <ElementDetailView entry={entry} detailMarkdown={POPULATED_ELEMENT_DETAIL_MD} />,
    )

    expect(screen.getByText('PERSON')).toBeInTheDocument()
    expect(screen.getByText('Mira')).toBeInTheDocument()
    expect(screen.getByText(/elt_45d617e4531b/)).toBeInTheDocument()
  })

  it('shows TBD placeholder for unpopulated sections', () => {
    renderWithMantine(
      <ElementDetailView entry={entry} detailMarkdown={TBD_ELEMENT_DETAIL_MD} />,
    )

    const placeholders = screen.getAllByTestId('tbd-placeholder')
    expect(placeholders.length).toBeGreaterThan(0)
    expect(placeholders[0]).toHaveTextContent(/not yet populated/i)
  })
})

// ── EventDetailView ───────────────────────────────────────────────────────

describe('EventDetailView', () => {
  const entry = {
    uuid: 'evt_f72bc8fe0f29',
    when: 'Late June, 1998, before sunrise',
    chapters: 'Chapter 7',
    summary: 'Mira receives a letter from her mother',
  }

  it('renders section headings from populated markdown', () => {
    renderWithMantine(
      <EventDetailView entry={entry} detailMarkdown={POPULATED_EVENT_DETAIL_MD} />,
    )

    expect(screen.getByTestId('event-detail-view')).toBeInTheDocument()
    expect(screen.getByText('Core Understanding')).toBeInTheDocument()
    expect(screen.getByText('Causal Context')).toBeInTheDocument()
    expect(screen.getByText('Open Threads')).toBeInTheDocument()
  })

  it('shows TBD placeholder for unpopulated event detail', () => {
    renderWithMantine(
      <EventDetailView entry={entry} detailMarkdown={TBD_EVENT_DETAIL_MD} />,
    )

    const placeholders = screen.getAllByTestId('tbd-placeholder')
    expect(placeholders.length).toBeGreaterThan(0)
  })
})
