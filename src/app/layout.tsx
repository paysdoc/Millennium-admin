import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Millennium Admin',
  description: 'Admin interface for Millennium',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}


