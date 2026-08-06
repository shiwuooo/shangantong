# 上岸通 · 考公刷题网站

> 纯 HTML / CSS / JS 本地版公务员考试刷题站，支持 Supabase 多用户云端同步。手机端 / 电脑端都能用。

## 🎯 功能总览

| 模块 | 功能 |
|---|---|
| 🏠 首页 | 国考倒计时、今日进度环、连续打卡、7 天趋势 |
| ✏️ 刷题 | 6 大模块（常识/言语/数量/判断/资料/申论）可选 |
| 📝 模考 | 30 题 120 分钟、自动评分、成绩单 |
| 📒 错题本 | 自动加入、可重做、可移除 |
| ⭐ 收藏 | 一键收藏好题、分类复习 |
| 📈 统计 | 累计/每日/正确率/模块分布图 |
| ☁️ 云端 | 选配 Supabase 多用户注册/登录/答题同步 |
| 📋 导入 | 批量导入题库（JSON / 文件 / Supabase 同步） |
| 🌙 暗色 | 自动跟随系统暗色模式 |

## 🚀 本地预览

双击 `index.html`，浏览器打开就能用（推荐 Chrome / Edge）。

或者：
```bash
npx serve 考公刷题网站    # Node 方式
python -m http.server 8080   # Python 方式
```

## ☁️ Supabase 多用户 + 部署指南

### 第一步：创建 Supabase 项目
1. 打开 [supabase.com](https://supabase.com) 注册/登录
2. 点 **New project** → 输入项目名 → 选一个离你近的区域（推荐 Southeast Asia / Tokyo）
3. 创建后等待数据库启动（~2 分钟）

### 第二步：初始化数据库
1. 进入 Supabase Dashboard → **SQL Editor**
2. 复制 `supabase/schema.sql` 全部内容，粘贴到编辑器中
3. 点击 **Run** 执行（一次性创建所有表 + RLS 策略 + 种子数据）

### 第三步：配置项目密钥
1. Supabase Dashboard → **Settings → API**
2. 复制 `Project URL` 和 `anon public key`
3. 打开 `js/supabase.js`，修改前两行：
   ```js
   const SUPABASE_URL = 'https://你的项目id.supabase.co';
   const SUPABASE_ANON_KEY = '你的anon_key';
   ```

### 第四步：部署到 Vercel
1. 把 `考公刷题网站/` 文件夹推到一个 GitHub 仓库
2. 打开 [vercel.com](https://vercel.com) → Import → 选你的 GitHub 仓库
3. **无需任何配置**（纯静态网站），点 Deploy 即可
4. 获得一个 `https://xxx.vercel.app` 的域名

### 第五步：测试
- 打开你的 Vercel 域名
- 首页右上角点「登录」
- 输入邮箱 + 密码注册 → 刷题 → 换设备登录 → 数据同步

## 💰 卖货思路（定价 + 注册码模式）

参考小红书「尖尖」的套路：

### 模式 A：月卡 / 终身会员
- **定价**：¥9.9 体验 / ¥29.9 终身
- **交付**：给 Vercel 链接 + 注册码（Supabase 手动建账号）
- **收款**：闲鱼（走"虚拟商品"类目）、微信转账

### 模式 B：注册码制（防破解）
- 注册功能关闭（Supabase → Authentication → 关闭公开注册）
- 手工在 Supabase Auth 后台创建用户
- 用户付钱后你发邮箱 + 密码
- 上锁：在 `js/supabase.js` 中 `signUp` 改为调用一个 Edge Function 校验注册码

### 模式 C：套餐化
- 基础版：¥19.9 / 本地版（index.html 打包发）
- 进阶版：¥49.9 / 云端同步版（Supabase）
- 尊享版：¥99.9 / 云端同步 + 1000+ 真题库 + 申论批改

### 📢 推广渠道
- **小红书**：发帖"考公人必存！我做了个刷题小程序" → 配截图 → 评论区/私域引导
- **闲鱼**：挂链接"考公刷题神器·全部真题"（¥9.9 起）
- **公众号**：写"行测 80 分刷题方法论"文章引流
- **微信群**：考友群分享链接

## 📂 项目文件

```
考公刷题网站/
├── index.html           # 主页面（5 个路由：首页/刷题/模考/错题/收藏/统计/登录）
├── import.html          # 题库批量导入器
├── css/style.css        # 全局样式 + 暗色模式
├── js/
│   ├── data.js          # 核心题库（90+ 题）+ 导入题加载逻辑
│   ├── data-expanded.js # 扩充题库（100+ 模拟题）
│   ├── app.js           # 所有交互 + Supabase 同步 + 登录逻辑
│   └── supabase.js      # Supabase 客户端封装（API 调用）
├── supabase/
│   └── schema.sql       # 数据库 schema（表 + RLS + 种子数据）
└── README.md
```

## 🧠 题库扩充说明

当前题库：**约 190 题**（90 核心 + 100 扩充，均为根据考纲编写的风格模拟题）

### 为什么没有近十年真题？
- 历年国考/省考真题版权属于各培训机构（粉笔/华图/中公）
- 直接复制真题用于商业可能有法律风险
- **建议**：① 购买正版真题书籍 → ② OCR 提取 → ③ 用 `import.html` 批量导入

### 如何导入自己的真题
1. 打开 `import.html`（或网站中导航到"题库导入"）
2. 粘贴 JSON 格式题目，或上传 .json 文件
3. 选择对应模块，点击导入
4. 导入的题目自动保存在浏览器 localStorage

### JSON 格式模板
```json
{
  "id": "自定义ID",
  "type": "单选",
  "q": "题目内容",
  "options": ["A", "B", "C", "D"],
  "answer": 2,
  "explain": "解析",
  "source": "2024国考地市",
  "module": "yanyu"
}
```

## 🔧 自定义主题色

`css/style.css` → `:root` → 改 `--primary`：
```css
--primary: #5b6cff;   /* 主色 */
--grad: linear-gradient(135deg, #6a7bff 0%, #8b9eff 100%);
```

## ⚖️ 免责声明

本站题库为学习参考风格模拟题，不保证与真实考试完全一致。请以最新招考公告及权威教材为准。代码开源免费，如用于商业用途请自行评估合规性。
