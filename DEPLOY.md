# AI 中台 MVP · 部署 Checklist

> 生产部署到阿里云 ECS / 公司服务器。MVP 单实例,无冗余。
> 触发条件:飞书 SSO 真实接入(后期补全清单 #1)+ 阿里云 OSS(#2)+ 服务器资源到位
> 本文档为模板。**MVP 阶段不执行实际部署**;资源到位时按 checklist 跑。

---

## 0. 部署前自检(本地执行)

```bash
# 1. typecheck 干净
npm run typecheck

# 2. 构建无错
npm run build

# 3. smoke 全过
npm run db:migrate     # 确保 DB 是新的
npm run dev &          # 后台起 dev
sleep 6
npm run smoke
kill %1                # 关掉 dev

# 4. 检查 .env.local 不在 git
git status .env.local  # 应该显示"忽略"

# 5. .env.local.example 完整(所有变量都列出)
diff <(grep -E '^[A-Z_]+=' .env.local | cut -d= -f1 | sort) \
     <(grep -E '^[A-Z_]+=' .env.local.example | cut -d= -f1 | sort)
```

---

## 1. 服务器准备

### 操作系统
推荐:Ubuntu 22.04 LTS 或 CentOS 8+

### 资源建议
- CPU:2-4 核
- 内存:4 GB+(Node.js 大约 500 MB,Next.js build cache 1-2 GB)
- 磁盘:50 GB+(uploads 目录,真实接入 OSS 后这部分可以小)
- 网络:能访问 OpenRouter (或国产 provider) + Supabase

### 软件栈
```bash
# Node.js 18.17+ (建议 20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
npm install -g pnpm@9
# 或:用 npm,本项目实测 npm 也 OK

# PM2
sudo npm install -g pm2

# Nginx
sudo apt install -y nginx

# certbot(HTTPS)
sudo apt install -y certbot python3-certbot-nginx
```

---

## 2. 部署应用

```bash
# clone
sudo mkdir -p /var/www/ai-platform
sudo chown $USER:$USER /var/www/ai-platform
cd /var/www/ai-platform
git clone <repo-url> .

# 依赖
pnpm install --frozen-lockfile
# 或 npm ci

# 环境变量
cp .env.local.example .env.local
# 编辑 .env.local 填入生产值(从 LOCAL_SECRETS.md 各节复制,但要换成生产专属 key)
# ⚠️ SESSION_SECRET 必须重新生成:openssl rand -base64 32
# ⚠️ ADMIN_EMAILS 改为真实办公邮箱
# ⚠️ NEXT_PUBLIC_APP_URL 改为生产域名
# ⚠️ DEV_MOCK_USER_EMAIL 必须为空(技术 5.6 节)
# ⚠️ AUTH_MODE=real(真实飞书 SSO)
# ⚠️ STORAGE_MODE=oss(阿里云)
# ⚠️ EASYROUTER_MODE=real

# build
pnpm build

# Migration(只在首次 / schema 变化时)
pnpm db:migrate
```

---

## 3. PM2 启动

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup    # 设置开机自启,按提示再跑一条命令
```

健康检查:
```bash
pm2 status
pm2 logs ai-platform --lines 50
curl -I http://localhost:3000/auth/dev   # 应该 404(生产环境 mock 路由被拦)
```

---

## 4. Nginx 反代 + HTTPS

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/ai-platform
# 编辑替换 server_name 等
sudo ln -sf /etc/nginx/sites-available/ai-platform /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Let's Encrypt 证书
sudo certbot --nginx -d ai-mvp.company.com
# certbot 会自动改 nginx config 加 ssl
```

---

## 5. 防火墙

```bash
# 只放 80/443
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp     # SSH
sudo ufw enable
```

---

## 6. 飞书自建应用回调 URL 更新

如果 AUTH_MODE=real,部署后必须在飞书开发者后台:
- 凭证与基础信息 → 添加重定向 URL:`https://ai-mvp.company.com/api/auth/feishu/callback`
- 删除 / 禁用 localhost 的开发回调

---

## 7. 阿里云 OSS 加白(STORAGE_MODE=oss 时)

OSS bucket 控制台 → 跨域设置 →
- 来源:`https://ai-mvp.company.com`
- 允许 Methods:GET / POST / PUT
- 允许 Headers:`*`

---

## 8. 部署后 smoke

```bash
SMOKE_BASE_URL=https://ai-mvp.company.com npm run smoke
```

预期 21/21 pass。如果有 fail,先查 `pm2 logs`。

---

## 9. 监控告警接入

至少接 Sentry:
```bash
pnpm add @sentry/nextjs
npx @sentry/wizard
# 改 .env.local:MONITORING_MODE=sentry / SENTRY_DSN=...
pm2 reload ai-platform
```

进阶:Prometheus + Grafana,或公司现有监控接入。

---

## 10. Rollback 步骤

```bash
# A. 应用回滚到上一版本
cd /var/www/ai-platform
git log --oneline | head -5
git checkout <previous-commit>
pnpm install --frozen-lockfile
pnpm build
pm2 reload ai-platform

# B. DB rollback(非常少见,只在 migration 出错时)
# 1. 在 Supabase Dashboard 用 backup 恢复
# 2. 或写 down migration 文件并跑回退

# C. 灰度阶段中止
# 1. Nginx 改 server_name 拒绝外部访问,或加 IP allowlist
# 2. 通知种子用户暂停使用
# 3. 在飞书群发说明 + ETA
```

---

## 11. 切真实 provider(全员推广前必做)

OpenRouter 中国大陆 IP 段 **不可用**(技术跟踪 4.2 节"OpenRouter 区域风险")。生产部署到国内服务器前:

1. 申请火山方舟 / 阿里百炼 / 硅基流动 / 302.AI 等国产聚合的 API key
2. `LOCAL_SECRETS.md` 第 2 节加新 provider 的 key
3. 完成 `lib/easyrouter/providers/<vendor>.ts`(参考 openrouter.ts 模板,异步轮询模式)
4. 新 migration `00X_<vendor>_models.sql`:
   - 删 OpenRouter 行 / 标 enabled=FALSE
   - 加新 provider 模型行
5. `.env.local`:加 `<VENDOR>_API_KEY=...`
6. `pnpm db:migrate && pm2 reload ai-platform`
7. `npm run smoke` 验证

---

## 12. 常见问题

| 现象 | 排查 |
|------|------|
| 502 Bad Gateway | `pm2 status` 看应用是否在跑;`pm2 logs` 看错误 |
| OpenRouter 403 "not available in your region" | 中国大陆 IP 拦截。生产必须切国产 provider(见 §11) |
| /api/files 404 | 检查 STORAGE_MODE 是否跟实际一致(local 必须存在 ./uploads 目录;oss 必须 OSS 配置对) |
| Supabase pool 满 | 看 `SUPABASE_SERVICE_ROLE_KEY` 是不是错;Supabase Dashboard 看 Pooler 配置 |
| 视频生成卡住 | 看 `last_polled_at` 是否在动;后端进程被 kill 后,任务 cancel/重新提交 |

---

## 模板文件

- `ecosystem.config.js` — PM2 配置
- `nginx.conf.example` — Nginx 反代模板
