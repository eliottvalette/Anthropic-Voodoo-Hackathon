import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Lift the default body size cap for Route Handler streams (videos can be 60MB+).
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
}

export default nextConfig
