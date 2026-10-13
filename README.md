# Atlas · 港新硕士申请工作台

Atlas 是本地个人申请工作台，用来管理学校、项目、申请材料、文书和提交进度。当前通过 Vite 与本机 Supabase 运行，结构化数据保存在 PostgreSQL，上传文件保存在私有 Storage。

文书工具支持金融与金融科技、计算机科学、软件工程、数据科学、人工智能和通用六个方向，提供写作简报、可编辑提纲、事实关联、本地规则提示和人工审阅。当前没有连接自动生成或润色模型服务，也没有配置线上部署。上传源码到 GitHub 不会上传本机账号、申请资料或数据库，也不会自动发布可运行的网站。

## 功能

- **项目探索**：学校、项目、申请轮次、官方来源，以及材料、考试、文书和推荐信要求。
- **材料与事实**：私有文件上传、历史版本、下载、申请材料绑定、经历及材料佐证。
- **文书工作台**：PS、SOP、短题回答，题目和篇幅要求、六方向提问、段落调整、事实索引、英文词数估计与 Unicode 字符计数、七项人工审阅、Markdown 导出。
- **正文保护**：按账号与文书恢复未保存草稿；保存追加数据库版本；冲突时比较最新正文，明确选择基准后再保存。
- **申请执行**：推荐信、网申部分、任务、学校消息、提交编号与回执、申请结果。
- **数据与备份**：数据库 JSON 导出、旧数据预览导入、本地数据库与文件备份、隔离恢复工具。

切换写作方向只更新指导上下文，不改正文或已有提纲。只有未修改的起始提纲可以通过明确操作重建。新简报可依据当前账号项目的明确名称选择初始方向；无法判断时采用通用。旧简报保留原金融方向及笔记。

## 环境

- Node.js **24** 与 npm。
- Docker Desktop，使用 **Linux containers**，并保持 Docker 服务运行。
- 可用的本地端口：页面 `4189`、Supabase API `55421`、PostgreSQL `55422`；本地邮件查看器使用 `55424`。
- Supabase CLI 已由 `package-lock.json` 锁定为 `2.120.0`，随 `npm ci` 安装，不必另外安装全局 CLI。

所有命令都在仓库根目录运行。不要在已有申请数据的数据库上执行 `db reset`。

## Windows 开始使用

先安装依赖：

```powershell
npm ci
```

打开 Docker Desktop 后，双击 [启动Atlas.cmd](启动Atlas.cmd)。启动器检查本地项目与服务，启动或复用页面，然后打开 [本地工作台](http://127.0.0.1:4189/outputs/index.html)。运行中保持 Docker 开启。

第一次点击“创建个人账号”，自行填写显示名称、邮箱和至少 12 位密码；之后用同一账号登录。仓库不提供共享账号或预置申请资料。

- [停止Atlas.cmd](停止Atlas.cmd)：关闭经身份核验的页面进程，保留数据库和数据。
- [备份Atlas.cmd](备份Atlas.cmd)：生成保留旧备份的手动完整备份，包含数据库及上传文件。

详细使用顺序见 [个人使用说明](个人使用说明.md)。

## 命令行运行

```powershell
npm ci
npm run db:start
npm run configure:local
npm run dev
```

访问 [http://127.0.0.1:4189/outputs/index.html](http://127.0.0.1:4189/outputs/index.html)。`configure:local` 读取本地服务配置，将浏览器所需的公开设置写入被忽略的 `.env.local`。不要把 Supabase 状态输出或任何服务端密钥提交到仓库。

开发服务器用 `Ctrl+C` 停止。需要停止数据库时运行 `npm run db:stop`，保留本地数据。Windows 双击入口经过本机流程验证；其他平台可使用命令行流程，仍需自行验证运行环境。

```powershell
npm run build:local
npm run preview
```

`npm run build` 用于显式配置的生产环境；缺少合格生产设置时会拒绝构建。当前应使用 `build:local`。直接打开 HTML 或将源码交给普通静态服务器不能编译 TypeScript，也不能替代 Supabase；本仓库没有配置 GitHub Pages 部署。

## 数据存在哪里

| 内容 | 保存位置 | 备份方式 |
| --- | --- | --- |
| 学校、项目、申请、经历、正文历史版本等 | 本机 Supabase / PostgreSQL，按账号隔离 | 完整数据库备份；数据库 JSON 可用于业务数据导出 |
| 上传材料及回执文件 | 私有 Supabase Storage | 完整备份中的文件字节与校验信息 |
| 未保存正文草稿 | 当前浏览器 LocalStorage，按账号和文书隔离 | 先保存数据库版本，或导出当前正文与简报 |
| 写作简报、提纲和人工审阅状态 | 当前浏览器 LocalStorage，按账号和文书隔离 | “仅导出简报”或“导出当前正文与简报” |

**数据库 JSON 不含上传文件字节；数据库备份也不含浏览器里的未保存草稿和写作简报。** 换浏览器或清理浏览器数据前，先单独导出需要保留的内容。目前简报 Markdown 可以阅读，没有简报文件导入入口。

手动完整备份也可运行：

```powershell
node scripts/backup.mjs
```

备份写入被忽略的 `backups/`，包含账号及私有资料，需自行妥善保管。恢复使用独立的新目标，不覆盖正在使用的数据库。日常、计划备份及恢复范围见 [备份与恢复](docs/database/backup-restore.md)；旧版数据导入见 [迁移说明](docs/database/migration-import.md)。

## 文书方法与来源

写作围绕“实际题目 → 真实准备与个人行动 → 结果和反思 → 学习缺口 → 项目资源 → 目标”组织。计算机类方向分别关注算法与系统、架构与工程验证、统计和数据质量、模型评估与局限。方法问题是可修改的写作辅助，不是学校统一评分规则。

工作台整理了 **11 条来源卡片**，记录类型、学校／项目范围、查阅日期和短摘要。以下信息按 2026-10-13／14 的研究快照整理；具体申请年度、项目页面和申请入口要求优先。学生经验、授权示例及录取自述的可信度与官方要求分开显示。

学校范围包括 NUS MComp Specialisations、MComp AI、DFinTech，HKU MSc Computer Science，CityU Finance／Financial Engineering，以及 LSE 的写作要求、职业服务与学生经验；另含学校授权样例和低可信的本人录取自述。每条只适用于卡片注明的项目、年度或教学范围，不代表同校所有项目的要求。

这些参考不自动填入当前项目的题目、篇幅限制、课程事实或个人经历，也不能证明某种写法导致录取。完整链接、方法和范围见 [金融与金融科技指南](docs/research/2026-10-13-finance-fintech-writing-guide.md)、[计算机相关指南](docs/research/2026-10-14-computing-writing-guide.md) 与 [公开案例研究](docs/research/2026-10-13-admissions-writing-cases.md)。

## 开发与验证

```powershell
npm test
npm run lint
npm run typecheck
npm run check
npm run build:local
npm run security:scan
```

数据库检查需要 Docker；HTTP 集成检查还需要本地 Supabase：

```powershell
npm run test:db
npm run test:integration
npm run test:repositories
npm run test:import
```

测试包含合成数据、账号隔离、文件版本、导入完整性、简报并发、人工审阅失效和正文保存冲突回归。测试凭据与产生的资料不属于源码发布内容。修改数据库结构后，先增加新迁移，再运行 `npm run db:types`；保留已有 15 个历史迁移。

目录说明及启动细节见 [数据库文档](docs/database/README.md) 和 [本地开发](docs/database/local-development.md)。旧页面和领域测试中的示例只用于界面／测试，登录后的实际页面由 `src/main.ts` 根据当前账号数据渲染。
