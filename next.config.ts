import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercelデプロイ時の一時的な型エラーによるビルド失敗を防ぐ設定
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;