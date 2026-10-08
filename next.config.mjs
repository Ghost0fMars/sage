import { readFileSync } from 'fs';

// Version affichée dans le menu : celle de package.json (fixée depuis le tag par la CI).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  ...(process.env.ELECTRON_BUILD === 'true' && { output: 'standalone' }),
};

export default nextConfig;
