# underoot

<img src="public/favicon.svg" width="36" height="36" alt="underoot 根号图标" />

一个**可插件扩展、可本地部署的 vibe research 平台**。用 LaTeX 写作与 PDF 审阅作为第一种研究工作流，连接 AI 建议、协作讨论、项目搜索、学术传播和可追溯版本。核心数据保存在本机 `data/`；模型与在线文献检索由用户按需启用。

> 当前版本：**v0.10.2** · 论文审阅、协作与版本工作台。仓库：[fanzipei/underoot](https://github.com/fanzipei/underoot)。

---

## 零、部署建议

本地开发按「一、快速开始」即可。若要放到服务器上对外提供服务：

- 用 Nginx / Caddy 做 HTTPS 反向代理，并按 `.env.example` 设置 `LATEXSTUDIO_SECURE_COOKIE=1`、`LATEXSTUDIO_HSTS=1`、`LATEXSTUDIO_TRUST_PROXY=loopback`；
- 修改默认演示账号密码（或设 `LATEXSTUDIO_DISABLE_DEMO=1` 停用它），管理员首次登录会强制改密；
- 编译引擎可装 TeX Live（pdfLaTeX，与 Overleaf 默认排版一致）或使用内置的 Tectonic 一键安装；
- `data/` 与 `.env` 含全部用户数据和密钥，务必加入备份并限制访问权限，**切勿提交到版本库**。

---

## 一、快速开始

```bash
cd underoot
npm install          # 首次部署时执行（当前环境已装好）
npm start            # 构建前端 + 启动服务
```

`public/assets/app.js`、`pdf.worker.min.mjs`、`cmaps/`、`standard_fonts/` 由 `npm start` 自动从依赖生成，无需提交到版本库；仓库里只保留手写源文件。

浏览器打开 <http://localhost:3000>。

首次启动会自动创建一个演示账号和一个示例项目：

| 邮箱 | 密码 |
| --- | --- |
| `demo@latex.studio` | `demo1234` |

建议在正式使用前到「头像 → 账户设置」修改密码，或注册自己的账号。

启动脚本会打印当前检测到的编译引擎：

```
underoot 已启动
地址      http://localhost:3000
数据目录  ...\latexstudio\data
编译器    tectonic
```

---

## 二、功能

**账户**
- 注册 / 登录 / 退出、JWT（HttpOnly Cookie，30 天）
- **注册审批**：新注册账号默认进入「待审批」，管理员通过后才能登录。管理员可在「账号管理」页顶部用**开放注册**开关随时切换，无需改配置或重启：开启后新账号立即生效，已有待审批申请会一并放行；关闭只影响之后的注册。管理员始终可以停用 / 删除 / 重置任意普通账号。开关保存在数据库，优先于 `LATEXSTUDIO_REQUIRE_APPROVAL` 环境变量（后者仅作为未设置时的默认值）
- **管理员后台**（`#/admin`）：待审批 / 正常 / 已拒绝 / 全部四个视图，一键通过、拒绝、停用、重置密码、删除账号；头像菜单实时显示待处理数量
- 内置管理员账号（`admin@latex.studio`，初始密码见启动日志或 `data/admin-password.txt`，首次登录强制改密）
- 昵称、头像颜色、密码修改；管理员重置过的密码同样强制首次改密
- 演示账号自动初始化

**项目**
- 新建（10 套模板：空白文章 / 学术论文 / 中文文档 / Beamer 幻灯片 / 个人简历 / 插图与表格 / **ACM (acmart)** / **IEEE (IEEEtran)** / **AAAI-26 (官方 aaai2026.sty)** / **NeurIPS 2025 (官方 neurips_2025.sty)**）
- **三种创建方式**：模板、ZIP 压缩包、GitHub 仓库链接（便于从 Overleaf / GitHub 迁移）
- 重命名、复制、删除、搜索、ZIP 导出、ZIP 导入
- 按邮箱邀请已注册成员共同编辑（所有者 / 编辑者）
- 主文件可切换，支持多文件工程

**文件**
- 文件树（新建文件 / 文件夹、重命名、删除、设为主文件、下载）
- 单文件 / 整文件夹上传，图片、PDF 预览
- 编译产物（.aux/.log/.out 等）自动隐藏，`.pdf` 保留以便查看

**编辑**
- CodeMirror 6：LaTeX 语法高亮、括号匹配、折叠、多光标、查找替换
- `\command` 补全（约 70 条常用命令与环境），`\ref{}` / `\cite{}` 自动补全文档内的 `\label` 与 bib key
- 多标签页、`Ctrl+S` / `Ctrl+Enter` 编译、状态栏行列号
- **Yjs CRDT 多人实时协作**：字符级同步、远程光标与选区、在线成员头像、自动保存（约 0.7s 落盘）
- **协作评论**：在文件里选中一段文字即可添加评论（编辑器内高亮 + 点击定位）；**另有 Overleaf 没有的 PDF 圈选评论**——点 PDF 工具栏的框选按钮，在页面上拖出一个矩形区域就能针对该区域留言，缩放与重新编译后位置不失效。所有共享成员都能回复同一条评论线程，可标记「已解决」/ 重新打开；评论实时同步给在线成员（项目事件通道），作者本人或项目所有者可删除
- **文件版本历史**：模板初始快照 + 自动保存（12 秒节流）+ 显式保存/上传/导入立即留档，每文件保留 40 个版本，可预览并一键恢复；侧栏时钟图标打开

**编译与预览**
- 服务端编译，支持 `latexmk`(pdfLaTeX) / `xelatex` / `lualatex` / `pdflatex` / `tectonic`
- **每个项目可单独选编译引擎**：在编辑器顶部、编译按钮旁的「编译器」下拉框选择（「⋯」菜单也保留入口），可选自动或任一已安装引擎；设置持久化到当前项目，换引擎自动重编，并实时同步给项目协作者。不同项目设置互不影响，编译缓存按引擎隔离。系统会自动发现装在用户目录的 TeX Live（无需 sudo）。
  - **与 Overleaf 排版对齐**：Overleaf 默认 pdfLaTeX（Type1 + `newtxmath` + 完整 `microtype`）；Tectonic 是 XeTeX + `unicode-math`/Libertinus OTF，字体度量与断行不同，容易出现右边界溢出。把项目引擎切到 **pdfLaTeX (latexmk)** 即可得到与 Overleaf 一致的排版。
  - 可用 `LATEX_ENGINE` 指定服务端默认引擎；TeX Live 装在非标准位置时设 `LATEXSTUDIO_TEXLIVE_BIN`（指向含 `pdflatex` 的 bin 目录，多个用系统路径分隔符分隔）。常见用户级路径（`~/.texlive/2026/bin/*`、`~/.TinyTeX/bin/*`）会自动探测。
- **协同编译**：编译开始/结果通过项目事件通道 WebSocket（`/events/<projectId>`）广播给全部在线成员，所有人看到同一份 PDF 与错误列表；只有本地键入会触发自动编译，远程改动不会让每个客户端各编译一次
- **编译去重**：按项目源文件内容指纹缓存结果，源码未变时自动编译直接复用（10 分钟内），手动点「编译」强制重编
- 自动编译（停止输入 1.8 秒后触发，可在「⋯」菜单开关）
- **纯净 PDF 预览**：使用内置 PDF.js 把每一页渲染成画布，**不显示浏览器 PDF 插件的工具栏、缩略图侧栏与菜单**；自带适应宽度、缩放（−/100%/+）、页数显示、重新编译与下载。文件树里直接打开 `.pdf` 同样使用画布渲染。
- 错误 / 警告结构化提取，点击问题可跳转到对应源码行
- **常见编译错误自动体检与一键修复**：打开项目时静态扫描并提前提示两类问题，编译日志也附带可操作建议，点「一键修复」自动处理，从 ZIP / GitHub 导入时自动应用：
  - **宏包选项冲突**（`Option clash for package X`）：同一宏包被以不同选项重复加载 → 在主文件 `\documentclass` 前插入 `\PassOptionsToPackage`。
  - **unicode-math 粗体希腊字母**（`Improper alphabetic constant` / `\mitPhi`）：acmart 等文档类在 XeLaTeX / Tectonic 下用 LibertinusMath，`\boldsymbol{\Phi}`、`\bm{\Phi}` 会报错 → 改为 `\symbf{\Phi}`，并加 `\providecommand` 兜底以保持 pdfLaTeX 兼容。
- 完整编译日志、耗时、引擎与发起人显示

---

## 三、编译器

项目已经附带 **Tectonic 0.17.0**（`bin/tectonic.exe`，Windows x64），无需安装 TeX Live 就能编译。

| 情况 | 处理方式 |
| --- | --- |
| Windows（本项目） | 直接使用 `bin/tectonic.exe` |
| 其他系统 / 删了 bin | 项目列表右上角「头像 → 编译环境 → 一键安装 Tectonic」，会自动下载对应平台版本 |
| 已装 TeX Live / MiKTeX | 自动识别 `latexmk` 优先，其次 `xelatex` / `lualatex` / `pdflatex` |

注意：

- **首次编译需要联网**：Tectonic 会按需下载 TeX 宏包和字体（视模板几十秒到两分钟），之后缓存在本机，二次编译约 1–2 秒。
- 中文请用「中文文档」模板或 `\documentclass[fontset=fandol]{ctexart}`；普通 `article` 直接写中文会出现 "Missing character" 警告。
- 会议模板（ACM / IEEE / AAAI / NeurIPS）自带官方样式文件与示例插图，新建即可编译；ACM 的 `acmart`、IEEE 的 `IEEEtran` 由 Tectonic 自动下载，AAAI / NeurIPS 的官方 sty/bst 已随模板附带，无需额外配置。XeTeX 下 IEEE/AAAI 可能出现 `Font shape TU/ptm... undefined` 警告，属于字体替换提示，不影响输出。
- 强制指定引擎：`LATEX_ENGINE=latexmk npm start`。

---

## 四、配置（环境变量）

所有配置也可以写在**项目根目录的 `.env`** 里（复制 `.env.example` 改一改即可），已存在的系统环境变量优先。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址；设为 `127.0.0.1` 则只允许本机 |
| `LATEXSTUDIO_DATA` | `./data` | 数据库与项目文件目录 |
| `LATEXSTUDIO_SECRET` | 自动生成并存于 `data/secret.key` | JWT 签名密钥，改了会让所有登录失效 |
| `LATEX_ENGINE` | 自动 | 强制使用的引擎 id |
| `LATEXSTUDIO_TIMEOUT` | `240000` | 单次编译超时（毫秒） |
| `LATEXSTUDIO_REQUIRE_APPROVAL` | `1` | 注册审批的**默认值**；设为 `0` 时默认开放注册。管理员在后台改过开关后以数据库设置为准 |
| `LATEXSTUDIO_REGISTER_MAX` | `5` | 同一 IP 10 分钟内最多注册次数；设 `0` 关闭限流（仅建议内网 / 回归测试使用） |
| `LATEXSTUDIO_ADMIN_EMAIL` | `admin@latex.studio` | 内置管理员邮箱 |
| `LATEXSTUDIO_ADMIN_PASSWORD` | 随机生成 | 设置后每次启动会把管理员密码重置为该值（找回入口） |
| `LATEXSTUDIO_DISABLE_DEMO` | 空 | 设为 `1` 停用共享的演示账号 |
| `LATEXSTUDIO_GITHUB_TOKEN` | 空 | GitHub Personal Access Token，用于导入私有仓库、提高 API 限流额度；也可设 `GITHUB_TOKEN` |

局域网协作：保持 `HOST=0.0.0.0`，同一网络内访问 `http://<本机IP>:3000`（Windows 需放行防火墙），WebSocket 会自动跟随当前域名。

### 从 ZIP / GitHub 迁移项目

「新建项目」弹窗里有三个来源页签：**模板**、**ZIP 文件**、**GitHub 链接**；顶栏「导入项目」按钮直达 ZIP 页签。两者都会创建一个全新项目，导入后自动打开。

- **ZIP**：支持本平台导出的项目包、Overleaf 导出的 ZIP、GitHub 下载的仓库 ZIP（≤30 MB）。自动剥离压缩包顶层的单一目录，自动识别主文件（优先 `main.tex`，其次含 `\documentclass` 的浅层 `.tex`，再其次任意 `.tex`）；若包里没有 `.tex`，会补一个最小 `main.tex` 保证可编译。可自定义项目名。
- **GitHub**：填仓库主页、`/tree/<分支>`、archive ZIP 链接、`owner/repo` 简写或 SSH 形式均可。服务端经 `api.github.com` 查默认分支、从 `codeload.github.com` 下载源码 ZIP 后按上述规则导入；私有仓库需配置 Token。
- **安全约束**：仅允许 `github.com` 等白名单域名且强制 HTTPS，逐跳校验重定向；压缩包条目数 ≤3000、解压后总量 ≤80 MB、单文件 ≤12 MB；丢弃符号链接、`.git/`、`__MACOSX/` 与含 `..` 的路径穿越条目，落盘前统一做路径规范化校验。导入失败会回滚，不留空项目。
- 服务器无法访问 GitHub（内网隔离、超时、限流）时会明确报错，此时可手动下载仓库 ZIP 再走「ZIP 文件」导入。

---

## 五、目录结构

```
latexstudio/
├── bin/tectonic.exe              # 内置编译器
├── server/
│   ├── index.js                  # Express 应用、静态资源、启动与演示数据
│   ├── env.js                    # 极简 .env 加载器（无额外依赖）
│   ├── config.js                 # 审批开关 / 管理员账号 / 初始密码文件
│   ├── db.js                     # node:sqlite 建表与查询
│   ├── auth.js                   # 注册/登录/JWT/Cookie/账号锁定
│   ├── admin.js                  # 管理员审批接口（需 admin 角色）
│   ├── projects.js               # 项目、文件树、上传下载、成员、编译路由
│   ├── import.js                 # ZIP 解包校验、GitHub 链接解析与下载（SSRF 白名单）
│   ├── latex-fixes.js            # 宏包选项冲突静态检测与自动修复
│   ├── compile.js                # 引擎探测、编译、日志解析、一键安装
│   ├── collab.js                 # WebSocket + Yjs 服务端文档与落盘
│   ├── paths.js                  # 路径安全与工具函数
│   └── templates/*               # 10 套初始模板（会议模板自带官方样式与示例插图）
├── src/client/
│   ├── pdf-viewer.js             # PDF.js 画布渲染器（无插件界面）
│   └── views/*                   # 登录 / 强制改密 / 仪表盘 / 账号审批 / 编辑器
├── public/assets/
│   ├── app.css / app.js          # 样式与前端 bundle
│   ├── pdf.worker.min.mjs        # PDF.js worker（构建时从 node_modules 复制）
│   ├── cmaps/                    # CJK 预定义 CMap，中文 TeX 字体必需
│   └── standard_fonts/           # PDF 标准字体
├── public/index.html
├── data/                         # 运行时数据（自动生成，勿删）
│   ├── app.db                    # 用户 / 项目 / 成员 / 编译记录 / 版本快照
│   ├── secret.key                # JWT 密钥
│   ├── admin-password.txt        # 随机生成的管理员初始密码（改密后自动删除）
│   ├── yjs/<uuid>/               # 每个项目内各文件的 Y.Doc 状态（重启后不丢 clientID）
│   └── projects/<uuid>/          # 每个项目的源文件与编译产物
├── scripts/build.mjs             # 前端打包
├── scripts/admin.mjs             # 账号运维命令行（审批、改密、停用、删除…）
└── scripts/smoke-test.mjs        # 回归测试（npm test）
```

备份：停止服务后整体复制 `data/` 目录即可；恢复时覆盖回去再启动。

---

## 六、技术实现

| 层 | 选型 |
| --- | --- |
| 服务端 | Node.js 22 + Express 4 |
| 数据库 | 内置 `node:sqlite`（无原生编译依赖） |
| 认证 | bcryptjs + jsonwebtoken + HttpOnly Cookie；密码强度校验（8–64 位、3 类以上字符、排除常见弱口令），单账号连续 5 次失败锁定 15 分钟，注册按 IP 限速（10 分钟内 5 次）；面向公网时由反向代理透传 HTTPS 自动给 Cookie 加 Secure 标记并可选开启 HSTS，CSP / X-Frame-Options / nosniff 等响应头默认注入 |
| 实时协作 | Yjs CRDT + `y-protocols` + WebSocket（`ws`），服务端文档去抖动写回磁盘；`data/yjs/` 持久化 Y.Doc 状态，避免重启/重连后内容翻倍 |
| 项目事件 | 独立 WebSocket 通道 `/events/<projectId>`，广播编译开始 / 结果 / 文件变更 |
| 编辑器 | CodeMirror 6（stex 语法）+ `y-codemirror.next` 协同绑定 |
| 编译 | 子进程调用 Tectonic / latexmk，解析日志输出结构化错误；源码指纹缓存去重 |
| 版本历史 | SQLite `versions` 表，内容去重 + 12 秒节流 + 每文件 40 个上限 |
| PDF 预览 | `pdfjs-dist` 6 渲染到 canvas；worker、CMap、标准字体全部本地化为 `/assets/` 静态资源，无 CDN；构建时给主线程与 worker 都注入浏览器兼容层（`Math.sumPrecise`、`Uint8Array.prototype.toHex/toBase64/fromBase64`、`Map.prototype.getOrInsertComputed`、`Promise.withResolvers/try` 等），并做完整性校验 |
| 前端构建 | esbuild（单文件 ESM bundle，无 CDN、可离线使用） |

协同的关键点：服务端为每个 `(项目, 文件)` 维护一个 `Y.Doc`，首次连接时从磁盘载入文本，收到更新后 700ms 去抖动写回文件并生成版本快照；编译前会强制 flush，保证编译的一定是最新内容；编译期间同一项目的任务会串行执行。编译结果不是只返回给发起请求的人，而是通过项目事件通道同步给所有在线成员。

---

## 七、安全说明

- 面向**本机 / 内网可信环境**设计，但已为**公网暴露**做了加固：密码强度校验（8–64 位、3 类以上字符、排除常见弱口令）、单账号连续 5 次失败锁定 15 分钟、注册按 IP 限速（10 分钟 5 次）、认证 Cookie 为 HttpOnly，经 HTTPS 反向代理时可自动加 `Secure` 并开启 HSTS。
- 默认注入 `Content-Security-Policy` / `X-Frame-Options: DENY` / `X-Content-Type-Options: nosniff` / `Referrer-Policy: same-origin` 等响应头，降低 XSS、点击劫持与信息泄露风险；公网部署务必放在 HTTPS 反向代理（Nginx / Caddy）之后，并在 `.env` 里设 `LATEXSTUDIO_SECURE_COOKIE=1`、`LATEXSTUDIO_HSTS=1`、`LATEXSTUDIO_TRUST_PROXY=loopback`。
- `/api/system/*`、所有项目接口、协作与事件 WebSocket 均需登录；未登录不会泄露本机编译器路径等信息。
- 待审批 / 已拒绝 / 已停用的账号拿不到会话，已登录的会话在下一次请求时也会失效（每次请求都重新校验账号状态）。
- `/api/admin/*` 全部要求 `role = admin`；管理员账号不能被停用或删除，避免把自己锁在门外。
- 管理员初始密码随机生成并写入 `data/admin-password.txt`（权限 0600），首次登录强制改密，改密后文件自动删除。
- 路径越界、非法文件名等输入错误统一返回 400，不会被误报为服务器 500。
- 如果确实需要公网访问，请放在反向代理（Nginx / Caddy）之后启用 HTTPS，并限制可注册用户（建议保持审批开启）。
- 编译超时默认 240 秒，每次上传单文件上限 30MB、最多 60 个文件。
- 编译子进程以当前 Node 进程权限运行，请勿以管理员身份长期运行。

---

## 八、常见问题

**Q：编译时一直显示「未检测到 LaTeX 编译器」？**
A：到「编译环境」页一键安装，或安装 TeX Live / MiKTeX 后重启服务。

**Q：第一次编译特别慢？**
A：Tectonic 在下载宏包与字体，属正常现象；之后会走本地缓存。

**Q：中文变成方框 / 日志里全是 Missing character？**
A：用 `ctexart` + `fontset=fandol`，不要用纯 `article` 写中文。

**Q：端口被占用？**
A：`PORT=3001 npm start`，或结束占用端口的进程。

**Q：PDF 预览里根号、希腊字母、负号、大括号不见了？**
A：PDF.js 6.5 在 worker 中用了较新的 `Math.sumPrecise`，部分浏览器（含 Chrome 145 及更早）没有实现，会让 TeX 的 Type1 数学字体加载失败。项目已给主线程与 worker 注入兼容补丁（`src/client/pdf-polyfill.js`、`scripts/build.mjs`），`npm run build` 后即可正常显示。中文模板另需 `cmaps/`，构建脚本同样会自动复制。

**Q：PDF 预览报「PDF 渲染失败：xxx is not a function」（如 `a.toHex`、`getOrInsertComputed`）？**
A：PDF.js 6.x 直接依赖了一批新提案 API：文档指纹用 `Uint8Array.prototype.toHex`，缓存与分组大量用 `Map.prototype.getOrInsertComputed`，此外还有 `fromBase64`、`Promise.withResolvers`、`Math.sumPrecise`、ES2023 数组方法等。Firefox / Safari 及较旧的内核普遍缺其中一两个，缺哪个就会在渲染到对应代码路径时报「xxx is not a function」，整份 PDF 打不开。

兼容层 `src/client/pdf-polyfill.js` 统一补齐这些 API：主线程在 `pdf-viewer.js` 里 import，构建脚本把同一份代码注入 worker 文件头部。`scripts/build.mjs` 还会在构建时做功能性校验——在沙箱里把这些 API 全部删掉、执行兼容层、再逐个检查是否补齐，缺了就**直接构建失败**并列出缺哪些，所以升级 `pdfjs-dist` 后不会又跑到线上才发现。改完执行 `npm run build`（或 `npm start`）即可。

**Q：注册后登录提示「账号正在等待管理员审批」？**
A：审批默认开启。用内置管理员（`admin@latex.studio`）登录后，右上角头像菜单 →「账号审批」，在里面「通过」即可；也可以在服务器上执行 `node scripts/admin.mjs approve <邮箱>`。想长期免审批，直接在「账号管理」页顶部打开**开放注册**开关即可（立即生效、无需重启）；开启时已有的待审批申请会自动放行。关闭开关后新注册重新需要审批，已有账号不受影响。

**Q：管理员密码忘了 / 错过了启动日志？**
A：初始密码写在 `data/admin-password.txt`。文件不存在（例如已改过密）就用 `node scripts/admin.mjs passwd admin@latex.studio 新密码` 重置；或者启动时设 `LATEXSTUDIO_ADMIN_PASSWORD=新密码`，每次启动都会按这个值重置。

**Q：要放到公网访问，登录会话安全怎么保证？**
A：本项目已内置账号锁定、注册限速、密码强度校验等防护；把服务放在 HTTPS 反向代理（Nginx / Caddy）之后，并在 `.env` 里设 `LATEXSTUDIO_SECURE_COOKIE=1`、`LATEXSTUDIO_HSTS=1`（站点是 HTTPS 才开）、`LATEXSTUDIO_TRUST_PROXY=loopback`（让后端正确识别来自代理的 HTTPS 与真实客户端 IP），认证 Cookie 会自动带上 `Secure` 标记。同时建议保持注册审批开启或设 `LATEXSTUDIO_DISABLE_DEMO=1` 关闭共享演示账号。

**Q：预览里的文字不能选中复制？**
A：预览是画布渲染，界面完全由应用控制、没有浏览器插件界面；需要可选中文本请点预览栏的下载按钮获取原始 PDF。

**Q：改了前端代码怎么生效？**
A：`npm run build` 重新打包（同时会复制 PDF.js 的 worker、CMap 与标准字体）；开发时可另开终端运行 `npm run dev` 进入 watch 模式，然后用 `npm run serve` 启动服务。

---

## 九、回归测试

检查服务器部署时，推荐先运行 `npm run build`，再运行 `npm run test:isolated`。后者启动独立端口的测试实例，使用临时数据目录和随机管理员密码，结束后清理；需要本机已安装可用 LaTeX 引擎。不要对生产实例直接运行完整回归，因为测试会临时切换注册审批设置。

服务启动后运行：

```bash
npm test
# 指定地址：BASE_URL=http://127.0.0.1:3000 npm test
```

`scripts/smoke-test.mjs` 是零额外依赖的端到端回归套件，覆盖 137 项：认证与鉴权、注册审批闭环（待审拦截 → 管理员通过 / 拒绝 → 放行）、管理员权限隔离、项目/文件 CRUD、路径穿越拦截、中文名上传、版本快照与恢复、强制编译与结果去重、WebSocket 编译广播、协同断线重连不重复内容、错误诊断、Option clash 诊断与一键修复闭环、拼接文档与误报过滤、unicode-math 粗体希腊字母诊断与修复、项目级编译引擎选择与校验、开放注册开关与账号管控、协作评论（源码选区/PDF 圈选/跨成员回复/权限）、账号隔离与成员权限、ZIP 往返、迁移场景导入（顶层目录剥离、主文件自动识别、子目录文件、导入时自动修复冲突）、非法 ZIP 与 GitHub 链接校验。测试会自建临时项目与账号并在结束时清理。

审批流程测试需要管理员凭据，按以下顺序自动获取：`ADMIN_PASSWORD` 环境变量 → `data/admin-password.txt` → 空。若管理员密码已自行修改，请这样跑：

```bash
ADMIN_PASSWORD='你的管理员密码' npm test
```

`scripts/admin.mjs` 是账号运维命令行，适合忘记密码或没有管理后台权限时救急：

```bash
node scripts/admin.mjs list                    # 列出账号与状态
node scripts/admin.mjs approve <邮箱>          # 通过审批
node scripts/admin.mjs passwd  <邮箱> [新密码] # 重置密码（管理员会写入 data/admin-password.txt）
node scripts/admin.mjs promote <邮箱>          # 设为管理员
node scripts/admin.mjs delete  <邮箱>          # 删除账号及其项目
```

`scripts/make-figure.mjs` 仅在需要重新生成模板示例插图时使用（依赖 `puppeteer-core` 与本机 Chrome），仓库已附带生成好的图片。

## 十、开发命令

```bash
npm install       # 安装依赖
npm run build     # 只构建前端
npm run serve     # 只启动服务（用已有 bundle）
npm run dev       # 监听前端源码变化并自动重新打包
npm start         # 构建 + 启动（推荐）
npm test          # 运行回归测试（需服务已启动）
npm run test:isolated # 启动临时服务并回归，不接触生产数据
npm run test:research # 隔离测试 AI 协议、权限、版本分支、转换和模板迁移
```

## 十一、ws4090l 部署检查（2026-11-12）

- 本地检出目录：`C:\Users\fanzi\Documents\ChatGPT\texstudio`；远端目录：`ws4090l:/home/fan/latexstudio`，应用监听 `0.0.0.0:3000`。
- 运行环境：远端 `.runtime/node22/bin/node`（v22.22.2），已检测到 latexmk、XeLaTeX、LuaLaTeX、pdfLaTeX、Tectonic。远端系统 Node 版本不适合直接替代该运行时。
- 使用原有 `./stop.sh` / `./run.sh` 管理服务，`server.pid` 记录进程，`server.log` 记录日志；当前没有发现应用的 systemd 用户服务或 crontab 开机启动配置。
- 检查前 SQLite 完整性为 `ok`，共有 6 个账号、4 个项目。完整回归在独立数据目录执行，137/137 通过；生产注册设置保持原样。
- 同步仅覆盖修复涉及的源码、构建后的 `app.js`、测试脚本和说明；保留远端 `.env`、`data/`、编译器、Linux 依赖和已有运维文件。重启前停止服务并生成 `~/latexstudio-backup-before-codex-*.tgz` 备份。
- 远端目录没有 `.git`，且有未被当前入口引用的旧微信登录模块；它们没有启用，也没有在此次同步中删除。旧 `deploy/README.md` 中的主机别名 `ws4090r` 与本次使用的 `ws4090l` 不一致。
- 当前应用使用 HTTP；虽然主机 443 端口有监听，访问 `https://127.0.0.1:443/` 未能完成 TLS 请求，尚未验证可用的 HTTPS 反向代理。此次未变更主机其他服务或网络配置。
- ZIP 导出依赖链的 5 项 moderate 告警已修复：升级 `archiver` 至 8，适配 `ZipArchive` API，并通过仅限 `archiver` 的 override 使用 `readdir-glob` 4（依赖已修补的 `minimatch` 11）。原先受影响的 `glob` / `archiver-utils` 依赖已移除；`npm audit` 为 0 项漏洞。override 在上游直接支持该版本后可移除。尚未逐一验证全部会议模板、浏览器组合和公网访问路径。

## 十二、v0.2 研究工作台

### 论文助手与模型 API

编辑器顶部点「助手」。默认只在本地检查缺失的引用键、未引用的 BibTeX 条目、图注/标签/正文引用与位图清晰度线索，支持编辑后自动检查；不需要 API Key，也不向外部发送论文。

管理员可从头像菜单或助手的「API 配置」填写 **OpenAI 兼容 Base URL、模型名、API Key**，保存后测试连接。Base URL 以 `/v1` 结尾，或填写完整 `/chat/completions` 地址；视觉模型需勾选「支持图片输入」。密钥以 AES-GCM 加密存入数据库，不回显给浏览器；更换 API 地址时需要重新填写密钥。密钥解密依赖原有 `data/secret.key`（或配置的会话密钥），备份时务必一起保留。配置密钥请使用 HTTPS 或 SSH 隧道访问管理界面。

请求格式参考 [OpenAI Chat Completions 文档](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)，不绑定某家服务商或特定模型。生产环境默认仅连接公网 HTTPS API；若明确使用本地模型，管理员可设置 `LATEXSTUDIO_AI_ALLOW_LOCAL=1` 后重启。测试脚本仅在临时实例中开启此项，以运行模拟模型服务。

- 「AI 检查」预览并发送当前段落或源码选区，返回语言、论证、引用及图文一致性建议。PDF 工具栏圈选区域后，在弹窗里输入问题并选择「交给论文助手」，再发起审阅。
- 圈选时会提取区域文字；手动明确勾选时才发送圈选截图或最多 2 张项目 PNG/JPEG 插图。没有图像输入时不会假称已经检查图像。扫描 PDF 或纯图形区域需要视觉模型或手工补充问题上下文。
- 每条建议展示文件位置、原文、替换预览和说明，可点击定位、接受或拒绝。可精确定位的补丁才会显示「接受并应用」；来源文件变化后拒绝覆盖。应用前后都保留项目版本。无法安全自动修改的意见需要作者手动落实。
- 自动 AI 建议需要本次会话明确开启，默认关闭；会发送稿件并可能产生服务商费用，模型意见不会自动写入正文。
- 「查找文献」由作者填写关键词，向 Crossref 检索真实元数据并提供 DOI 链接，不由模型编造书目。候选不等于已确认相关文献，仍需核对原文、补充 BibTeX 和正文引用。

模型审阅只发送有界片段：手动最多 6000 字符、自动最多 2200 字符；视觉输入有数量/体积限制。模型质量、价格和可用性由配置的服务商决定。本次已用模拟服务测试协议、图片输入、密钥保护、异常响应和补丁闭环；真实模型效果需填写实际 Key 后验证。Crossref 已用公开测试关键词实测返回记录。

### 共享与讨论

共享弹窗可邀请或调整三类成员：**编辑者**可改稿，**审阅者**可评论和提出建议，**只读成员**仅浏览。REST 和协作 WebSocket 均执行权限检查；角色变化立即撤销旧连接。链接本身不授予访问权。

评论支持指派处理人、优先级、与我有关/已解决筛选、全文搜索、编辑与逐条回复；回复可引用某一条回复，作者或所有者可修改/删除。`@成员邮箱`、指派和参与讨论的新回复会进入「讨论通知」。在线更新会保留正在输入的回复草稿；编辑评论带版本检查，避免覆盖其他成员的修改。PDF 定位会高亮准确的评论区域。

### 跨项目搜索与派生稿件

项目列表顶部「全文搜索」，或编辑器「⋯ → 跨项目全文搜索」，可查有权访问的项目名称、LaTeX、BibTeX、评论与回复，点击定位到项目文件行或讨论线程。首版采用有界扫描，最多展示 80 个结果；大型项目会提示缩小范围。

编辑器「⋯ → 生成 Slides / Poster」从全稿分块与插图生成 LaTeX Beamer slides 或 A0 学术 poster，先选风格与版式，整理可预览、可编辑的持久提纲；用户确认保存的提纲后再新建独立项目并记录来源版本，原论文保留。无 API 时使用本地节选；有 API 时可选择逐块摘要、分层汇总。详见第十五节。

### 项目历史、分支与转投

侧栏底部「分支」打开完整项目历史：可命名检查点、浏览父子分支图、查看逐文件增删和文本差异、创建/切换分支、恢复版本。项目版本包含源码、素材、主文件和编译器设置，使用 SQLite 元数据与内容寻址文件存储；逐文件版本历史仍可使用。

- 编辑后的项目级快照约 20 秒节流；新建/导入、应用建议、切换版本和重要文件操作会额外留档。图中首批展示最近 500 个版本，数据库不主动删除更早的项目检查点。
- 三方合并以共同祖先比较文件；互不冲突的文件自动合并，冲突逐项选择保留当前或采用来源。预览过期会拒绝执行，不静默覆盖；合并节点保存两个父版本。
- 「⋯ → 转投 · 换模板」上传新模板 ZIP，先保留旧稿，再创建投稿分支并迁移正文和模板辅助文件。有 API 可选择 AI 适配；不同出版商的宏命令、作者格式、参考文献和版面仍需编译核对。旧分支随时可切回。
- 换分支或恢复项目时会切换协作代次并重新加载在线客户端，旧客户端不能把历史 CRDT 内容写回新分支。编译进行中会拒绝切换，请稍后重试。

快照不包含编译中间产物；单项目上限 4000 个文件、120 MB、单文件 30 MB，存储目录为 `data/revision-blobs/`，需要与数据库一起备份。Slides / Poster 已移除旧 12 万字符门槛，自动拆分支持最多 400 万字符展开稿件；AI 换模板仍限原稿 8 万字符、模板 4 万字符。首版没有自动清理快照或对象，长期使用应关注磁盘占用。

品牌已从 LaTeXStudio 改为 **underoot**（根号图标）。为兼容已部署实例，环境变量 `LATEXSTUDIO_*`、既有账号邮箱、会话 Cookie 和数据目录结构继续兼容；现有论文项目名称不做批量修改。本机当前工作目录和服务器运维目录仍沿用上一节所列路径，新的 GitHub 克隆目录默认是 `underoot/`。

## 十三、插件平台与开发标准

underoot 把身份、项目权限、编辑协作、讨论、项目版本、密钥托管与修改建议的接受机制保留为核心。研究能力通过命令贡献和受控 API 扩展，方便实验、分享与本地部署。目前有六个可独立启停的内置插件：

| 插件 | 提供的功能 | 实现位置 |
| --- | --- | --- |
| `underoot.assistant` | 论文检查、模型审阅、PDF 选区和文献候选 | `extensions/builtin/underoot.assistant/` |
| `underoot.discovery` | 跨项目正文、文献和讨论搜索 | `extensions/builtin/underoot.discovery/` |
| `underoot.publishing` | Slides、Poster、转投换模板 | `extensions/builtin/underoot.publishing/` |
| `underoot.markdown` | Markdown 实时预览与 TeX 互转 | `extensions/builtin/underoot.markdown/` |
| `underoot.templates` | 个人模板库与 PDF 风格提取 | `extensions/builtin/underoot.templates/` |
| `underoot.vim` | Vim 编辑模式 | `extensions/builtin/underoot.vim/` |

内置插件由应用源码可信分发；停用后相应后端接口也被禁用。它们的 `activate.mjs` 在命令注册表贡献入口，不再由菜单写死功能列表。第三方扩展使用另一种受限的 **iframe 运行时**，以 ZIP 安装，不执行服务器端代码。

### 使用与分享

项目列表顶部「插件」或编辑器侧栏的网格按钮可打开插件中心；「工具箱」/「⋯」展示已启用插件贡献的命令。

1. 管理员上传插件 ZIP，点「检查清单和权限」。
2. 核对名称、版本、来源和权限，再点「确认这些权限并安装」。检查与安装绑定同一包指纹。
3. 普通成员可运行已启用插件。插件窗口可拖动和缩放，不阻挡继续选择正文。
4. 下载已安装的 ZIP 即可分享给其他 underoot 实例；每个实例的管理员自行审核安装。升级须换版本号并重新确认权限。

插件中心提供两个可下载示例：**选区研究笔记**（离线读取选区、个人笔记、提出拼写建议）和 **论证强度审阅**（通过宿主模型分析选区，并提交待审阅建议）。源码在 [`examples/plugins/`](examples/plugins/)。

### 开发者标准与 skill

- [underoot 插件开发 skill](skills/underoot-plugin-dev/SKILL.md)：供开发者和编码助手使用，包含可复制的 starter。
- [Extension API v1 合同与示例](skills/underoot-plugin-dev/references/plugin-api.md)：清单、权限、SDK 方法、限制、生命周期和打包规范。
- [JSON Schema](extensions/plugin.schema.json)：用于编辑器清单提示；安装以服务器 validator 为准。
- 打包：`node scripts/pack-extension.mjs <发布目录> --check`；通过后用 `--out <插件.zip>` 生成安装包。

HTML 加载 `/extensions/sdk.js` 后，可用 `underoot.getSelection()`、`getProject()`、`getPdfSelection()`、`complete()`、`propose()`、评论 API 和按用户隔离的 `storage`。插件拿不到模型密钥；模型调用由作者逐次确认。建议通过核心建议中心审阅后才写稿；v0.3 的文档编辑插件也可声明 `documents.write`，经作者逐次确认后保存，受版本和内容冲突保护。未声明的能力、跨项目越权和已停用插件的调用都会被拒绝。

第三方运行时没有 Node/Python、shell、宿主 DOM、Cookie、CDN 或直接网络访问；请先把前端依赖构建进发布目录。ZIP 上限为 10 MB、200 条目，解压总量 15 MB，禁止路径穿越、隐藏凭据目录和符号链接。插件源代码作为应用资源分发，勿把密钥或私有数据放进 ZIP；安装前仍需审查来源。本版不兼容 VS Code 扩展格式，尚未实现商店、签名、自动更新或任意服务器插件执行。

完整平台回归使用临时数据目录和模拟模型，含 ZIP 检查/安装/运行、权限拒绝、插件启停、用户存储隔离、建议接受和卸载保留研究记录。另在实际浏览器验证了 ZIP 插件的隔离窗口、SDK 读取选区及提交建议。

2026-11-12 验证：服务器研究/插件测试 **130/130**、原有回归 **137/137**；Windows 本地研究/插件测试 **128/128**（Linux 额外包含两项真实 TeX 编译）。skill 与示例包也通过各自校验。模型协议使用模拟服务测试，真实模型质量仍需管理员配置 API 后评估。

## 十四、v0.3 Git 同步、本地 WASM 与 Markdown 插件

### GitHub / GitLab 项目版本同步

在项目左侧「更多 → GitHub / GitLab 版本同步」填写自己的 HTTPS 仓库地址、分支和 Token，保存后先预览变化，再填写提交说明、确认提交。GitHub 细粒度 Token 需要仓库 Contents 读写权限；GitLab PAT 需要 `api` 权限及仓库写入身份。创建仓库、Token、邀请成员等仍在服务商页面完成；underoot 不使用应用服务器自身的 GitHub 登录凭据代替用户授权。

凭据按「用户 + 项目」隔离，以 AES-GCM 加密且不回显；更换仓库或分支会清除旧凭据。只允许项目所有者和编辑者操作。支持 GitHub.com、GitLab.com 和公网 HTTPS 自建 GitLab；内网/HTTP GitLab 需管理员明确设置 `UNDEROOT_GIT_ALLOW_LOCAL=1`，与模型的内网开关独立。网络层固定已校验 DNS、不跟随重定向。

推送包含源码和素材，不含生成的主 PDF、编译中间产物、应用数据库或 `.env`。远端其他文件保留；仅删除之前由此连接同步且现已在本地删除的文件。首次上传替换同名文件会在预览标明。预览摘要和远端提交检查防止过期提交；GitHub 使用非强制 ref 更新，GitLab 更新/删除携带文件最后提交 ID。远端改过的论文文件会阻止推送，需要先人工合并，不提供强制覆盖、自动拉取或远端分支创建。非空仓库请先创建所选分支；空仓库可初始化（GitHub 首次通常分为初始化文件和批量文件两个提交，网络中断后重新预览续传）。

每次提交前保留 underoot 检查点。上限为 500 个本地文件、20 MB、单文件 5 MB；每次最多 100 个文件变化。Git API 实现参考 [GitHub Git Trees / Refs](https://docs.github.com/en/rest/git/trees)、[GitLab 多文件提交 API](https://docs.gitlab.com/api/commits/)。

### 浏览器本地 WASM 编译

顶部项目编译器选择「本地 WASM · pdfLaTeX（基础宏包）」。引擎在 Web Worker 中运行，源码停笔约 650 ms 后自动重新编译并刷新 PDF；复用引擎，执行两遍以更新引用，可下载实际 PDF。项目文件从当前实例载入，正在编辑的源文档直接覆盖浏览器内存中的对应文件，无需等待协同落盘；本地 PDF 不上传、不替换服务器 PDF，也不广播给其他协作者。

引擎、匹配的格式、基础宏包和字体均随项目分发，不调用外部编译服务或 SwiftLaTeX 资源网站。支持基础 article、数学、多文件和基本图形；10 MB / 500 文件上限。此基础包使用兼容的旧版 pdfTeX/LaTeX，并不等同于完整 TeX Live：现代会议模板、中文系统字体、XeTeX/LuaTeX 和额外宏包请选择原有服务器引擎。一次编译超过 45 秒会终止 Worker，避免页面卡死。浏览器需支持 WebAssembly，反向代理 CSP 应允许 `'wasm-unsafe-eval'`。第三方来源、源代码与许可证见 [`public/wasm/NOTICE.md`](public/wasm/NOTICE.md)。

v0.5 补齐 `geometry`、`amsthm`、`booktabs`、`enumitem`、`caption`、`natbib`、`hyperref` 等常用论文宏包及依赖、图形驱动配置和 EC/CM-Super 字体。宏包从本站按需加载，不必把整个发行包下载到浏览器。失败时直接展示首个 TeX 错误、缺失文件和行号，可点击「切换服务器编译」；不会自动改变引擎或改写稿件。

### Markdown 研究写作插件

在「更多 → Markdown 编辑与 TeX 互转」打开内置隔离插件。支持新建/打开 `.md`、`.markdown`、`.tex`，Markdown 左侧源码、右侧实时渲染；包含标题、列表、表格、代码与 KaTeX 数学。写作草稿留在插件中，点「保存到项目」并确认后写入；保存检查原文件 SHA-256，协作者已修改时拒绝覆盖，并保留快照与协同同步。外部图片和原始 HTML 受限制，避免预览泄露未发表内容。

一键双向转换使用本地 [Pandoc](https://pandoc.org/MANUAL.html)，不是模型调用；结果另存为 `*.converted.tex` / `*.converted.md`，已有同名文件会拒绝覆盖。Pandoc 以沙箱运行，不允许读取服务器任意文件。TeX 输出采用完整 Pandoc 模板、`ctexart`，可用服务器 XeLaTeX 编译。复杂自定义宏、模板布局和某些表格无法无损互转，需核对转换结果。单文档限 150 KB。

首次部署运行 `node scripts/install-pandoc.mjs`，从官方发布下载固定 3.13 版、核验 SHA-256，安装到 `bin/`；也可将兼容 Pandoc 放入 PATH。普通构建不自动安装系统程序。插件 UI 由 `npm run build` 打包；便携版 `research.markdown` 可在插件中心下载 ZIP，或运行 `node scripts/pack-extension.mjs examples/plugins/markdown --out markdown.zip`。新增 `documents.read`、`documents.write`、`documents.convert` 权限及 SDK 标准已写入插件开发 skill。

验证命令：`npm run test:git`（独立临时数据库、两家服务 API 协议模拟）、`npm run test:wasm`（执行实际 WASM 生成 PDF）、`npm run test:platform`（隔离服务、文档/权限/转换/浏览器资源）、`npm run test:isolated`、`npm run test:research`。所有测试均不使用生产数据库；没有替用户创建 Token 或推送私人论文。

v0.3 验证结果：ws4090l 基础回归 141/141、研究工作流 130/130、Git 协议 46/46、新功能集成 36/36（含中文表格 TeX 实际编译）、真实 WASM 3/3，共 356 项通过；npm audit 为 0 项漏洞。在实际浏览器中另验证了 WASM PDF、Markdown 源码即时渲染、公式和表格、转换另存及 Git 配置入口。


## 十五、长论文自动拆分与风格确认（v0.3.1）

从「更多 → 生成 LaTeX Slides / 生成学术 Poster」进入。界面先展示展开字符数、源码数、章节组和分块范围；选择风格、画幅/方向、栏数与目标篇幅，点击「AI 整理可编辑提纲」（无 API 时为本地整理），编辑标题、结论、要点、插图、顺序与四种内容布局，保存后点击「确认此提纲并生成」。Slides 和 Poster 各有八种内置风格及个人模板扩展（见第十六节）；Slides 支持 16:9 / 4:3，Poster 支持 A0 横竖版和两/三栏。

自动流程递归展开 `input/include`，按章节、段落和行分成最多 16,000 字符的块。超长环境可作为标注续段的传输片段，不会改写原 TeX 文件。已移除旧 12 万字符拒绝、AI 前 8 万字符和规则前 16 章截取；每个分块都会处理。AI 模式逐块摘要，按最多八份摘要一组递归汇总，最终章节必须覆盖全部来源 ID，遗漏会停止并报错。默认本地节选不调用模型；勾选 AI 后显示预计最大调用次数，确认才发送，事实与引用仍需作者核对。

生成使用确认时的不可变源版本，新建独立项目，原稿可继续编辑。新项目中的 `underoot-publishing/<id>/plan.json` 保存所选设置、来源版本、连续分块范围、全部摘要和最终章节来源；`notes.md` 便于审阅各块处理记录。目标页数不含封面和独立插图，Beamer 自动分页可能增加实际页数；本地节选不是学术摘要，复杂公式仍需对照原稿调整。

界面可查看进度、停止任务，关闭窗口后任务继续，同一标签页重新打开可恢复查看。每个用户/项目仅一个活动任务，实例最多两个；超时 20 分钟会取消，单次模型请求限 60 秒，不自动重试付费调用。任务状态在内存中，服务重启会中断活动任务，需重新明确发起。展开稿资源上限为 400 万字符、引用深度 40、源码数约 1000，单文件 8 MB；超出资源预算仍会明确停止，原稿保留。

[underoot-paper-publishing skill](skills/underoot-paper-publishing/SKILL.md) 与应用共用同一拆分实现。安装至 `~/.codex/skills/underoot-paper-publishing` 后可由编码助手发现；独立规划命令：

```bash
node skills/underoot-paper-publishing/scripts/chunk-paper.mjs --root <论文目录> --main main.tex --out plan.json
npm run test:publishing
```

CLI 的 `plan.json` 含完整源文分块，请作为论文私有数据保管。测试使用合成长稿和模拟模型，覆盖完整分块、长环境、Unicode、循环/越界、预算、取消、并行编辑、权限与六种风格真实编译；不会将现有生产论文发往模型。

## 十六、轻量 AI 建议、模板扩展与 Vim

编辑器按 `Alt+K` 打开当前段落的修改要求，先查看将发送的片段，再明确发送。建议在源码旁显示原文/替换预览，`Alt+Enter` 接受，`Esc` 关闭；来源变动会拒绝过期修改。助手保留全部建议与接受/忽略入口。默认只运行免费的本地检查。

自动 AI 本会话默认关闭；开启后只响应本人的实际输入，至少修改 40 字符并停笔 45 秒才尝试。每次最多 2200 字符、2 条建议、550 输出 token，不附带图片或其他文件。手动最多 6000 字符、5 条建议、1200 输出 token。相同模型/指令/片段结果缓存 30 分钟，可跨偏移复用且不会恢复已拒绝的建议；自动间隔至少 90 秒，每用户 10 分钟最多自动 3 次，手动与自动合计 6 次、36000 稿件字符。预算/缓存存于内存，重启会清空；这是请求预算，不是服务商账单上限。自动调用错误会暂停，不自动重试。界面仅在服务商返回 `usage` 时显示实际 token。

管理员可选输出限额字段 `max_completion_tokens`（默认）或 `max_tokens`（旧兼容服务）；不以付费重试猜测协议。字段含义见 [OpenAI Chat Completions 官方接口](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。

Slides 和 Poster 各有 8 种内置风格，生成前在卡片界面确认画幅、栏数与篇幅。Slides 包括学术报告、极简研究、重点聚焦、导航答辩、会议讲演、清爽组会、经典讲义、大标题叙事；Poster 包括经典、现代、紧凑、醒目横幅、图像优先、编辑风格、深色、蓝图。

「更多 → Slides / Poster 模板库 · PDF 提取」可上传 ≤20 MB PDF。服务器用 Poppler 本地分析前三页的配色、字体层级、画幅与布局，显示第一页预览，可调整后确认保存个人模板；不调用模型，不保存原 PDF，不复制 Logo/图像，也无法无损恢复原始 TeX。每用户最多 40 个，支持导出/导入安全风格 JSON。Linux 安装 `poppler-utils`；Windows 安装 Poppler 后加入 PATH 或设置 `UNDEROOT_POPPLER_BIN`。缺少工具时会明确提示。

第三方模板插件使用 `publishing.templates.read/write/extract` 与 SDK `templates.list/register/extractPdf`。宿主管理 PDF 选择和确认，沙箱仅接收安全风格字段。插件中心提供模板包 ZIP 示例；规范见 [`underoot-plugin-dev`](skills/underoot-plugin-dev/SKILL.md)。

「更多 → Vim 编辑模式」或底部 VIM 开关启用 Normal / Insert / Visual 模式；支持 `:w` 编译保存，`u` / `Ctrl+r` 使用协作编辑的撤销/重做。默认关闭，按用户在本机记忆；只读成员不可编辑。管理员可在插件中心独立停用 Vim。

## 十七、中文与会议模板的本地 WASM 编译（v0.6）

选择「本地 WASM · 自动（中文 / 会议）」：TeX Live 2026 根据正文和宏包自动选择 pdfLaTeX 或 XeLaTeX，也可显式选择「本地 WASM · XeLaTeX」。中文注释不影响引擎选择。支持 `ctex` / `xeCJK` 配合 Fandol 等开放字体；浏览器不能直接使用服务器或操作系统里的私有字体，指定 SimSun 等未分发字体时需上传获准使用的字体文件或改用 Fandol。

缺失宏包与字体会通过当前实例，向固定 HTTPS TeX Live 2026 资源服务按名称获取。正文、图片、API Key 不发送给资源服务；网络请求会包含资源文件名。首次加载基础引擎约 128 MB，构建时自动下载固定版本并逐项校验 SHA-256，浏览器缓存复用。后续缺失文件按需下载，实例持久缓存在 `data/wasm-cache/tl2026-46ebb621/`（默认 512 MB、单文件 32 MB、最多 4000 条，按近期使用淘汰），同时使用浏览器 HTTP 缓存；不要求一次下载完整 TeX Live。网络失败不会永久记录为文件不存在，恢复网络后可重新编译。UI 显示下载阶段并支持停止；单次编译最多 6 分钟。

`UNDEROOT_WASM_DOWNLOADS=0` 可关闭在线取包，已缓存资源仍可用。首次构建需能连接 GitHub，首次使用未缓存宏包需能连接资源服务；完整离线部署应预先构建和编译需要的模板以预热缓存。断网后只有所需资源齐全时才能编译。BibTeX、索引和交叉引用由浏览器流水线处理；本版不提供 Biber 模块、任意系统字体、外部绘图程序或 shell escape，使用这些功能的论文仍需适当调整或选择服务器编译。

实现基于独立 Worker 中的 [TeXlyre-BusyTeX](https://github.com/TeXlyre/texlyre-busytex-build/tree/46ebb6216a5c1fe63dd1dc885831d1a8cef2dc86)，许可证及源代码链接见 [`public/wasm/NOTICE.md`](public/wasm/NOTICE.md)。验证命令：`npm run test:wasm:modern`；实际执行 WASM 二进制，不以服务器原生 TeX 代替浏览器引擎。

## 十八、从论文到研究叙事与版面（v0.7）

生成器和 `underoot-paper-publishing` skill 共用内容整理、模板与版面处理代码。每次生成记录五步预检：来源与证据盘点、研究叙事、图文/公式/表格关联、信息密度与栏位、事实与交付复核。AI 模式从完整分块证据重新组织主张标题、短要点和适当的研究边界；五步预检不会强制增加五次付费调用。本地模式明确是结构化草稿，按主题重排和去重，不能代替完整语义改写。

Slides 使用研究问题→差距→方法→结果→局限→结论的讲述顺序，限制单页要点密度；插图与对应来源主题邻接，简单数值表格生成可编辑的证据页，保守支持可独立移植的原稿公式。Poster 使用保持阅读顺序的连续平衡栏位、结果视觉和自适应可读字号。复杂表格、自定义公式、同名图片歧义和原值不匹配的数字明确列为待核对项；显示层不够时保留详细笔记，不把所有来源 ID 都显示为“所有科学内容完整呈现”。

主机有 XeLaTeX 时，生成过程中实际编译并用 Poppler 检查页数、文字越界和 TeX 溢出；海报问题可在 ≥32 pt 正文下修订一次再检查。缺少工具或仍有问题会明确报告，不记为视觉检查完成。生成后再次打开 Slides / Poster 工具即可在原项目中继续对话调整，每条局部建议先预览，再接受或拒绝；不会重复创建整个项目。仅发送所选块、最多三个来源摘要与最近两轮讨论，不重新发送全文。手工改动与并发编辑有冲突保护，接受后应重新编译。新版提纲和讨论持久保存在 SQLite；原有输出项目仍可编辑 TeX，项目的 `underoot-publishing/<id>/` 包含 `outline.md`、完整 `notes.md`、`plan.json` 和 `review.json`，原始项目与素材保留。科学结论与最终图像仍需人工审阅。

Skill 可独立于应用数据库运行：[`SKILL.md`](skills/underoot-paper-publishing/SKILL.md)。`build-publication.mjs` 支持新目录输出、人工/模型审阅后的结构化提纲、实际编译、PDF 审计与渲染；`audit-publication.py` 测量真实 PDF，另行记录尚未进行的视觉检查。CLI 默认输出本地草稿；高质量叙事请先按 skill 的五轮标准审阅并提供 `--outline`。

本次五轮实际迭代、失败发现与修订记录见 [`docs/publishing-five-rounds.md`](docs/publishing-five-rounds.md)。回归使用合成论文和模拟模型；真实模型的学术表达质量仍取决于配置的服务与作者复核。

真实会议案例、提纲确认与局部修订的具体取舍见 [会议参考记录](skills/underoot-paper-publishing/references/conference-casebook.md) 与 [实现及验证记录](docs/publishing-five-rounds.md)。


### 0.9：自动排版与海报署名

提纲工作台顶部可核对全部作者、单位编号和联系方式，选择/上传最多六个单位图标，填写 GitHub/GitLab/项目 HTTPS 链接后在本地生成二维码，也可只保留二维码区域。作者和单位在整张海报上居中，并采用更大的标题区字号。

生成时进行多轮真实编译、空间测量和调整，尝试自然的图文尺寸、连续分栏、底部通栏结论与模块内部间距，使模块边框填满版心。新报告分别显示自然内容占用与边框覆盖；排版不额外调用模型。缺少 XeLaTeX 时明确报告未执行真实测量。

v0.8 已生成且保留提纲的项目可再次打开工具，点击「保存署名并自动重排当前项目」，保留项目 ID 和历史。系统在隔离副本试排；发现手工修改或并发冲突时保留现有 TeX。更早没有持久提纲的输出仍可手动编辑。单位图标不会被自动下载或臆造。

验证命令：`npm run test:publishing:fit`（纯逻辑与二维码）；`npm run test:publishing:studio`（隔离 API）；`npm run test:publishing:layout`（需要 XeLaTeX/Poppler，输出到系统临时 QA 目录）。


### 0.9.1：完整作者提取与独立叙事

自动读取完整标题区（包括 ACM 在 `\begin{document}` 后声明的作者/单位），支持 ICML 双参数作者列表、IEEE 作者块、NeurIPS 行内单位和有界的无参数文字宏；相同单位去重并保留作者对应编号。旧提纲缺失的作者信息也会从其已保存的原稿补全，明确保存的用户署名保持不变。

Poster 和 Slides 面向独立阅读，采用描述性、无编号的图注，不沿用论文的 Figure/Section 编号或 `fig:...` 标记，也不指向没有展示的图片。AI 提纲与局部修改采用同一规则，确定性检查会将可安全改写的句子改为直接结论；只有导航意义或无法安全改写的句子保留在来源笔记，并在提纲中提示核对。无需增加模型调用。已有 v0.8/v0.9 提纲项目可使用「保存署名并自动重排当前项目」应用修复；手工修改冲突保护与原稿、历史保留不变。


### 0.9.2：Poster 编译与密集版面修复

latexmk 根据主文件标题区的 CTeX/fontspec 声明自动使用 XeLaTeX，普通 article 继续使用 pdfLaTeX；显式选择不兼容的 pdfLaTeX 会提示如何调整。密集海报保持至少 32 pt 正文，通过缩减过大的行距并实际复编译，避免两页输出。排版候选按实际溢出程度选择，最多八轮本地试排；已知编译失败或排版不合格的结果保留提纲，不发布为完成项目。


### 0.10：一键生成、聊天打磨与独立生成 skills

从「更多 → 生成 LaTeX Slides / 生成学术 Poster」直接开始，使用默认风格整理内部提纲、选取核心图表并编译，不再要求填写提纲确认表。配置模型时显示全稿发送与调用预算；无模型时明确标记为本地结构化草稿。原论文保留。失败的内部草稿也可通过聊天继续修改，再发送「继续生成」。

生成后打开「继续调整 Slides / Poster」，直接说「第 3 页改成流程图」「把实验结果表加入结果页」「撤销上次修改」「重新排版」。修改在同一项目内应用，保留其他页面、版本历史与并发保护。作者、单位、联系方式、项目链接可以用「作者：…」「单位：…」「项目链接：https://…」修改；图标通过聊天附件上传；「风格：minimal」等命令切换风格。旧版项目先在聊天中发送「重新排版」升级；检测到手工编辑冲突时保留现有内容。

Slides 不以填满页面为目标。标题、正文、图注、表格/流程图各使用统一层级；遇到溢出优先拆页、必要时整套统一调整正文大小。主报告突出原方法图和核心实验比较，宽表按指标/行拆开，完整比较放入补充页。流程图使用有来源的结构化 TikZ 矢量节点与连线。Poster 则优先安排核心方法/结果图、数值对比、完整署名和整张画布的阅读顺序。选行保留本文方法与基线，并在记录中披露未展示的指标/行。

独立技能：[`underoot-paper-slides`](skills/underoot-paper-slides/SKILL.md) 与 [`underoot-paper-poster`](skills/underoot-paper-poster/SKILL.md)，分别附真实会议样例、五轮审阅标准和可独立运行的 CLI。共享脚本修改后运行 `node scripts/sync-publishing-skills.mjs` 同步两套技能包。对照、修订与实际验证见 [0.10 迭代记录](docs/publishing-v010-review.md)。

### 0.10.1：使用成熟主题原生样式

Slides 默认采用 [Metropolis](https://ctan.org/pkg/beamertheme-metropolis)，保留主题原生字体、标题页、配色和间距，不再手动设置 22/16/12/10 pt。其他内置 Beamer 主题也保留原样。旧项目在聊天中输入 `风格：metropolis` 切换；仅输入 `重新排版` 时保留原先选择的主题。自动排版优先拆页，不通过改字号填满页面。Poster 的单页测量、完整署名和版本保护继续保留。

服务器需要 TeX Live 包 `beamertheme-metropolis`、`fira`、`pgfopts`（例如 `tlmgr install beamertheme-metropolis fira pgfopts`）。Linux 上还需让 fontconfig 能发现 Fira 的 OpenType 字体（安装到用户字体目录后运行 `fc-cache -f`）。使用 XeLaTeX 支持中文；缺少主题时会保留项目并报告编译错误，不静默换用其他样式。

原生主题集成与验证记录：[0.10.1 review](docs/publishing-v0101-native-theme.md)。

图表页会自动附上对应原文的简短发现/结论，优先用正文中明确讨论该图表的语句；AI 在原有叙事调用中压缩，保留条件和来源，不根据图片臆测趋势。旧 Slides 可在聊天中输入 `补充图表结论`，仅填充能从保存原稿可靠抽取、且尚未写有结论的页面；不重新生成整个项目。原稿没有可靠短句时保留空缺，不捏造结果。

### 0.10.2：可见的生成进度与明确失败状态

Slides / Poster 一键生成后显示准备、阅读全文、整理叙事、编译排版、保存五个真实阶段，阅读分块进度、模型请求次数、当前步骤和总耗时。长时间没有新模型调用可能是在编译，界面会显示服务连接和阶段状态，不显示编造的剩余时间。

关闭窗口后右下角保留任务入口；刷新后再次点击生成会查询同一用户在项目中的已有任务，不重复生成。网络请求超时会提示连接中断并自动重查，不把断线当作失败，也不自动重跑 AI。服务重启导致任务记录失效时会明确提示。任务记录仍是进程内状态，重启后需主动重试；已校验的分块摘要仍可从私有缓存复用。

分块摘要建议 1800 字符以内，实际不超过 3000 字符即接受。摘要过长、JSON/字段格式错误会把具体问题与完整原始输入反馈给模型重写；同一步最多两轮修正，全任务最多三次额外修正，均包含在确认的调用上限内。连续修正仍失败才显示终态，原稿不截断。已验证的分块摘要存入按用户、项目、源稿与模型隔离的私有缓存，主动重试会复用，避免重复读取。

原文单块上限由 16000 提高到 20000 字符，尽量将同一节的小子节合在一起；保留所有子标题、原始区间与正文，主要 section/chapter 边界保留。长摘要按实际长度分组汇总，单次汇总输入限制在 20000 字符、最终叙事输入限制在 24000 字符；不会简单把超长摘要拼到一起。显示的调用次数为保守上限，实际会因合并、去重与摘要长度而减少。较长模型响应的单次等待上限为两分钟，期间显示心跳与耗时。
