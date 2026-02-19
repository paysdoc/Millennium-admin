import { test, expect } from '@playwright/test'

test.describe('Characters Overview Page', () => {
  test('displays page header and title', async ({ page }) => {
    await page.goto('/')

    const header = page.locator('header.header')
    await expect(header).toBeVisible()

    const title = page.getByRole('heading', { name: 'Millennium Characters Overview', level: 1 })
    await expect(title).toBeVisible()
  })

  test('shows characters grouped by category, empty state, or error', async ({ page }) => {
    await page.goto('/')

    const categorySection = page.locator('.category-section').first()
    const emptyState = page.getByText('No characters found.')
    const errorState = page.getByText('Error loading characters:')

    const hasCategorySection = await categorySection.isVisible().catch(() => false)
    const hasEmptyState = await emptyState.isVisible().catch(() => false)
    const hasErrorState = await errorState.isVisible().catch(() => false)

    expect(hasCategorySection || hasEmptyState || hasErrorState).toBe(true)
  })

  test('displays table of contents when characters exist', async ({ page }) => {
    await page.goto('/')

    const categorySection = page.locator('.category-section').first()
    const hasCategorySections = await categorySection.isVisible().catch(() => false)

    if (hasCategorySections) {
      const toc = page.locator('.toc')
      await expect(toc).toBeVisible()

      const tocTitle = page.getByText('Contents')
      await expect(tocTitle).toBeVisible()

      const tocLinks = page.locator('.toc-list a')
      expect(await tocLinks.count()).toBeGreaterThan(0)
    }
  })

  test('displays at least one category section with characters when data exists', async ({ page }) => {
    await page.goto('/')

    const categorySections = page.locator('.category-section')
    const hasCategorySections = await categorySections.first().isVisible().catch(() => false)

    if (hasCategorySections) {
      expect(await categorySections.count()).toBeGreaterThan(0)

      const characterLinks = page.locator('.character-link')
      expect(await characterLinks.count()).toBeGreaterThan(0)
    }
  })

  test('displays footer at bottom of page', async ({ page }) => {
    await page.goto('/')

    const footer = page.locator('footer.footer')
    await footer.scrollIntoViewIfNeeded()
    await expect(footer).toBeVisible()

    await expect(page.getByText('Millennium Admin')).toBeVisible()
  })
})
