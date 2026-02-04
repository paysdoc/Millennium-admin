import { describe, it, expect } from 'vitest'

describe('Next.js Application', () => {
  describe('Page Components', () => {
    it('Home page can be imported', async () => {
      const { default: Home } = await import('../app/page')
      expect(Home).toBeDefined()
      expect(typeof Home).toBe('function')
    })

    it('Layout can be imported', async () => {
      const { default: RootLayout, metadata } = await import('../app/layout')
      expect(RootLayout).toBeDefined()
      expect(typeof RootLayout).toBe('function')
      expect(metadata).toBeDefined()
      expect(metadata.title).toBe('Millennium Admin')
      expect(metadata.description).toBe('Admin interface for Millennium')
    })

    it('Users page can be imported', async () => {
      const { default: UsersPage } = await import('../app/users/page')
      expect(UsersPage).toBeDefined()
      expect(typeof UsersPage).toBe('function')
    })

    it('Settings page can be imported', async () => {
      const { default: SettingsPage } = await import('../app/settings/page')
      expect(SettingsPage).toBeDefined()
      expect(typeof SettingsPage).toBe('function')
    })
  })
})
