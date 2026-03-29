/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  typescript: {
    ignoreBuildErrors: true, // Ignoruje chyby TS při buildu
  },
  eslint: {
    ignoreDuringBuilds: true, // Ignoruje ESLint při buildu
  },
};
module.exports = nextConfig;