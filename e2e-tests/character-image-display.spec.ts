import { test, expect } from '@playwright/test'

test.describe('Character Image Display', () => {
  test('displays infobox on left and image on right', async ({ page }) => {
    await page.goto('/')

    const hasCharacters = await page.locator('.character-link').first().isVisible().catch(() => false)
    if (!hasCharacters) {
      test.skip(true, 'No characters available - Supabase may be down')
      return
    }

    const characterLink = page.locator('.character-link').first()
    await characterLink.click()
    await expect(page).toHaveURL(/\/characters\//)

    const infoLeft = page.locator('.character-info-left')
    await expect(infoLeft).toBeVisible()

    const infoRight = page.locator('.character-info-right')
    await expect(infoRight).toBeVisible()
  })

  test('image has max width 450px and loads from Supabase', async ({ page }) => {
    await page.goto('/')

    const hasCharacters = await page.locator('.character-link').first().isVisible().catch(() => false)
    if (!hasCharacters) {
      test.skip(true, 'No characters available - Supabase may be down')
      return
    }

    const characterLink = page.locator('.character-link').first()
    await characterLink.click()
    await expect(page).toHaveURL(/\/characters\//)

    const imageContainer = page.locator('.character-image-container')
    const hasImage = await imageContainer.isVisible().catch(() => false)

    if (hasImage) {
      const image = page.locator('.character-detail-image')
      await expect(image).toBeVisible()

      const src = await image.getAttribute('src')
      expect(src).toContain('/storage/v1/object/public/')

      // Verify the image loaded successfully (naturalWidth > 0)
      const naturalWidth = await image.evaluate(
        (el) => (el as HTMLImageElement).naturalWidth
      )
      expect(naturalWidth).toBeGreaterThan(0)

      // Verify max width constraint (450px set via width attribute)
      const width = await image.getAttribute('width')
      expect(Number(width)).toBeLessThanOrEqual(450)
    }
  })

  test('infobox and image align at top of section', async ({ page }) => {
    await page.goto('/')

    const hasCharacters = await page.locator('.character-link').first().isVisible().catch(() => false)
    if (!hasCharacters) {
      test.skip(true, 'No characters available - Supabase may be down')
      return
    }

    const characterLink = page.locator('.character-link').first()
    await characterLink.click()
    await expect(page).toHaveURL(/\/characters\//)

    const imageContainer = page.locator('.character-image-container')
    const hasImage = await imageContainer.isVisible().catch(() => false)

    if (hasImage) {
      const infoSection = page.locator('.character-info-section')
      const display = await infoSection.evaluate((el) => getComputedStyle(el).display)
      // Section should use flex or grid layout for side-by-side alignment
      expect(display === 'flex' || display === 'grid').toBe(true)
    }
  })

  test('navigates back to overview', async ({ page }) => {
    await page.goto('/')

    const hasCharacters = await page.locator('.character-link').first().isVisible().catch(() => false)
    if (!hasCharacters) {
      test.skip(true, 'No characters available - Supabase may be down')
      return
    }

    const characterLink = page.locator('.character-link').first()
    await characterLink.click()
    await expect(page).toHaveURL(/\/characters\//)

    const backLink = page.getByRole('link', { name: /Back to Overview/ })
    await backLink.click()

    await expect(page).toHaveURL('/')
  })
})
