import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Voodoo × Anthropic — Pipeline Title',
  description: 'Generate any game you want from the pipeline.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-ink antialiased">{children}</body>
    </html>
  )
}
