// @ts-check
import { expect, test } from '@playwright/test'
import { clickModeTab } from './support/modeTabs.js'

function buildEventProposal(summary, reason = 'Initial pass') {
  return {
    proposal: {
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
    },
  }
}

function buildElementsProposal() {
  return {
    proposal: {
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
    },
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
      changed: true,
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
      changed: true,
      rationale,
      approval_message: 'Ready to apply the event detail.',
    },
    preview_diff: '--- a/events/evt_stub123.md\n+++ b/events/evt_stub123.md\n@@',
    updated_detail_md: detailText,
  }
}

async function openWorldMode(page) {
  await page.goto('/')
  await clickModeTab(page, 'World')
  await expect(page.getByTestId('world-sync-button')).toBeVisible()
}

async function startSyncToDiffPreview(page) {
  await page.getByTestId('world-sync-button').click()
  await expect(page.getByTestId('diff-preview-review')).toBeVisible()
}

async function continueFromDiffPreview(page) {
  await page.getByTestId('continue-diff-preview-button').click()
}

async function startSyncToEventsIndex(page) {
  await startSyncToDiffPreview(page)
  await continueFromDiffPreview(page)
  await expect(page.getByTestId('events-index-review')).toBeVisible()
}

test('renders diff preview before the first request and filters the initial diff by selected files', async ({ page }) => {
  const eventProposeRequests = []

  await page.route('**/harness/events-index/propose', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}')
    eventProposeRequests.push(body)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildEventProposal('Stub event')),
    })
  })

  await openWorldMode(page)
  await startSyncToDiffPreview(page)

  await expect(page.getByTestId('diff-preview-file-checkbox-opening-scene')).toBeChecked()
  expect(eventProposeRequests).toHaveLength(0)

  await page.getByTestId('diff-preview-file-checkbox-opening-scene').click()
  await continueFromDiffPreview(page)

  await expect(page.getByTestId('events-index-review')).toBeVisible()
  expect(eventProposeRequests).toHaveLength(1)
  expect(eventProposeRequests[0].diff_text).toContain('story-structure/character-arc.story')
  expect(eventProposeRequests[0].diff_text).not.toContain('story-structure/opening-scene.story')
})

test('runs the detail review loop with approve, skip, and reject-then-approve before committing', async ({ page }) => {
  const eventProposeRequests = []
  const detailEventRequests = []

  await page.route('**/harness/events-index/propose', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}')
    eventProposeRequests.push(body)

    const responseBody = eventProposeRequests.length === 1
      ? buildEventProposal('First stub event', 'Initial pass')
      : buildEventProposal('Revised stub event', 'Revised after feedback')

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody),
    })
  })

  await page.route('**/harness/events-index/apply', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildEventsApplyResponse('Revised stub event')),
    })
  })

  await page.route('**/harness/elements-index/propose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildElementsProposal()),
    })
  })

  await page.route('**/harness/elements-index/apply', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildElementsApplyResponse()),
    })
  })

  await page.route('**/harness/element-detail/propose', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}')
    const responseBody = body.target.uuid === 'elt_bundle123'
      ? buildElementDetailResponse(
        'elt_bundle123',
        'Cloth Bundle',
        '# Cloth Bundle\n\n## Core Understanding\nApproved cloth bundle detail.\n',
      )
      : buildElementDetailResponse(
        'elt_lantern456',
        'Lantern',
        '# Lantern\n\n## Core Understanding\nApproved lantern detail.\n',
      )

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody),
    })
  })

  await page.route('**/harness/event-detail/propose', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}')
    detailEventRequests.push(body)

    const responseBody = detailEventRequests.length === 1
      ? buildEventDetailResponse(
        '# Revised stub event\n\n## Core Understanding\nFirst event detail attempt.\n',
        'Initial event detail attempt.',
      )
      : buildEventDetailResponse(
        '# Revised stub event\n\n## Core Understanding\nApproved event detail after feedback.\n',
        'Updated after reviewer feedback.',
      )

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody),
    })
  })

  await openWorldMode(page)
  await startSyncToEventsIndex(page)
  await page.getByTestId('review-feedback-input').fill('Tighten the chronology language.')
  await page.getByTestId('request-changes-button').click()

  await expect(page.getByTestId('review-attempt-indicator')).toContainText('Attempt 2')
  await page.getByTestId('approve-events-index-button').click()

  await expect(page.getByTestId('elements-index-review')).toBeVisible()
  await page.getByTestId('approve-elements-index-button').click()

  await expect(page.getByTestId('element-detail-review')).toBeVisible()
  await expect(page.getByTestId('detail-review-progress')).toContainText('1 of 2')
  await page.getByText('Cloth Bundle · elt_bundle123').waitFor()
  await page.getByTestId('approve-detail-button').click()

  await expect(page.getByTestId('element-detail-review')).toBeVisible()
  await expect(page.getByTestId('detail-review-progress')).toContainText('2 of 2')
  await page.getByText('Lantern · elt_lantern456').waitFor()
  await page.getByTestId('skip-detail-button').click()

  await expect(page.getByTestId('event-detail-review')).toBeVisible()
  await expect(page.getByTestId('detail-review-progress')).toContainText('1 of 1')
  await page.getByTestId('review-feedback-input').fill('Keep the causal context focused on the altar discovery.')
  await page.getByTestId('request-changes-button').click()

  await expect(page.getByTestId('review-attempt-indicator')).toContainText('Attempt 2')
  await page.getByTestId('approve-detail-button').click()

  await expect(page.getByTestId('world-sidebar')).toBeVisible()
  await expect(page.getByTestId('project-status-message')).toContainText('World model updated from the review.')
  await expect(page.getByTestId('world-sidebar').getByText('Cloth Bundle')).toBeVisible()
  await expect(page.getByTestId('world-sidebar').getByText('Lantern')).toBeVisible()

  expect(eventProposeRequests).toHaveLength(2)
  expect(eventProposeRequests[1].history).toHaveLength(1)
  expect(eventProposeRequests[1].history[0].reviewer_feedback).toBe('Tighten the chronology language.')

  expect(detailEventRequests).toHaveLength(2)
  expect(detailEventRequests[1].history).toHaveLength(1)
  expect(detailEventRequests[1].history[0].reviewer_feedback).toBe(
    'Keep the causal context focused on the altar discovery.',
  )

  const storedWorldModel = await page.evaluate(() => {
    const raw = window.localStorage.getItem('editor-app-world-model-v1')
    return raw ? JSON.parse(raw) : null
  })

  expect(storedWorldModel.elements.details.elt_bundle123).toContain('Approved cloth bundle detail.')
  expect(storedWorldModel.elements.details.elt_lantern456).toContain('Original lantern stub detail.')
  expect(storedWorldModel.events.details.evt_stub123).toContain('Approved event detail after feedback.')
})

test('shows a no-change message for changed=false detail responses', async ({ page }) => {
  await page.route('**/harness/events-index/propose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildEventProposal('Stub event')),
    })
  })

  await page.route('**/harness/events-index/apply', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildEventsApplyResponse('Stub event')),
    })
  })

  await page.route('**/harness/elements-index/propose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
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
  })

  await page.route('**/harness/elements-index/apply', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        actions: ['Created element elt_bundle123: Cloth Bundle (item).'],
        detail_files: {
          elt_bundle123: '# Cloth Bundle\n\n## Core Understanding\nOriginal cloth bundle stub detail.\n',
        },
        elements_md: '# Elements\n\n## Entries\n- item | Cloth Bundle | elt_bundle123 | cloth bundle | altar evidence\n',
      }),
    })
  })

  await page.route('**/harness/element-detail/propose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        proposal: {
          changed: false,
          rationale: 'Nothing in the diff changes the file-level dossier.',
          approval_message: 'No changes needed.',
        },
        preview_diff: '',
        updated_detail_md: '# Cloth Bundle\n\n## Core Understanding\nOriginal cloth bundle stub detail.\n',
      }),
    })
  })

  await openWorldMode(page)
  await startSyncToEventsIndex(page)
  await page.getByTestId('approve-events-index-button').click()
  await page.getByTestId('approve-elements-index-button').click()

  await expect(page.getByTestId('detail-no-change-message')).toBeVisible()
})

test('canceling during detail review requires confirmation and leaves the world model unchanged', async ({ page }) => {
  await page.route('**/harness/events-index/propose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildEventProposal('Stub event')),
    })
  })

  await page.route('**/harness/events-index/apply', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildEventsApplyResponse('Stub event')),
    })
  })

  await page.route('**/harness/elements-index/propose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildElementsProposal()),
    })
  })

  await page.route('**/harness/elements-index/apply', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildElementsApplyResponse()),
    })
  })

  await page.route('**/harness/element-detail/propose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        buildElementDetailResponse(
          'elt_bundle123',
          'Cloth Bundle',
          '# Cloth Bundle\n\n## Core Understanding\nApproved cloth bundle detail.\n',
        ),
      ),
    })
  })

  await openWorldMode(page)
  await startSyncToEventsIndex(page)
  await page.getByTestId('approve-events-index-button').click()
  await page.getByTestId('approve-elements-index-button').click()

  await expect(page.getByTestId('element-detail-review')).toBeVisible()
  await page.getByTestId('discard-review-button').click()
  await expect(page.getByText('Cancel the current world sync?')).toBeVisible()
  await page.getByTestId('confirm-cancel-review-button').click()

  await expect(page.getByTestId('world-sync-button')).toBeVisible()

  const storedWorldModel = await page.evaluate(() => {
    const raw = window.localStorage.getItem('editor-app-world-model-v1')
    return raw ? JSON.parse(raw) : null
  })

  expect(storedWorldModel).toBeNull()
})
