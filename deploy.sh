#!/bin/bash
# 上岸通刷题网站 — 自动部署脚本
# 用法: bash deploy.sh "提交说明"
# 功能: 读取本地密钥文件的 GitHub PAT，自动 git add + commit + push 到 main，触发 GitHub Pages 重新部署
# 密钥文件: D:/workbuddy/密钥/github_pat.txt （不进 git，本地私密）

set -e
PROJ_DIR="$(cd "$(dirname "$0")" && pwd)"
SECRET="D:/workbuddy/密钥/github_pat.txt"
REMOTE="https://github.com/shiwuooo/shangantong.git"

if [ ! -f "$SECRET" ]; then
  echo "❌ 找不到密钥文件: $SECRET"
  exit 1
fi

TOKEN=$(tr -d '[:space:]' < "$SECRET")
if [ -z "$TOKEN" ]; then
  echo "❌ 密钥文件为空"
  exit 1
fi

cd "$PROJ_DIR"

MSG="${1:-更新: $(date '+%Y-%m-%d %H:%M')}"

# 暂存所有改动（新增 + 修改）
git add -A

# 如果没有改动就退出
if git diff --cached --quiet; then
  echo "✅ 没有需要部署的改动，跳过"
  exit 0
fi

git commit -m "$MSG"
echo "✅ 已提交: $MSG"

# 用 PAT 临时配置 remote 并推送
git remote set-url origin "https://${TOKEN}@github.com/shiwuooo/shangantong.git"
git push origin main
git remote set-url origin "$REMOTE"
echo "🚀 已推送 main，GitHub Pages 正在重新部署…"
echo "🌐 稍候访问: https://shiwuooo.github.io/shangantong/"
