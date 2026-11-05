# 材料计算手记 · Material Web

在线站点：<https://hanvers.github.io/material-web/>

[![Deploy site to GitHub Pages](https://github.com/Hanvers/material-web/actions/workflows/deploy.yml/badge.svg)](https://github.com/Hanvers/material-web/actions/workflows/deploy.yml)

把 `resource/` 里的 Markdown 自动构建成静态文档站，通过 GitHub Pages 发布。站点不依赖前端框架，构建后的页面全部是静态 HTML。

- 首页、文档索引、文章页和全文搜索
- 自动生成右侧目录、阅读进度、上一篇 / 下一篇
- 代码高亮和一键复制，宽表格横向滚动
- 深色模式、移动端抽屉导航、键盘搜索（`Ctrl K` / `⌘K`）
- 中文锚点与原文手写目录兼容
- GitHub Actions 自动构建，支持项目页子路径

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

打开 <http://127.0.0.1:4173/>。`npm run dev` 会监听 `resource/`、`src/` 和站点配置，改动后自动重新构建，刷新浏览器即可看到结果。

只构建：

```bash
npm run build
```

构建结果在 `dist/`。检查构建产物：

```bash
npm run preview
```

## 添加一篇文档

1. 把 `.md` 文件放进 `resource/`，可以放在子目录中。
2. 在 `site.config.json` 的 `docs` 里添加元数据（推荐，尤其是中文文件名需要英文 slug 时）。
3. 运行 `npm run build` 或等待 GitHub Actions 构建。

最小配置：

```json
{
  "docs": {
    "我的新笔记.md": {
      "slug": "my-new-note",
      "title": "我的新笔记",
      "description": "一句话介绍这篇文档。",
      "category": "计算流程",
      "tags": ["VASP"],
      "order": 3,
      "updated": "2026-11-05"
    }
  }
}
```

支持的元数据：

| 字段 | 说明 |
| --- | --- |
| `slug` | 文章 URL，对应 `/docs/<slug>/`；不填时由文件名生成 |
| `title` | 页面标题和文章标题 |
| `navTitle` | 侧边栏中的短标题 |
| `description` | 摘要，用于卡片、SEO 和文章导语 |
| `category` | 分类标签，显示在卡片和文章头部 |
| `tags` | 字符串数组，显示为标签 |
| `order` | 排序数字，越小越靠前 |
| `updated` | `YYYY-MM-DD`，显示在卡片和文章底部 |
| `featured` | 设为 `false` 可不在首页优先展示 |
| `draft` | 设为 `true` 时跳过构建 |

也可以把同样的字段写在 Markdown 文件顶部的 YAML front matter 中，front matter 的优先级更高：

```markdown
---
title: 我的新笔记
slug: my-new-note
description: 一句话介绍这篇文档。
tags:
  - VASP
order: 3
---

# 正文标题
```

### Markdown 约定

- 第一个一级标题会作为正文标题的补充来源；页面标题优先使用 `title`。
- 手写的 `## 目录` 会自动隐藏，由页面右侧和移动端的自动目录替代。
- 代码块使用带语言名的围栏，例如 ` ```bash `、` ```fortran `、` ```lammps `。
- 文中的 `#锚点` 链接会与自动生成的中文标题 ID 一起校验。
- `public/` 下的文件会原样复制到站点根目录，适合放 `CNAME`、站点验证文件等固定路径资源。
- Markdown 中的图片建议使用完整 URL；当前构建不会自动搬运 Markdown 内的相对图片路径。

运行严格构建时，缺失的锚点会让构建失败：

```powershell
$env:STRICT=1; npm run build
```

## 配置站点

编辑 `site.config.json`：

```json
{
  "title": "材料计算手记",
  "shortTitle": "材料计算手记",
  "tagline": "Materials Computing Notes",
  "description": "站点简介",
  "author": "你的名字",
  "lang": "zh-CN",
  "sourceDir": "resource",
  "siteUrl": "",
  "repository": "",
  "repositoryBranch": "main"
}
```

- `siteUrl`：正式站点地址，例如 `https://your-name.github.io/material-web/`。用于 canonical、Sitemap 和社交分享元数据；GitHub Actions 会自动用 Pages 地址覆盖它。
- `repository`：完整的 GitHub 仓库地址。填写后会显示 GitHub 入口和「在 GitHub 编辑」链接。
- `sourceDir`：Markdown 来源目录，默认 `resource`。
- `public/`：可选的静态文件目录，会原样复制到 `dist/` 根目录，适合放 `CNAME` 等固定路径文件。

## 发布到 GitHub Pages

1. 新建 GitHub 仓库，把本项目推送到 `main` 分支。
2. 打开仓库 **Settings → Pages**，把 **Build and deployment → Source** 设为 **GitHub Actions**。
3. 在 `site.config.json` 中补上 `repository`，可选地补上 `siteUrl`。
4. 推送到 `main`。`.github/workflows/deploy.yml` 会安装依赖、构建并发布 `dist/`。

站点内部使用相对链接，因此项目页部署在 `https://<user>.github.io/<repo>/` 这种子路径下也能正常访问。`SITE_URL` 由 `actions/configure-pages` 自动提供，用于生成绝对地址。

### 自定义域名

把 `CNAME` 文件放进 `public/`，并在 GitHub Pages 设置中配置自定义域名，然后把 `site.config.json` 的 `siteUrl` 改为新域名。

## 目录结构

```text
.
├── resource/                 # Markdown 原文
├── src/
│   ├── app.js                # 搜索、主题、目录、导航交互
│   ├── styles.css            # 全站样式
│   └── favicon.svg
├── scripts/
│   ├── build.mjs             # 静态站点构建
│   ├── dev.mjs               # 监听 + 本地预览
│   ├── serve.mjs             # 零依赖静态服务器
│   └── lib/                  # Markdown 渲染和页面模板
├── site.config.json          # 站点与文档元数据
├── package.json
└── .github/workflows/deploy.yml
```

## 构建说明

- Markdown 由 `markdown-it` 渲染，代码高亮由 `highlight.js` 完成，front matter 由 `gray-matter` 解析。
- 构建时生成 `search-index.json`，浏览器端按标题、标签和正文做本地搜索，不依赖第三方搜索服务。
- CSS 和 JS 文件名带内容哈希，便于缓存失效。
- 文章锚点保留中文，按 GitHub 风格去掉标点后生成，例如 `#4-vasp-侧vtst-固定基矢-vaspml`。
- 输出目录每次构建前会清空，且只允许写入项目内的目录。

## License

文档内容版权归原作者所有；站点构建代码可按需修改使用。
