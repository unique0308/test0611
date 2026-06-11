// PM2 配置 — 生产部署时使用
// 触发条件:服务器资源到位(后期补全清单 #4)
// 用法:pm2 start ecosystem.config.js && pm2 save

module.exports = {
  apps: [
    {
      name: "ai-platform",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: "/var/www/ai-platform",        // 占位,部署时改成实际路径
      instances: 1,                        // MVP 单实例;V2 阶段再加 cluster
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3000"
        // 其他变量从 .env.local 读取(Next.js 内置加载)
      },
      // 日志
      out_file: "/var/log/ai-platform/out.log",
      error_file: "/var/log/ai-platform/error.log",
      merge_logs: true,
      time: true,
      // 自动重启策略
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "1G",
      // 优雅停机
      kill_timeout: 5000,
      listen_timeout: 10000
    }
  ]
};
