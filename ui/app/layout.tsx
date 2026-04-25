import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Playable Ads',
  description: 'Generate playable HTML ads from gameplay videos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
