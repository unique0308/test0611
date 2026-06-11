# GitHub 上传排障记录

## 背景

本项目本地已有 Git 提交,准备上传到:

```text
https://github.com/unique0308/test0611.git
```

这次在 Codex 工具环境里直接上传失败,原因不是代码或提交内容问题,而是本机 Git/GitHub 认证与 `.git` 配置写入权限问题。

## 这次踩到的坑

### 1. Codex 环境无法写 `.git/config`

执行:

```bash
git remote add origin https://github.com/unique0308/test0611.git
```

报错:

```text
error: could not lock config file .git/config: Permission denied
fatal: could not set 'remote.origin.url'
```

原因:当前 Codex 执行环境对 `.git/config` 有写入限制,导致无法添加 `origin`。

解决方案:在用户自己的终端里执行 `git remote add`。不要在受限工具环境里强行改 `.git/config`。

### 2. 直接推送 URL 时 HTTPS/TLS 认证失败

尝试绕过 `origin` 直接推送:

```bash
git push -u https://github.com/unique0308/test0611.git main
```

报错:

```text
schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS
```

原因:Git for Windows 使用 `schannel` 时没有可用凭证,并且 Codex 工具环境无法完成 GitHub 登录弹窗/凭据交互。

解决方案:在用户自己的终端里完成 GitHub 登录认证后再 push。

### 3. 切换 OpenSSL 后会卡住

尝试:

```bash
git -c http.sslBackend=openssl push -u https://github.com/unique0308/test0611.git main
```

结果:命令卡住直到超时。

原因:通常是在等待 GitHub HTTPS 凭据输入或凭据管理器交互,但当前工具环境无法处理交互式认证。

解决方案:不要在 Codex 工具里做首次 GitHub HTTPS 认证。先在本机终端完成登录。

## 正确上传流程

在用户自己的 PowerShell / Git Bash / Cursor 终端中执行:

```bash
git status --short --branch
git remote add origin https://github.com/unique0308/test0611.git
git push -u origin main
```

如果提示登录 GitHub,按提示完成浏览器登录或输入 token。

## 如果已配置过错误的 origin

查看:

```bash
git remote -v
```

如果地址错了,改成:

```bash
git remote set-url origin https://github.com/unique0308/test0611.git
```

再推送:

```bash
git push -u origin main
```

## 推荐:安装 GitHub CLI

如果本机安装了 `gh`,流程更稳定:

```bash
gh auth login
git remote add origin https://github.com/unique0308/test0611.git
git push -u origin main
```

检查登录状态:

```bash
gh auth status
```

## 注意事项

- `git commit` 是本地操作,通常不受网络影响。
- `git push` / `git pull` / `git fetch` 才依赖网络和 GitHub 认证。
- 首次上传推荐在用户自己的终端执行,不要依赖受限自动化环境完成 GitHub 登录。
- 如果看到 `.git/config: Permission denied`,优先切回用户终端操作。
- 如果看到 `SEC_E_NO_CREDENTIALS`,优先检查 GitHub 凭据登录状态。
