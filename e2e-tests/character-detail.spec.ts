import { test, expect } from '@playwright/test'

test.describe('Character Detail Page', () => {
  test('navigates to character detail and displays information', async ({ page }) => {
    await page.goto('/')

    const categorySection = page.locator('.category-section').first()
    await expect(categorySection).toBeVisible()

    const characterLink = page.locator('.character-link').first()
    await expect(characterLink).toBeVisible()

    const characterName = await characterLink.textContent()
    await characterLink.click()

    await expect(page).toHaveURL(/\/characters\//)

    const heading = page.getByRole('heading', { name: characterName ?? '', level: 1 })
    await expect(heading).toBeVisible()
  })

  test('displays character infobox with fields', async ({ page }) => {
    await page.goto('/')

    const characterLink = page.locator('.character-link').first()
    await characterLink.click()
    await expect(page).toHaveURL(/\/characters\//)

    const infobox = page.locator('.infobox')
    await expect(infobox).toBeVisible()

    const infoboxRows = page.locator('.infobox-row')
    expect(await infoboxRows.count()).toBeGreaterThan(0)

    await expect(page.getByText('First Names')).toBeVisible()
  })

  test('displays character image from Supabase when available', async ({ page }) => {
    await page.goto('/')

    const characterLink = page.locator('.character-link').first()
    await characterLink.click()
    await expect(page).toHaveURL(/\/characters\//)

    const imageContainer = page.locator('.character-image-container')
    const hasImage = await imageContainer.isVisible().catch(() => false)

    if (hasImage) {
      const image = page.locator('.character-detail-image')
      await expect(image).toBeVisible()

      const src = await image.getAttribute('src')
      expect(src).toBeTruthy()
    }
  })

  test('displays connections section', async ({ page }) => {
    await page.goto('/')

    const characterLink = page.locator('.character-link').first()
    await characterLink.click()
    await expect(page).toHaveURL(/\/characters\//)

    const connectionsHeading = page.getByRole('heading', { name: 'Connections', level: 2 })
    await expect(connectionsHeading).toBeVisible()

    const connectionsTable = page.locator('.table')
    const emptyState = page.getByText('No connections found for this character.')

    const hasTable = await connectionsTable.isVisible().catch(() => false)
    const hasEmptyState = await emptyState.isVisible().catch(() => false)

    expect(hasTable || hasEmptyState).toBe(true)
  })

  test('navigates back to overview via back link', async ({ page }) => {
    await page.goto('/')

    const characterLink = page.locator('.character-link').first()
    await characterLink.click()
    await expect(page).toHaveURL(/\/characters\//)

    const backLink = page.getByRole('link', { name: /Back to Overview/ })
    await expect(backLink).toBeVisible()
    await backLink.click()

    await expect(page).toHaveURL('/')
  })
})
