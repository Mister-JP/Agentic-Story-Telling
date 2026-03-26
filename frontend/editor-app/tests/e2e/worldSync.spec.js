// @ts-check
import { expect, test } from '@playwright/test'

function buildSuccessResponseBody() {
  return {
    proposal: {
      scan_summary: 'Stub backend response',
      deltas: [
        {
          action: 'create',
          existing_event_uuid: null,
          when: 'June 28, 1998, 7:15 a.m.',
          chapters: 'Chapter 8',
          summary: 'Stubbed altar discovery event for contract integration',
          reason: 'Deterministic stub response.',
          evidence_from_diff: ['She noticed the altar cloth.'],
        },
      ],
    },
  }
}

async function openWorldMode(page) {
  await page.goto('/')
  await page.getByTestId('mode-tabs').getByText('World', { exact: true }).click()
  await expect(page.getByTestId('world-sync-button')).toBeVisible()
}

test('world sync CTA shows a loading state while the request is in flight', async ({ page }) => {
  await page.route('**/harness/events-index/propose', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildSuccessResponseBody()),
    })
  })

  await openWorldMode(page)

  const syncButton = page.getByTestId('world-sync-button')
  await syncButton.click()

  await expect(syncButton).toBeDisabled()
  await expect(syncButton).toHaveText('Starting Sync...')
  await expect(page.getByTestId('project-status-message')).toContainText('Backend contract reachable')
  await expect(syncButton).toBeEnabled()
  await expect(syncButton).toHaveText('Sync World Model')
})

test('world sync CTA shows the backend error and re-enables the button', async ({ page }) => {
  await page.route('**/harness/events-index/propose', async (route) => {
    await route.fulfill({
      status: 504,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'llm_timeout',
        message: 'The LLM call timed out after 120 seconds. Please try again.',
        retryable: true,
      }),
    })
  })

  await openWorldMode(page)

  const syncButton = page.getByTestId('world-sync-button')
  await syncButton.click()

  await expect(page.getByTestId('project-status-message')).toContainText('timed out after 120 seconds')
  await expect(syncButton).toBeEnabled()
  await expect(syncButton).toHaveText('Sync World Model')
})
