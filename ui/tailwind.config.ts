import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0F141C',
        platinum: '#F6F9FC',
        'spectrum-blue': '#0055FF',
      },
    },
  },
  plugins: [],
}

export default config
