# Atlas 页面入口

`outputs/index.html` 是 Vite 的页面入口，实际逻辑由 `../src/main.ts` 提供。数据来自当前账号的本机 Supabase，而非 HTML 中的历史示例。

安装、启动、端口和首次创建个人账号见 [仓库 README](../README.md)。从仓库根目录运行：

```powershell
npm ci
npm run db:start
npm run configure:local
npm run dev
```

访问 [本地工作台](http://127.0.0.1:4189/outputs/index.html)。直接打开 HTML 或使用普通静态服务器不能编译 TypeScript，也不能提供 Supabase 配置。

## 当前功能

学校与项目、申请轮次及来源、四类要求、私有材料与文件版本、经历与证据、文书历史版本、推荐信及网申进度、提交凭证和申请结果均由实际账号数据渲染。

文书工作台提供六方向写作简报、可编辑提纲、事实关联、英文词数估计与字符计数、本地检查、人工审阅及 Markdown 导出。没有自动生成或润色模型服务连接。

`app.js` 与 `domain.js` 中的旧领域示例保留为历史与测试资料；`app.js` 不是当前页面入口。示例人物、学校、项目和文件元数据不代表当前用户资料，不能据此推断已上传真实材料、已录取或已部署线上服务。

## 数据与构建

上传文件保存到 Supabase 私有 Storage；数据库 JSON 不含文件字节。未保存正文草稿和写作简报保存在当前浏览器，不包含在数据库备份中，应使用明确导出操作另存。详见 [个人使用说明](../个人使用说明.md) 与 [备份说明](../docs/database/backup-restore.md)。

使用 `npm run build:local` 生成本地构建；生产构建需要单独配置合格的生产设置。当前未配置托管或 GitHub Pages，源码上传不会自动部署网站。
