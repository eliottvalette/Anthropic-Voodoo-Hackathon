import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Voodoo × Anthropic — Pipeline Deck',
  description: 'Video → playable HTML, in three slides.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-ink antialiased">{children}</body>
    </html>
  )
}
