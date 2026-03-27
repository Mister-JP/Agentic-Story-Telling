// @ts-check
import { expect, test } from '@playwright/test'
import { clickModeTab } from './support/modeTabs.js'

function buildEventProposal(summary, reason) {
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
Stub detail created from the approve flow.

## Causal Context
- Deterministic test context

## Consequences & Ripple Effects
- Verifies the stage-1 review loop

## Participants & Roles
- Test writer

## Evidence & Grounding
- She noticed the altar cloth.

## Open Threads
- Replace the stub backend with the real harness
`,
    },
    events_md: `# Events

## Entries
- evt_stub123 | June 28, 1998, 7:15 a.m. | Chapter 8 | ${summary}
`,
  }
}

function buildElementsProposal(displayName, options = {}) {
  return {
    proposal: {
      diff_summary: options.diffSummary ?? `${displayName} proposal summary`,
      rationale: options.rationale ?? `${displayName} proposal rationale`,
      identified_elements: [
        {
          display_name: displayName,
          kind: options.kind ?? 'item',
          aliases: options.aliases ?? ['cloth bundle'],
          identification_keys: options.identificationKeys ?? ['altar evidence'],
          snapshot: options.snapshot ?? `${displayName} matters to the world model.`,
          update_instruction: options.updateInstruction ?? `Track ${displayName} in detail review.`,
          evidence_from_diff: options.evidence ?? ['A cloth bundle rested at the altar.'],
          matched_existing_display_name: options.matchedExistingDisplayName ?? null,
          matched_existing_uuid: options.matchedExistingUuid ?? null,
          is_new: options.isNew ?? true,
        },
      ],
      approval_message: options.approvalMessage ?? 'Review the element proposal.',
    },
  }
}

function buildElementsApplyResponse(displayName) {
  return {
    actions: [`Created element elt_bundle123: ${displayName} (item).`],
    detail_files: {
      elt_bundle123: `# ${displayName}

## Identification
- UUID: elt_bundle123
- Type: item
- Canonical name: ${displayName}
- Aliases: cloth bundle
- Identification keys: altar evidence

## Core Understanding
Stub detail created from the approve flow.

## Stable Profile
- TBD

## Interpretation
- TBD

## Knowledge / Beliefs / Uncertainties
- TBD

## Element-Centered Chronology
- TBD

## Open Threads
- TBD
`,
    },
    elements_md: `# Elements

## Entries
- item | ${displayName} | elt_bundle123 | cloth bundle | altar evidence
`,
  }
}

function buildStructuredError(message) {
  return {
    error: 'stub_backend_error',
    message,
    retryable: true,
    details: null,
  }
}

async function openWorldMode(page) {
  await page.goto('/')
  await clickModeTab(page, 'World')
  await expect(page.getByTestId('world-sync-button')).toBeVisible()
}

test('shows the loading state and restores sync after discarding a ready review', async ({ page }) => {
  let releaseProposalRequest
  let resolveProposalFinished
  const proposalRequestReleased = new Promise((resolve) => {
    releaseProposalRequest = resolve
  })
  const proposalRequestFinished = new Promise((resolve) => {
    resolveProposalFinished = resolve
  })

  await page.route('**/harness/events-index/propose', async (route) => {
    await proposalRequestReleased
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildEventProposal('Discarded proposal', 'In-flight proposal for discard coverage.')),
    })
    resolveProposalFinished()
  })

  await openWorldMode(page)

  await page.getByTestId('world-sync-button').click()

  await expect(page.getByTestId('review-loading-state')).toBeVisible()
  const discardReviewButton = page.getByTestId('discard-review-button')
  await expect(discardReviewButton).toBeDisabled()

  releaseProposalRequest()
  await proposalRequestFinished

  await expect(page.getByTestId('events-index-review')).toBeVisible()
  await expect(discardReviewButton).toBeEnabled()
  await discardReviewButton.click()

  const worldSyncButton = page.getByTestId('world-sync-button')
  await expect(worldSyncButton).toBeVisible()
  await expect(worldSyncButton).toBeEnabled()
  await expect(worldSyncButton).toHaveText('Sync World Model')

  await expect(page.getByTestId('events-index-review')).toHaveCount(0)
  await expect(worldSyncButton).toBeEnabled()
})

test('supports retrying after the initial proposal request fails', async ({ page }) => {
  let proposeCallCount = 0

  await page.route('**/harness/events-index/propose', async (route) => {
    proposeCallCount += 1

    if (proposeCallCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify(buildStructuredError('The proposal backend is warming up.')),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildEventProposal('Recovered proposal', 'Returned after retrying the request.')),
    })
  })

  await openWorldMode(page)

  await page.getByTestId('world-sync-button').click()

  await expect(page.getByTestId('review-error-state')).toBeVisible()
  await expect(page.getByText('The proposal backend is warming up.')).toBeVisible()

  await page.getByTestId('retry-review-button').click()

  await expect(page.getByTestId('events-index-review')).toBeVisible()
  await expect(page.getByTestId('review-attempt-indicator')).toContainText('Attempt 1')
  await expect(page.getByTestId('events-index-review').getByText('Recovered proposal').first()).toBeVisible()
})

test('elements review supports reject with feedback and shows attempt 2 before final approval', async ({ page }) => {
  const eventProposeRequests = []
  const elementProposeRequests = []
  let eventProposeCallCount = 0
  let elementProposeCallCount = 0

  await page.route('**/harness/events-index/propose', async (route) => {
    eventProposeCallCount += 1
    eventProposeRequests.push(JSON.parse(route.request().postData() ?? '{}'))

    const responseBody = eventProposeCallCount === 1
      ? buildEventProposal('First stub event for review loop', 'Initial deterministic stub response.')
      : buildEventProposal('Revised stub event for review loop', 'Updated after reviewer feedback.')

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
      body: JSON.stringify(buildEventsApplyResponse('Revised stub event for review loop')),
    })
  })

  await page.route('**/harness/elements-index/propose', async (route) => {
    elementProposeCallCount += 1
    elementProposeRequests.push(JSON.parse(route.request().postData() ?? '{}'))

    const responseBody = elementProposeCallCount === 1
      ? buildElementsProposal('Cloth Bundle')
      : buildElementsProposal('Cloth Bundle', {
        aliases: ['cloth bundle', 'altar bundle'],
        rationale: 'Revised after reviewer feedback.',
      })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody),
    })
  })

  await page.route('**/harness/elements-index/apply', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildElementsApplyResponse('Cloth Bundle')),
    })
  })

  await openWorldMode(page)

  await page.getByTestId('world-sync-button').click()

  await expect(page.getByTestId('events-index-review')).toBeVisible()
  await expect(page.getByTestId('review-attempt-indicator')).toContainText('Attempt 1')
  await expect(
    page.getByTestId('events-index-review').getByText('First stub event for review loop').first(),
  ).toBeVisible()

  await page.getByTestId('review-feedback-input').fill('Tighten the timing and keep the altar discovery explicit.')
  await page.getByTestId('request-changes-button').click()

  await expect(page.getByTestId('review-attempt-indicator')).toContainText('Attempt 2')
  await expect(
    page.getByTestId('events-index-review').getByText('Revised stub event for review loop').first(),
  ).toBeVisible()

  expect(eventProposeRequests).toHaveLength(2)
  expect(eventProposeRequests[0].history).toEqual([])
  expect(eventProposeRequests[1].history).toHaveLength(1)
  expect(eventProposeRequests[1].history[0].reviewer_feedback).toBe(
    'Tighten the timing and keep the altar discovery explicit.',
  )
  expect(eventProposeRequests[1].history[0].previous_output).toContain('First stub event for review loop')

  await page.getByTestId('approve-events-index-button').click()
  await expect(page.getByTestId('elements-index-review')).toBeVisible()
  await expect(page.getByTestId('review-attempt-indicator')).toContainText('Attempt 1')

  await page.getByTestId('review-feedback-input').fill('Keep the altar bundle alias explicit.')
  await page.getByTestId('request-changes-button').click()

  await expect(page.getByTestId('review-attempt-indicator')).toContainText('Attempt 2')
  await expect(page.getByTestId('elements-index-review').getByText('altar bundle').first()).toBeVisible()

  expect(elementProposeRequests).toHaveLength(2)
  expect(elementProposeRequests[0].history).toHaveLength(1)
  expect(elementProposeRequests[0].history[0].reviewer_feedback).toBe(
    'Tighten the timing and keep the altar discovery explicit.',
  )
  expect(elementProposeRequests[1].history).toHaveLength(2)
  expect(elementProposeRequests[1].history[1].reviewer_feedback).toBe(
    'Keep the altar bundle alias explicit.',
  )
  expect(elementProposeRequests[1].history[1].previous_output).toContain('Cloth Bundle')

  await page.getByTestId('approve-elements-index-button').click()

  await expect(page.getByTestId('elements-index-review')).toHaveCount(0)
  await expect(page.getByTestId('world-sidebar')).toBeVisible()
  await expect(page.getByTestId('project-status-message')).toContainText(
    'World model updated from the review.',
  )
  await expect(page.getByTestId('world-sidebar').getByText('Cloth Bundle')).toBeVisible()
})

test('keeps the events review open and surfaces a network error when events apply fails', async ({ page }) => {
  let eventsApplyCallCount = 0

  await page.route('**/harness/events-index/propose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildEventProposal('Apply failure proposal', 'Proposal used to test apply network failure.')),
    })
  })

  await page.route('**/harness/events-index/apply', async (route) => {
    eventsApplyCallCount += 1

    if (eventsApplyCallCount === 1) {
      await route.abort('failed')
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildEventsApplyResponse('Apply failure proposal')),
    })
  })

  await page.route('**/harness/elements-index/propose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildElementsProposal('Cloth Bundle')),
    })
  })

  await page.route('**/harness/elements-index/apply', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildElementsApplyResponse('Cloth Bundle')),
    })
  })

  await openWorldMode(page)

  await page.getByTestId('world-sync-button').click()
  await expect(page.getByTestId('events-index-review')).toBeVisible()

  await page.getByTestId('approve-events-index-button').click()

  await expect(page.getByTestId('review-error-message')).toContainText(
    'Could not reach the backend. Please try again.',
  )
  await expect(page.getByTestId('events-index-review')).toBeVisible()

  await page.getByTestId('approve-events-index-button').click()

  await expect(page.getByTestId('elements-index-review')).toBeVisible()
  await page.getByTestId('approve-elements-index-button').click()

  await expect(page.getByTestId('elements-index-review')).toHaveCount(0)
  await expect(page.getByTestId('world-sidebar')).toBeVisible()
  await expect(page.getByTestId('project-status-message')).toContainText(
    'World model updated from the review.',
  )
})

test('keeps the elements review open and surfaces a network error when elements apply fails', async ({ page }) => {
  let elementsApplyCallCount = 0

  await page.route('**/harness/events-index/propose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildEventProposal('Elements apply failure proposal', 'Proposal used to reach the stage-2 apply flow.')),
    })
  })

  await page.route('**/harness/events-index/apply', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildEventsApplyResponse('Elements apply failure proposal')),
    })
  })

  await page.route('**/harness/elements-index/propose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildElementsProposal('Cloth Bundle')),
    })
  })

  await page.route('**/harness/elements-index/apply', async (route) => {
    elementsApplyCallCount += 1

    if (elementsApplyCallCount === 1) {
      await route.abort('failed')
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildElementsApplyResponse('Cloth Bundle')),
    })
  })

  await openWorldMode(page)

  await page.getByTestId('world-sync-button').click()
  await expect(page.getByTestId('events-index-review')).toBeVisible()

  await page.getByTestId('approve-events-index-button').click()

  await expect(page.getByTestId('elements-index-review')).toBeVisible()
  await page.getByTestId('approve-elements-index-button').click()

  await expect(page.getByTestId('review-error-message')).toContainText(
    'Could not reach the backend. Please try again.',
  )
  await expect(page.getByTestId('elements-index-review')).toBeVisible()

  await page.getByTestId('approve-elements-index-button').click()

  await expect(page.getByTestId('elements-index-review')).toHaveCount(0)
  await expect(page.getByTestId('world-sidebar')).toBeVisible()
  await expect(page.getByTestId('project-status-message')).toContainText(
    'World model updated from the review.',
  )
})
