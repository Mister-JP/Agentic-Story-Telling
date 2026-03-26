// @ts-check
import { expect } from '@playwright/test'

export async function clickModeTab(page, label) {
  const modeTabs = page.getByTestId('mode-tabs')
  const modeTab = modeTabs.locator('label').filter({ hasText: label })

  await expect(modeTabs).toBeVisible()
  await expect(modeTab).toBeVisible()
  await modeTab.click()
}
