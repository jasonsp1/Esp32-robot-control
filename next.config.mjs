import withPWA from 'next-pwa'
import pwaConfig from './next-pwa.config.mjs'

const baseConfig = {
  output: 'export', // 👈 required for static export
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default withPWA(pwaConfig)(baseConfig)
