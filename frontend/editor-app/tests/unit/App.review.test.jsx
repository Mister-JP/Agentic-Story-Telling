import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import App from '../../src/App.jsx'

vi.mock('@mantine/hooks', async () => {
  const React = await import('react')

  return {
    useLocalStorage: ({ defaultValue }) => React.useState(defaultValue),
  }
})

vi.mock('browser-fs-access', () => ({
  fileOpen: vi.fn(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
  fileSave: vi.fn(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
}))

vi.mock('../../src/components/EditorPane.jsx', () => ({
  default: () => null,
}))

vi.mock('../../src/components/Sidebar.jsx', () => ({
  default: function SidebarStub({ onDiscardReview, onStartSync, reviewSession, syncButtonDisabled }) {
    return (
      <aside data-testid="sidebar-stub">
        <button
          data-testid="sidebar-start-sync"
          disabled={syncButtonDisabled}
          onClick={onStartSync}
          type="button"
        >
          Start sync
        </button>
        {reviewSession ? (
          <button data-testid="discard-review-button" onClick={onDiscardReview} type="button">
            Cancel sync
          </button>
        ) : null}
      </aside>
    )
  },
}))

vi.mock('../../src/components/WorldPanel.jsx', () => ({
  default: function WorldPanelStub({ worldModel }) {
    const elementEntries = worldModel?.elements?.entries ?? []
    const eventEntries = worldModel?.events?.entries ?? []
    const elementDetails = worldModel?.elements?.details ?? {}
    const eventDetails = worldModel?.events?.details ?? {}

    return (
      <section data-testid="world-panel-stub">
        <div data-testid="world-panel-element-count">{elementEntries.length}</div>
        <div data-testid="world-panel-event-count">{eventEntries.length}</div>
        {elementEntries.map((entry) => (
          <div key={entry.uuid}>{`${entry.display_name} (${entry.kind})`}</div>
        ))}
        {eventEntries.map((entry) => (
          <div key={entry.uuid}>{`${entry.summary} (event)`}</div>
        ))}
        {Object.entries(elementDetails).map(([uuid, markdown]) => (
          <pre data-testid={`element-detail-${uuid}`} key={uuid}>{markdown}</pre>
        ))}
        {Object.entries(eventDetails).map(([uuid, markdown]) => (
          <pre data-testid={`event-detail-${uuid}`} key={uuid}>{markdown}</pre>
        ))}
      </section>
    )
  },
}))

function buildEventProposal(summary, reason = 'Initial pass') {
  return {
    scan_summary: summary,
    deltas: [
      {
        action: 'create',
        existing_event_uuid: null,
        when: 'June 28, 1998, 7:15 a.m.',
        chapters: 'Chapter 8',
        summary,
        reason,
        evidence_from_diff: ['She noticed the altar cloth.'],
      },
    ],
  }
}

function buildElementsProposal() {
  return {
    diff_summary: 'Two element dossiers need file-level review.',
    rationale: 'Create element files for the new artifacts mentioned in the diff.',
    identified_elements: [
      {
        display_name: 'Cloth Bundle',
        kind: 'item',
        aliases: ['cloth bundle'],
        identification_keys: ['altar evidence'],
        snapshot: 'A cloth bundle matters to the world model.',
        update_instruction: 'Create the cloth bundle dossier.',
        evidence_from_diff: ['A cloth bundle rested at the altar.'],
        matched_existing_display_name: null,
        matched_existing_uuid: null,
        is_new: true,
      },
      {
        display_name: 'Lantern',
        kind: 'item',
        aliases: ['chapel lantern'],
        identification_keys: ['dim chapel light'],
        snapshot: 'The lantern marks the dark approach to the chapel.',
        update_instruction: 'Create the lantern dossier.',
        evidence_from_diff: ['The lantern still burned near the nave.'],
        matched_existing_display_name: null,
        matched_existing_uuid: null,
        is_new: true,
      },
    ],
    approval_message: 'Review the element proposal.',
  }
}

function buildEventsApplyResponse(summary) {
  return {
    actions: ['Created event evt_stub123.'],
    detail_files: {
      evt_stub123: `# ${summary}

## Identification
- UUID: evt_stub123
- When: June 28, 1998, 7:15 a.m.
- Chapters: Chapter 8
- Summary: ${summary}

## Core Understanding
Original event stub detail.
`,
    },
    detail_targets: [
      {
        uuid: 'evt_stub123',
        summary,
        file: 'events/evt_stub123.md',
        delta_action: 'create',
        update_context: 'Create the event dossier.',
      },
    ],
    events_md: `# Events

## Entries
- evt_stub123 | June 28, 1998, 7:15 a.m. | Chapter 8 | ${summary}
`,
  }
}

function buildElementsApplyResponse() {
  return {
    actions: [
      'Created element elt_bundle123: Cloth Bundle (item).',
      'Created element elt_lantern456: Lantern (item).',
    ],
    detail_files: {
      elt_bundle123: `# Cloth Bundle

## Identification
- UUID: elt_bundle123
- Type: item
- Canonical name: Cloth Bundle
- Aliases: cloth bundle
- Identification keys: altar evidence

## Core Understanding
Original cloth bundle stub detail.
`,
      elt_lantern456: `# Lantern

## Identification
- UUID: elt_lantern456
- Type: item
- Canonical name: Lantern
- Aliases: chapel lantern
- Identification keys: dim chapel light

## Core Understanding
Original lantern stub detail.
`,
    },
    detail_targets: [
      {
        uuid: 'elt_bundle123',
        summary: 'Cloth Bundle',
        file: 'elements/elt_bundle123.md',
        delta_action: 'create',
        update_context: 'Create the cloth bundle dossier.',
        kind: 'item',
      },
      {
        uuid: 'elt_lantern456',
        summary: 'Lantern',
        file: 'elements/elt_lantern456.md',
        delta_action: 'create',
        update_context: 'Create the lantern dossier.',
        kind: 'item',
      },
    ],
    elements_md: `# Elements

## Entries
- item | Cloth Bundle | elt_bundle123 | cloth bundle | altar evidence
- item | Lantern | elt_lantern456 | chapel lantern | dim chapel light
`,
  }
}

function buildElementDetailResponse(uuid, summary, detailText) {
  return {
    proposal: {
      file_action: 'update',
      rationale: `Refines the ${summary} file.`,
      approval_message: `Ready to apply ${summary}.`,
    },
    preview_diff: `--- a/elements/${uuid}.md\n+++ b/elements/${uuid}.md\n@@`,
    updated_detail_md: detailText,
  }
}

function buildEventDetailResponse(detailText, rationale = 'Adds precise causal context.') {
  return {
    proposal: {
      file_action: 'update',
      rationale,
      approval_message: 'Ready to apply the event detail.',
    },
    preview_diff: '--- a/events/evt_stub123.md\n+++ b/events/evt_stub123.md\n@@',
    updated_detail_md: detailText,
  }
}

function renderApp() {
  return render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  )
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  }
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, reject, resolve }
}

async function startSyncToDiffPreview(user) {
  await user.click(screen.getByTestId('sidebar-start-sync'))
  await screen.findByTestId('diff-preview-review')
}

async function continueFromDiffPreview(user) {
  await user.click(screen.getByTestId('continue-diff-preview-button'))
}

async function startSyncToEventsIndex(user) {
  await startSyncToDiffPreview(user)
  await continueFromDiffPreview(user)
  await screen.findByTestId('events-index-review')
}

describe('App review flow', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('runs the full index-plus-detail review loop and commits only after the final review approval', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('First stub event', 'Initial pass'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('Revised stub event', 'Revised after feedback'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(buildEventsApplyResponse('Revised stub event')),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildElementsProposal(),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(buildElementsApplyResponse()),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(
          buildElementDetailResponse(
            'elt_bundle123',
            'Cloth Bundle',
            '# Cloth Bundle\n\n## Core Understanding\nApproved cloth bundle detail.\n',
          ),
        ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(
          buildElementDetailResponse(
            'elt_lantern456',
            'Lantern',
            '# Lantern\n\n## Core Understanding\nApproved lantern detail.\n',
          ),
        ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(
          buildEventDetailResponse(
            '# Revised stub event\n\n## Core Understanding\nFirst event detail attempt.\n',
            'Initial event detail attempt.',
          ),
        ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(
          buildEventDetailResponse(
            '# Revised stub event\n\n## Core Understanding\nApproved event detail after feedback.\n',
            'Updated after reviewer feedback.',
          ),
        ),
      })

    renderApp()

    await startSyncToEventsIndex(user)

    await user.type(screen.getByTestId('review-feedback-input'), 'Tighten the chronology language.')
    await user.click(screen.getByTestId('request-changes-button'))

    await waitFor(() => {
      expect(screen.getByTestId('review-attempt-indicator')).toHaveTextContent('Attempt 2')
    })

    const revisedEventsRequest = JSON.parse(fetch.mock.calls[1][1].body)
    expect(revisedEventsRequest.history).toHaveLength(1)
    expect(revisedEventsRequest.history[0].reviewer_feedback).toBe('Tighten the chronology language.')
    expect(revisedEventsRequest.history[0].previous_output).toContain('First stub event')

    await user.click(screen.getByTestId('approve-events-index-button'))
    await screen.findByTestId('elements-index-review')

    const elementsRequest = JSON.parse(fetch.mock.calls[3][1].body)
    expect(elementsRequest.history).toHaveLength(1)
    expect(elementsRequest.history[0].reviewer_feedback).toBe('Tighten the chronology language.')

    await user.click(screen.getByTestId('approve-elements-index-button'))
    await screen.findByTestId('element-detail-review')
    expect(screen.getByTestId('detail-review-progress')).toHaveTextContent('1 of 2')
    expect(screen.getByText('Cloth Bundle · elt_bundle123')).toBeInTheDocument()
    expect(screen.queryByTestId('world-panel-stub')).not.toBeInTheDocument()

    const firstElementDetailRequest = JSON.parse(fetch.mock.calls[5][1].body)
    expect(firstElementDetailRequest.history).toEqual([])
    expect(firstElementDetailRequest.target.uuid).toBe('elt_bundle123')

    await user.click(screen.getByTestId('approve-detail-button'))
    await screen.findByTestId('element-detail-review')
    expect(screen.getByTestId('detail-review-progress')).toHaveTextContent('2 of 2')
    expect(screen.getByText('Lantern · elt_lantern456')).toBeInTheDocument()

    await user.click(screen.getByTestId('skip-detail-button'))
    await screen.findByTestId('event-detail-review')
    expect(screen.getByTestId('detail-review-progress')).toHaveTextContent('1 of 1')

    await user.type(screen.getByTestId('review-feedback-input'), 'Keep the causal context focused on the altar discovery.')
    await user.click(screen.getByTestId('request-changes-button'))

    await waitFor(() => {
      expect(screen.getByTestId('review-attempt-indicator')).toHaveTextContent('Attempt 2')
    })

    const revisedEventDetailRequest = JSON.parse(fetch.mock.calls[8][1].body)
    expect(revisedEventDetailRequest.history).toHaveLength(1)
    expect(revisedEventDetailRequest.history[0].reviewer_feedback).toBe(
      'Keep the causal context focused on the altar discovery.',
    )
    expect(revisedEventDetailRequest.history[0].previous_output).toContain('Initial event detail attempt.')

    await user.click(screen.getByTestId('approve-detail-button'))
    await screen.findByTestId('final-review-step')
    expect(screen.getByTestId('final-review-detail-updates')).toHaveTextContent('elements/elt_bundle123.md')
    expect(screen.getByTestId('final-review-detail-updates')).toHaveTextContent('events/evt_stub123.md')

    await user.click(screen.getByTestId('commit-final-review-button'))
    await screen.findByTestId('sync-complete-step')

    expect(screen.getByTestId('sync-complete-events-summary')).toHaveTextContent('1 created')
    expect(screen.getByTestId('sync-complete-elements-summary')).toHaveTextContent('2 created')
    expect(screen.getByTestId('sync-complete-element-details-summary')).toHaveTextContent('1 detail pages updated')
    expect(screen.getByTestId('sync-complete-element-details-summary')).toHaveTextContent('1 detail pages skipped')
    expect(screen.getByTestId('sync-complete-event-details-summary')).toHaveTextContent('1 detail pages updated')
    expect(screen.getByTestId('project-status-message')).toHaveTextContent('World model updated from the review.')
    expect(screen.queryByTestId('world-panel-stub')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('return-to-world-view-button'))

    await waitFor(() => {
      expect(screen.getByTestId('world-panel-stub')).toBeInTheDocument()
    })

    expect(screen.getByTestId('world-panel-element-count')).toHaveTextContent('2')
    expect(screen.getByTestId('world-panel-event-count')).toHaveTextContent('1')
    expect(screen.getByTestId('project-status-message')).toHaveTextContent('World model updated from the review.')
    expect(within(screen.getByTestId('world-panel-stub')).getByText('Cloth Bundle (item)')).toBeInTheDocument()
    expect(within(screen.getByTestId('world-panel-stub')).getByText('Lantern (item)')).toBeInTheDocument()
    expect(within(screen.getByTestId('world-panel-stub')).getByText('Revised stub event (event)')).toBeInTheDocument()
    expect(screen.getByTestId('element-detail-elt_bundle123')).toHaveTextContent('Approved cloth bundle detail.')
    expect(screen.getByTestId('element-detail-elt_lantern456')).toHaveTextContent('Original lantern stub detail.')
    expect(screen.getByTestId('event-detail-evt_stub123')).toHaveTextContent('Approved event detail after feedback.')
  })

  it('waits for diff preview selection before sending the first proposal request', async () => {
    const user = userEvent.setup()

    fetch.mockResolvedValueOnce(jsonResponse({
      proposal: buildEventProposal('Stub event'),
    }))

    renderApp()

    await startSyncToDiffPreview(user)
    expect(fetch).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('diff-preview-file-checkbox-opening-scene'))
    await continueFromDiffPreview(user)
    await screen.findByTestId('events-index-review')

    expect(fetch).toHaveBeenCalledTimes(1)
    const firstRequest = JSON.parse(fetch.mock.calls[0][1].body)
    expect(firstRequest.diff_text).toContain('story-structure/character-arc.story')
    expect(firstRequest.diff_text).not.toContain('story-structure/opening-scene.story')
  })

  it('routes delete targets through detail review before the final commit', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce(jsonResponse({
        proposal: {
          scan_summary: 'Delete the stale event.',
          deltas: [
            {
              action: 'delete',
              existing_event_uuid: 'evt_old123',
              when: 'June 20, 1998',
              chapters: 'Chapter 7',
              summary: 'Old event',
              reason: 'The diff removes this event from the story.',
              evidence_from_diff: ['The old event reference was removed.'],
            },
          ],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        actions: ['Deleted event evt_old123: Old event.'],
        detail_files: {},
        detail_targets: [
          {
            uuid: 'evt_old123',
            summary: 'Old event',
            file: 'events/evt_old123.md',
            delta_action: 'delete',
            update_context: 'Delete the unsupported detail file.',
          },
        ],
        events_md: '# Events\n\n## Entries\n',
      }))
      .mockResolvedValueOnce(jsonResponse({
        proposal: {
          diff_summary: 'No element changes are needed.',
          rationale: 'The diff only removes an outdated event reference.',
          identified_elements: [],
          approval_message: 'No element actions required.',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        actions: [],
        detail_targets: [],
        detail_files: {},
        elements_md: '# Elements\n\n## Entries\n',
      }))
      .mockResolvedValueOnce(jsonResponse({
        proposal: {
          file_action: 'delete',
          rationale: 'The event detail is unsupported after the manuscript deletion.',
          approval_message: 'Delete the detail file.',
        },
        preview_diff: '--- a/events/evt_old123.md\n+++ b/events/evt_old123.md\n@@',
        updated_detail_md: '',
      }))

    renderApp()

    await startSyncToEventsIndex(user)
    await user.click(screen.getByTestId('approve-events-index-button'))
    await screen.findByTestId('elements-index-review')
    await user.click(screen.getByTestId('approve-elements-index-button'))
    await screen.findByTestId('event-detail-review')
    await user.click(screen.getByTestId('approve-detail-button'))
    await screen.findByTestId('final-review-step')
    expect(screen.getByTestId('final-review-index-deletes')).toHaveTextContent('Deleted event evt_old123')
    expect(screen.getByTestId('final-review-detail-deletes')).toHaveTextContent('events/evt_old123.md')
    await user.click(screen.getByTestId('commit-final-review-button'))
    await screen.findByTestId('sync-complete-step')

    expect(screen.getByTestId('sync-complete-events-summary')).toHaveTextContent('1 deleted')
    expect(screen.getByTestId('sync-complete-event-details-summary')).toHaveTextContent('1 detail pages deleted')
    expect(screen.getByTestId('sync-complete-element-details-summary')).toHaveTextContent('0 detail pages updated')
    expect(screen.queryByTestId('world-panel-stub')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('return-to-world-view-button'))

    await waitFor(() => {
      expect(screen.getByTestId('world-panel-stub')).toBeInTheDocument()
    })
  })

  it('shows the final review step when the final detail target is skipped', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildEventProposal('Stub event'),
      }))
      .mockResolvedValueOnce(jsonResponse(buildEventsApplyResponse('Stub event')))
      .mockResolvedValueOnce(jsonResponse({
        proposal: {
          diff_summary: 'No element changes are needed.',
          rationale: 'Only the event detail requires review.',
          identified_elements: [],
          approval_message: 'No element actions required.',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        actions: [],
        detail_targets: [],
        detail_files: {},
        elements_md: '# Elements\n\n## Entries\n',
      }))
      .mockResolvedValueOnce(jsonResponse(
        buildEventDetailResponse(
          '# Stub event\n\n## Core Understanding\nEvent detail ready for review.\n',
          'Adds event detail context.',
        ),
      ))

    renderApp()

    await startSyncToEventsIndex(user)
    await user.click(screen.getByTestId('approve-events-index-button'))
    await screen.findByTestId('elements-index-review')
    await user.click(screen.getByTestId('approve-elements-index-button'))
    await screen.findByTestId('event-detail-review')
    await user.click(screen.getByTestId('skip-detail-button'))
    await screen.findByTestId('final-review-step')
    await user.click(screen.getByTestId('commit-final-review-button'))
    await screen.findByTestId('sync-complete-step')

    expect(screen.getByTestId('sync-complete-event-details-summary')).toHaveTextContent('0 detail pages updated')
    expect(screen.getByTestId('sync-complete-event-details-summary')).toHaveTextContent('1 detail pages skipped')

    await user.click(screen.getByTestId('return-to-world-view-button'))

    await waitFor(() => {
      expect(screen.getByTestId('world-panel-stub')).toBeInTheDocument()
    })
  })

  it('shows the no-change message during detail review when the backend returns file_action=no_change', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('Stub event'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(buildEventsApplyResponse('Stub event')),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: {
            diff_summary: 'One element needs file review.',
            rationale: 'Create the cloth bundle dossier.',
            identified_elements: [
              {
                display_name: 'Cloth Bundle',
                kind: 'item',
                aliases: ['cloth bundle'],
                identification_keys: ['altar evidence'],
                snapshot: 'A cloth bundle matters to the world model.',
                update_instruction: 'Create the cloth bundle dossier.',
                evidence_from_diff: ['A cloth bundle rested at the altar.'],
                matched_existing_display_name: null,
                matched_existing_uuid: null,
                is_new: true,
              },
            ],
            approval_message: 'Review the element proposal.',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          actions: ['Created element elt_bundle123: Cloth Bundle (item).'],
          detail_targets: [
            {
              uuid: 'elt_bundle123',
              summary: 'Cloth Bundle',
              file: 'elements/elt_bundle123.md',
              delta_action: 'create',
              update_context: 'Create the cloth bundle dossier.',
              kind: 'item',
            },
          ],
          detail_files: {
            elt_bundle123: '# Cloth Bundle\n\n## Core Understanding\nOriginal cloth bundle stub detail.\n',
          },
          elements_md: '# Elements\n\n## Entries\n- item | Cloth Bundle | elt_bundle123 | cloth bundle | altar evidence\n',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: {
            file_action: 'no_change',
            rationale: 'Nothing in the diff changes the file-level dossier.',
            approval_message: 'No changes needed.',
          },
          preview_diff: '',
          updated_detail_md: '# Cloth Bundle\n\n## Core Understanding\nOriginal cloth bundle stub detail.\n',
        }),
      })

    renderApp()

    await startSyncToEventsIndex(user)
    await user.click(screen.getByTestId('approve-events-index-button'))
    await screen.findByTestId('elements-index-review')
    await user.click(screen.getByTestId('approve-elements-index-button'))
    await screen.findByTestId('element-detail-review')

    expect(screen.getByTestId('detail-no-change-message')).toBeInTheDocument()
  })

  it('cancels from detail review only after confirmation and leaves the world model untouched', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildEventProposal('Stub event'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(buildEventsApplyResponse('Stub event')),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          proposal: buildElementsProposal(),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(buildElementsApplyResponse()),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(
          buildElementDetailResponse(
            'elt_bundle123',
            'Cloth Bundle',
            '# Cloth Bundle\n\n## Core Understanding\nApproved cloth bundle detail.\n',
          ),
        ),
      })

    renderApp()

    await startSyncToEventsIndex(user)
    await user.click(screen.getByTestId('approve-events-index-button'))
    await screen.findByTestId('elements-index-review')
    await user.click(screen.getByTestId('approve-elements-index-button'))
    await screen.findByTestId('element-detail-review')

    await user.click(screen.getByTestId('discard-review-button'))
    expect(await screen.findByText('Cancel the current world sync?')).toBeInTheDocument()

    await user.click(screen.getByTestId('confirm-cancel-review-button'))

    await waitFor(() => {
      expect(screen.getByTestId('world-panel-stub')).toBeInTheDocument()
    })

    expect(screen.getByTestId('world-panel-element-count')).toHaveTextContent('0')
    expect(screen.getByTestId('world-panel-event-count')).toHaveTextContent('0')
    expect(screen.queryByText('Cloth Bundle (item)')).not.toBeInTheDocument()
  })

  it('supports retrying after the initial proposal request fails', async () => {
    const user = userEvent.setup()

    fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildEventProposal('Recovered stub event'),
      }))

    renderApp()

    await startSyncToDiffPreview(user)
    await continueFromDiffPreview(user)
    await screen.findByTestId('review-error-state')
    expect(screen.getByText('Could not reach the backend. Please try again.')).toBeInTheDocument()

    await user.click(screen.getByTestId('retry-review-button'))

    await screen.findByTestId('events-index-review')
    expect(screen.getAllByText('Recovered stub event')).toHaveLength(2)
  })

  it('surfaces the network error when the events apply request fails', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildEventProposal('Stub event'),
      }))
      .mockRejectedValueOnce(new Error('offline'))

    renderApp()

    await startSyncToEventsIndex(user)
    await user.click(screen.getByTestId('approve-events-index-button'))

    await waitFor(() => {
      expect(screen.getByTestId('review-error-message')).toHaveTextContent(
        'Could not reach the backend. Please try again.',
      )
    })
  })

  it('surfaces the network error when the elements apply request fails', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildEventProposal('Stub event'),
      }))
      .mockResolvedValueOnce(jsonResponse(buildEventsApplyResponse('Stub event')))
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildElementsProposal(),
      }))
      .mockRejectedValueOnce(new Error('offline'))

    renderApp()

    await startSyncToEventsIndex(user)
    await user.click(screen.getByTestId('approve-events-index-button'))
    await screen.findByTestId('elements-index-review')
    await user.click(screen.getByTestId('approve-elements-index-button'))

    await waitFor(() => {
      expect(screen.getByTestId('review-error-message')).toHaveTextContent(
        'Could not reach the backend. Please try again.',
      )
    })
  })

  it('does not start overlapping apply requests on double-click', async () => {
    const user = userEvent.setup()
    const applyDeferred = createDeferred()

    fetch
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildEventProposal('Stub event'),
      }))
      .mockImplementationOnce(() => applyDeferred.promise)
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildElementsProposal(),
      }))

    renderApp()

    await startSyncToEventsIndex(user)
    await user.dblClick(screen.getByTestId('approve-events-index-button'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    applyDeferred.resolve(jsonResponse(buildEventsApplyResponse('Stub event')))

    await screen.findByTestId('elements-index-review')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('does not start overlapping request-changes requests on double-click', async () => {
    const user = userEvent.setup()
    const revisionDeferred = createDeferred()

    fetch
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildEventProposal('Stub event'),
      }))
      .mockImplementationOnce(() => revisionDeferred.promise)

    renderApp()

    await startSyncToEventsIndex(user)
    await user.type(screen.getByTestId('review-feedback-input'), 'Tighten the chronology language.')
    await user.dblClick(screen.getByTestId('request-changes-button'))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    revisionDeferred.resolve(jsonResponse({
      proposal: buildEventProposal('Revised stub event', 'Revised after feedback'),
    }))

    await waitFor(() => {
      expect(screen.getByTestId('review-attempt-indicator')).toHaveTextContent('Attempt 2')
    })
  })

  it('does not retain failed reviewer feedback in history on retry', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildEventProposal('Stub event'),
      }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildEventProposal('Revised stub event', 'Revised after feedback'),
      }))

    renderApp()

    await startSyncToEventsIndex(user)
    await user.type(screen.getByTestId('review-feedback-input'), 'First correction.')
    await user.click(screen.getByTestId('request-changes-button'))

    await waitFor(() => {
      expect(screen.getByTestId('review-error-message')).toHaveTextContent(
        'Could not reach the backend. Please try again.',
      )
    })

    await user.clear(screen.getByTestId('review-feedback-input'))
    await user.type(screen.getByTestId('review-feedback-input'), 'Second correction.')
    await user.click(screen.getByTestId('request-changes-button'))

    await waitFor(() => {
      expect(screen.getByTestId('review-attempt-indicator')).toHaveTextContent('Attempt 2')
    })

    const retryRequest = JSON.parse(fetch.mock.calls[2][1].body)
    expect(retryRequest.history).toHaveLength(1)
    expect(retryRequest.history[0].reviewer_feedback).toBe('Second correction.')
    expect(retryRequest.history[0].reviewer_feedback).not.toBe('First correction.')
  })

  it('restores the idle review state after discarding a ready review', async () => {
    const user = userEvent.setup()

    fetch.mockResolvedValueOnce(jsonResponse({
      proposal: buildEventProposal('Stub event'),
    }))

    renderApp()

    await startSyncToEventsIndex(user)

    await user.click(screen.getByTestId('discard-review-button'))
    expect(await screen.findByText('Cancel the current world sync?')).toBeInTheDocument()
    await user.click(screen.getByTestId('confirm-cancel-review-button'))

    await waitFor(() => {
      expect(screen.getByTestId('world-panel-stub')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('events-index-review')).not.toBeInTheDocument()
    expect(screen.getByTestId('sidebar-start-sync')).toBeEnabled()
  })

  it('surfaces the next detail-proposal error after approving the elements index', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildEventProposal('Stub event'),
      }))
      .mockResolvedValueOnce(jsonResponse(buildEventsApplyResponse('Stub event')))
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildElementsProposal(),
      }))
      .mockResolvedValueOnce(jsonResponse(buildElementsApplyResponse()))
      .mockRejectedValueOnce(new Error('offline'))

    renderApp()

    await startSyncToEventsIndex(user)
    await user.click(screen.getByTestId('approve-events-index-button'))
    await screen.findByTestId('elements-index-review')
    await user.click(screen.getByTestId('approve-elements-index-button'))

    await screen.findByTestId('review-error-state')
    expect(screen.getByText('Could not reach the backend. Please try again.')).toBeInTheDocument()
  })

  it('surfaces the next detail-proposal error after skipping a detail target', async () => {
    const user = userEvent.setup()

    fetch
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildEventProposal('Stub event'),
      }))
      .mockResolvedValueOnce(jsonResponse(buildEventsApplyResponse('Stub event')))
      .mockResolvedValueOnce(jsonResponse({
        proposal: buildElementsProposal(),
      }))
      .mockResolvedValueOnce(jsonResponse(buildElementsApplyResponse()))
      .mockResolvedValueOnce(jsonResponse(
        buildElementDetailResponse(
          'elt_bundle123',
          'Cloth Bundle',
          '# Cloth Bundle\n\n## Core Understanding\nApproved cloth bundle detail.\n',
        ),
      ))
      .mockRejectedValueOnce(new Error('offline'))

    renderApp()

    await startSyncToEventsIndex(user)
    await user.click(screen.getByTestId('approve-events-index-button'))
    await screen.findByTestId('elements-index-review')
    await user.click(screen.getByTestId('approve-elements-index-button'))
    await screen.findByTestId('element-detail-review')
    await user.click(screen.getByTestId('skip-detail-button'))

    await screen.findByTestId('review-error-state')
    expect(screen.getByText('Could not reach the backend. Please try again.')).toBeInTheDocument()
  })
})
