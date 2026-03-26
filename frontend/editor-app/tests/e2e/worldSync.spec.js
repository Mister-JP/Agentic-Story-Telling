// @ts-check
import { expect, test } from '@playwright/test'
import { clickModeTab } from './support/modeTabs.js'

function buildProposal(summary, reason) {
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

function buildApplyResponse(summary) {
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
      body: JSON.stringify(buildProposal('Discarded proposal', 'In-flight proposal for discard coverage.')),
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
      body: JSON.stringify(buildProposal('Recovered proposal', 'Returned after retrying the request.')),
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

test('events index review supports reject and approve in one loop', async ({ page }) => {
  const proposeRequests = []
  let proposeCallCount = 0

  await page.route('**/harness/events-index/propose', async (route) => {
    proposeCallCount += 1
    proposeRequests.push(JSON.parse(route.request().postData() ?? '{}'))

    const responseBody = proposeCallCount === 1
      ? buildProposal('First stub event for review loop', 'Initial deterministic stub response.')
      : buildProposal('Revised stub event for review loop', 'Updated after reviewer feedback.')

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
      body: JSON.stringify(buildApplyResponse('Revised stub event for review loop')),
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

  expect(proposeRequests).toHaveLength(2)
  expect(proposeRequests[0].history).toEqual([])
  expect(proposeRequests[1].history).toHaveLength(1)
  expect(proposeRequests[1].history[0].reviewer_feedback).toBe(
    'Tighten the timing and keep the altar discovery explicit.',
  )
  expect(proposeRequests[1].history[0].previous_output).toContain('First stub event for review loop')

  await page.getByTestId('approve-events-index-button').click()

  await expect(page.getByTestId('events-index-review')).toHaveCount(0)
  await expect(page.getByTestId('world-sidebar')).toBeVisible()
  await expect(page.getByTestId('project-status-message')).toContainText(
    'World model updated from the events review.',
  )
  await expect(
    page.getByTestId('world-overview').getByText('Revised stub event for review loop (event)'),
  ).toBeVisible()
})

test('keeps the review open and surfaces a network error when apply fails', async ({ page }) => {
  let applyCallCount = 0

  await page.route('**/harness/events-index/propose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildProposal('Apply failure proposal', 'Proposal used to test apply network failure.')),
    })
  })

  await page.route('**/harness/events-index/apply', async (route) => {
    applyCallCount += 1

    if (applyCallCount === 1) {
      await route.abort('failed')
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildApplyResponse('Apply failure proposal')),
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

  await expect(page.getByTestId('events-index-review')).toHaveCount(0)
  await expect(page.getByTestId('world-sidebar')).toBeVisible()
  await expect(page.getByTestId('project-status-message')).toContainText(
    'World model updated from the events review.',
  )
})
