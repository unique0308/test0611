/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
    // archiver(V1.15 批量下载用)走 Node 原生 require,不让 webpack bundling
    // 否则会撞 "Cannot find module './lib/core'"(webpack 解析不到 archiver 内部相对路径)
    serverComponentsExternalPackages: ["archiver"]
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.aliyuncs.com" },
      { protocol: "https", hostname: "**.feishu.cn" }
    ]
  }
};

export default nextConfig;
