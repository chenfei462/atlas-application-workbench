# Atlas 本地浏览器全流程验收

范围：M23 完整 UI 创建/读取流程、M21 浏览器网络失败与恢复、M22 两个真实浏览器标签的陈旧更新。仅使用独立合成账户、合成文字及工具生成的无害 PDF。已有 API harness、SDK 测试、fixture verify 和浏览器操作的证据分别记录。

## 准备与清理工具

在 `atlas-local-dev` 内串行运行：

```powershell
node scripts/browser-flow-fixture.mjs setup
node scripts/browser-flow-fixture.mjs verify --run-id <setup返回的runId> --expect empty
```

`setup` 为本次运行创建一个新 Auth 用户，并在 ignored `work/browser-flow/<runId>/` 写入 `fixture.private.json`、`file-v1.pdf` 和 `file-v2.pdf`。不会通过 API 创建业务记录，也不会复用任何历史测试账户。需要固定运行标识时，可用 `setup --run-id <日期或短前缀>-<小写UUID>`；已存在的运行目录会被拒绝。

私有状态包含 `email`、`password`、`ownerId`、唯一 `runId`、固定本地 API、`fixtureKind`、源文件大小及 SHA-256。凭据仅在本机进入浏览器登录表单，不打印、不写报告、不截取密码。标准输出只含状态、运行标识和本次文件路径。

开发页面由 Vite 提供：`http://127.0.0.1:4189/outputs/index.html`。共享 Supabase API 必须是 `http://127.0.0.1:55421`。工具只读取本地 CLI 状态，拒绝其他 API；不会启动、停止、reset、link 或修改共享服务配置。

完成 UI 后的补充验证：

```powershell
node scripts/browser-flow-fixture.mjs verify --run-id <runId> --expect full-flow
node scripts/browser-flow-fixture.mjs hash --run-id <runId> --source file-v2.pdf --download <浏览器实际下载文件的绝对路径>
node scripts/browser-flow-fixture.mjs cleanup --run-id <runId>
```

`verify --expect observe` 可在中间步骤只读检查；`--expect full-flow` 会要求同一条完整关联链、四类要求、确切所选要求的来源绑定、至少两个材料/文书版本、材料适用申请、经历材料佐证、文书经历关联、当前文书版本事实依据、推荐信 `SUBMITTED`、门户完成、任务 `DONE`、确认收到的提交记录/回执以及 `OFFER`。它不证明这些记录由浏览器创建。`hash` 只读取本机下载文件并输出匹配状态。`cleanup` 在逐对象删除前核对 recorded owner、合成邮箱、Auth fixture metadata、runId、API 与所有文件路径，仅接受 `<owner>/materials/<materialUUID>/<versionUUID>/document.<允许扩展名>`；未知文件布局会停止删除。账户删除后确认全部 owner 记录和对象为零，并移除私有文件的密码。不会扫描或清理历史/真实用户。

## 定位规则

所有 views 都在 DOM 中，因此每次先点击左侧真实导航按钮，再将 locator 限定到当前 `.view.active`（如 `#view-programs`）。同名 `申请`、`项目`、`状态`、`保存` 和 `编辑` 不能从整页选择。

每个添加入口是 `<summary>`，不是按钮。点击精确可见文本后，在该 `details` 或 `form[data-table="…"]` 内操作字段；最后只点击该表单的 `保存`。成功后等 `已保存到数据库` 和顶部 `已连接数据库`，重新读页面快照，再操作下一个表单。保存后 DOM 会整体重建，不能复用旧 locator。编辑则限定到对应文字的记录 article，再展开其 `编辑`，点击 `保存修改`。

新表单下拉的空值为 `请选择`。枚举选项显示英文代码（例如 `PREPARING`、`COMPLETE`、`OFFER`、`true`）。`datetime-local` 字段的标签和 aria-label 会添加 `（UTC）`；输入时不要把本地时区时间误记为 UTC。

将 `<tag>` 替换为本次 `runId` 的短标记；同一个新账户只创建本次图，因此所有引用可明确选择。以下示例名称、日期、URL、数字及邮箱全部为假数据。

## M23 实际 UI 顺序

| 步骤 | 导航 / 精确入口 | 表单字段与假值 | 可见检查与关系 |
|---|---|---|---|
| 1 登录 | `登录申请工作台` | `邮箱` / `密码` 使用本次私有状态；点击 `登录` | 顶部 `已连接数据库`；总览无申请 |
| 2 学校 | `项目探索` → `+ 添加学校` | `学校名称`=`Atlas UI University <tag>`；`简称`=`AUI`；`城市`=`Synthetic City` | 学校列表出现名称 |
| 3 项目 | `+ 添加项目` | `学校` 选本次大学；`项目名称`=`Atlas UI MSc <tag>`；`入学年份`=`2027`；其他使用默认 | 项目记录及学校引用保存 |
| 4 轮次 | `+ 添加申请轮次` | `项目`选本次项目；`轮次名称`=`Atlas UI Round <tag>`；`轮次顺序`=`1`；`截止日期`=`2027-01-20`；`官网给出的时间精度`=`DATE_ONLY`；`官网时区（如 Asia/Hong_Kong）`=`Asia/Tokyo` | 轮次记录可见；日期不伪造具体时刻 |
| 5 来源 | `+ 添加信息来源` | `来源链接`=`https://example.invalid/atlas-ui-test`；`标题`=`Atlas UI Source <tag>`；`来源类型`=`USER_INPUT` | 来源可被下拉选择；不访问外部地址 |
| 6 申请 | `+ 添加我的申请` | `项目`选本次项目；`目标轮次`选本次轮次；`状态`=`PREPARING` | 总览显示本次项目/轮次 |
| 7 材料要求 | `+ 添加材料要求` | `项目`本次项目；`材料类型（CV / TRANSCRIPT 等）`=`CV`；`要求名称`=`Atlas UI CV <tag>`；`份数`=`1`；`是否必需`=`true`；`来源`本次来源 | 要求属于本次项目及来源 |
| 8 考试要求 | `+ 添加考试要求` | `项目`本次项目；`考试`=`IELTS`；`最低总分`=`7`；`是否允许豁免`=`false`；`来源`本次来源 | 考试要求保存 |
| 9 文书要求 | `+ 添加文书要求` | `项目`本次项目；`文书类型（PS / PERSONAL_STATEMENT）`=`PS`；`题目`=`Synthetic UI workflow only`；`字数上限`=`500`；`是否必需`=`true`；`来源`本次来源 | 文书要求保存；后续文书引用它 |
| 10 推荐信要求 | `+ 添加推荐信要求` | `项目`本次项目；`必需数量`=`1`；`最多数量`=`1`；`来源`本次来源 | 推荐数量保存 |
| 11 材料 | `材料中心` → `+ 添加材料` | `材料名称`=`Atlas UI CV <tag>`；`类型`=`CV`；`确认状态`=`CONFIRMED` | 文件版本区出现同名材料 |
| 12 上传/版本 | 同名材料 card → `上传新版本` | 通过真实 file input 依次选工具提供的 `file-v1.pdf`、`file-v2.pdf` | 等上传校验成功；显示 `v1 · file-v1.pdf` 与 `v2 · file-v2.pdf`，不可 API 上传替代 |
| 13 材料绑定 | `+ 添加申请材料绑定` | `申请`选本次项目 `· PREPARING`；`对应要求`选本次 CV 要求；`材料版本`选 `Atlas UI CV <tag> v2 · file-v2.pdf`；`准备状态`=`COMPLETE` | 同一申请的要求引用 v2；总览材料计数更新 |
| 13a 材料适用 | `+ 添加材料适用申请` | `材料`选本次 CV；`申请`选本次申请 | 记录标签显示 `材料 → 申请`；刷新保留 |
| 14 证据 | `我的画像` → `+ 添加经历证据` | `经历名称`=`Atlas UI Project <tag>`；`类型`=`PROJECT`；`机构`=`Synthetic Lab`；`事实说明`=`Harmless synthetic browser test only`；`已确认`=`true` | 经历证据记录可见 |
| 14a 经历材料 | `+ 添加经历材料佐证` | `经历证据`选本次 Project；`佐证材料`选本次 CV | 记录标签显示 `经历证据 → 材料`；刷新保留 |
| 15 文书 | `文书工作台` → `+ 添加新文书` | `申请`本次申请；`文书要求`本次 PS 要求；`文书类型`=`PS` | 正文编辑区可见；文书选择显示项目名 `· PS` |
| 16 文书版本 | `正文` → `保存新版本` | 输入 `Atlas UI synthetic essay version one <tag>.` 保存；再输入 `Atlas UI synthetic essay version two <tag>.` 保存 | `历史版本（2）`；展开 `v1`/`v2`核对各自正文 |
| 17a 文书经历 | `+ 添加文书经历关联` | `文书`选本次项目 `· PS`；`经历证据`选本次 Project | 记录标签显示 `文书 → 经历证据`；刷新保留 |
| 17b 版本事实 | `+ 添加文书版本事实依据` | `文书版本`选本次项目 `· PS v2`；`经历证据`选本次 Project；`事实说明`=`Synthetic project supports this saved essay version` | 关系显示且刷新保留；展开该关系的 `编辑`可读事实说明；`verify` 的 `essayEvidence=true` |
| 18 推荐人 | `申请执行` → `+ 添加推荐人` | `姓名`=`Atlas UI Recommender <tag>`；`邮箱`=`synthetic-recommender@example.invalid`；`机构`=`Synthetic Lab` | 仅记录假联系人，不发邮件/消息 |
| 19 推荐进度 | `+ 添加推荐信进度` | `申请`本次申请；`推荐人`本次推荐人；初始 `状态`=`REQUESTED` 保存；编辑后改 `SUBMITTED` 并填 `提交时间（UTC）`=`2026-10-13T03:00` | 两次状态均可见；同一申请/推荐人 |
| 20 门户 | `+ 添加申请入口进度` | `申请`本次申请；`入口部分（education 等）`=`education`；`状态`=`COMPLETE`；`完成百分比`=`100` | `education` 记录显示 `COMPLETE` |
| 21 任务 | `申请进度` → `+ 添加任务` | `申请`本次申请；`任务名称`=`Atlas UI Submit <tag>`；初始 `状态`=`OPEN` 保存，随后编辑为 `DONE` | 任务关联申请、状态修改后刷新保留 |
| 22 提交凭证 | `申请执行` → `+ 添加记录提交凭证` | `申请`本次申请；`学校申请编号`=`ATLAS-UI-<tag>`；`实际提交时间（UTC）`=`2026-10-13T03:10`；`已收到确认`=`true`；`回执文件版本`本次 CV v2 | RPC 提交保存；总览显示编号；申请状态变 `SUBMITTED`；回执仍引用确切 v2文件 |
| 23 结果 | `+ 添加申请结果` | `申请`本次项目 `· SUBMITTED`；`结果`=`OFFER`；`收到时间（UTC）`=`2026-10-13T03:20`；`录取条件（每行一项）`=`Synthetic verification only` | 总览结果 `OFFER` |
| 24 刷新 | 浏览器真实 Reload，然后逐页读取 | 不重新录入数据 | 申请、要求、两份文件、版本、文书正文、关系、进度、凭证和结果保留 |
| 25 重登录 | `退出登录` → 本次账号密码登录 | 真实退出再登录 | 登录门显示；重新登录后完整记录保留 |
| 26 实际下载 | `材料中心` → 本次 `v2 · file-v2.pdf` 行 `下载` | 保存浏览器真实下载路径；执行 `hash … --source file-v2.pdf` | SHA-256 与上传源文件完全相同；可再下载 v1验证历史版本 |
| 27 跨用户 | 独立另一个 `setup` 创建空假账户；退出 A后用 B真实登录 | 不给 B预建业务数据 | A图不可见；补充隔离查询不可替代 B 的真实 UI读取。随后退出 B并重新登录 A |

## 关系入口核对

根任务已为 `material_application_links`、`evidence_material_links`、`essay_evidence_items` 和 `essay_evidence_links` 补齐上表的添加/编辑入口。文书要求下拉显示 `项目 · 类型 · 题目`；文书版本显示 `项目 · 类型 vN`；关系记录显示 `左侧对象 → 右侧对象`。真实验收仍须在最新浏览器快照中读取这些入口，不能用 fixture/API 填充后声称浏览器完成。

合法的同一申请多条同类型文书，在初始新增标签实现中仍可能显示相同文书/版本名称；根任务收到独立审查意见，需在最终标签中加入文书要求题目或其他确定标识以便区分。这轮单图假账户的关系选择不应误用另一条文书。

## M21 浏览器网络失败 / 恢复

1. 保持 A用户文书当前版本与基准一致。真实浏览器打开文书工作台，在正文输入唯一假草稿 `Atlas UI offline draft <tag>.`，确认 `未保存草稿已保留`。
2. 通过浏览器原生网络 offline 或本次临时本机测试代理实际关闭 API转发。保留共享 Supabase运行。禁止 `evaluate` 替换 `fetch`、SDK、保存回调或手改 LocalStorage 来制造通过。
3. 点击 `保存新版本`。观察实际失败提示 `网络连接失败，请恢复连接后重试。`、`保存失败`；正文保持完整、没有新增服务器版本。记录网络控制方式和原始失败证据。
4. 恢复实际网络/代理转发，不改变正文。再次点击 `保存新版本`；确认成功、新版本追加且正文一致。真实 Reload确认数据库正文；Logout/Login再确认。
5. 可在恢复后追加浏览器草稿→Reload恢复流程；这与网络失败矩阵分别记录。网络中断期间，Vite页面应仍可访问，否则不宜把页面加载失败当成草稿重载验收。
6. 新增保存版本后，用真实 UI把证据关联到新的当前版本，再执行严格 `verify --expect full-flow`。

## M22 两个真实浏览器标签

1. A和B标签均用同一假账户、同一文书。两页通过真实 Reload从数据库获得相同当前版本 `N`；在测试前关闭旧草稿恢复影响。
2. A输入 `Atlas UI winning tab A <tag>.`，点击 `保存新版本`并等成功（`N+1`）。保持 B原页面未刷新。
3. B再输入 `Atlas UI stale tab B <tag>.`，点击 `保存新版本`。观察 `记录已被另一页面修改，请重新加载后比较；当前草稿已保留。`；B的正文保留，服务器 `N+1`仍为 A内容，不能出现静默覆盖/成功提示。
4. 浏览器标签共享 LocalStorage，B草稿可能在 A刷新后显示 `已恢复未保存草稿…`；这不等于服务器被覆盖。通过历史版本显示和补充只读 `verify`区分持久版本与临时草稿；禁止手改草稿key或注入请求。
5. 用 UI明示的比较/恢复入口处理冲突后，从最新服务器基准重试。如果产品没有该入口，准确记录恢复 UX缺口，不要通过注入基准版本制造成功。
6. 可用项目/材料高价值记录的 `编辑`另做双标签陈旧 `updated_at`更新。两标签先展开同一记录编辑表单；A保存新值，B保存旧基准改值必须失败；B表单值保留。重新读服务器只允许看到 A值。
7. 最后把当前文书版本的证据关联补齐，保存M21/M22可见证明，执行本次全图/下载校验，再限定 owner清理所有本次账户。

## 证据与尚未覆盖

每一步记录真实 browser snapshot/截图、操作输入的合成标记、成功/失败提示、最终版本号及工具 exit code。截图不要含密码或任何真实账户/文件。`VERIFY_PASS`仅证明当时本地记录与下载校验；完整浏览器 `PASS`还需要上表所有操作证据。

工具作者只执行无 DB写入的纯逻辑测试、语法/帮助检查。该清单不是已经执行的浏览器结果。Root串行执行 setup、UI、网络代理、双标签、只读校验与 cleanup。生产项目、部署、真实文档、真实用户数据和远程备份/恢复均不在此轮浏览器范围内。
