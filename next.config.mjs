/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
        LIVEBLOCKS_SECRET_KEY: process.env.LIVEBLOCKS_SECRET_KEY,
      },
};

export default nextConfig;
