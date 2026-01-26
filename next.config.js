/** @type {import("next").NextConfig} */
const nextConfig = {
  experimental: {
    allowedDevOrigins: [
      "http://192.168.68.66:3000",
      "http://192.168.68.51:3000",
      "http://0.0.0.0:3000",
    ],
  },
};
module.exports = nextConfig;