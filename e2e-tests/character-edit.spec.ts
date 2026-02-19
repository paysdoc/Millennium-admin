import { test, expect } from '@playwright/test'

test.describe('Character Edit Functionality', () => {
  test('clicking a field transforms it into an editable input', async ({ page }) => {
    await page.goto('/')

    const characterLink = page.locator('.character-link').first()
    await characterLink.click()
    await expect(page).toHaveURL(/\/characters\//)

    const firstNamesField = page.locator('[data-field="first_names"].editable-field')
    await expect(firstNamesField).toBeVisible()
    await firstNamesField.click()

    const input = page.locator('[data-field="first_names"].editable-field-editing')
    await expect(input).toBeVisible()
  })

  test('cancel resets field value and hides buttons', async ({ page }) => {
    await page.goto('/')

    const characterLink = page.locator('.character-link').first()
    await characterLink.click()
    await expect(page).toHaveURL(/\/characters\//)

    const firstNamesField = page.locator('[data-field="first_names"].editable-field')
    const originalValue = await firstNamesField.textContent()

    await firstNamesField.click()

    const input = page.locator('[data-field="first_names"].editable-field-editing')
    await expect(input).toBeVisible()
    await input.fill((originalValue ?? '') + ' Test')

    // Click outside to exit edit mode
    await page.locator('.infobox-title').click()

    const cancelButton = page.getByRole('button', { name: 'Cancel' })
    await expect(cancelButton).toBeVisible()

    await cancelButton.click()

    // Verify value is reset and buttons are hidden
    const resetField = page.locator('[data-field="first_names"].editable-field')
    await expect(resetField).toHaveText(originalValue ?? '')
    await expect(cancelButton).not.toBeVisible()
  })

  test('apply saves changes and persists after reload', async ({ page }) => {
    await page.goto('/')

    const characterLink = page.locator('.character-link').first()
    await characterLink.click()
    await expect(page).toHaveURL(/\/characters\//)

    const firstNamesField = page.locator('[data-field="first_names"].editable-field')
    const originalValue = await firstNamesField.textContent()

    // Edit the field
    await firstNamesField.click()
    const input = page.locator('[data-field="first_names"].editable-field-editing')
    await expect(input).toBeVisible()
    await input.fill((originalValue ?? '') + ' Edited')

    // Click outside to exit edit mode
    await page.locator('.infobox-title').click()

    // Apply changes
    const applyButton = page.getByRole('button', { name: 'Apply' })
    await expect(applyButton).toBeVisible()
    await applyButton.click()

    // Wait for save to complete (buttons disappear)
    await expect(applyButton).not.toBeVisible()

    // Verify the edited value is shown
    const editedField = page.locator('[data-field="first_names"].editable-field')
    await expect(editedField).toHaveText((originalValue ?? '') + ' Edited')

    // Reload and verify persistence
    await page.reload()
    const persistedField = page.locator('[data-field="first_names"].editable-field')
    await expect(persistedField).toHaveText((originalValue ?? '') + ' Edited')

    // Restore original value
    await persistedField.click()
    const restoreInput = page.locator('[data-field="first_names"].editable-field-editing')
    await expect(restoreInput).toBeVisible()
    await restoreInput.fill(originalValue ?? '')

    await page.locator('.infobox-title').click()

    const restoreApplyButton = page.getByRole('button', { name: 'Apply' })
    await expect(restoreApplyButton).toBeVisible()
    await restoreApplyButton.click()

    await expect(restoreApplyButton).not.toBeVisible()
  })
})
