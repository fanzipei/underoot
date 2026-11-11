# LaTeXStudio

一个可以**完全本地部署**的在线 LaTeX 工作台：用户管理、项目管理、文件上传、多人实时协作编辑、服务端编译与 PDF 预览、协作评论（含 PDF 圈选评论）。数据全部保存在本机 `data/` 目录，不依赖任何外部服务。

> 当前版本：**v0.1**（首个可运行版本，私有仓库）

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
cd latexstudio
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
LaTeXStudio 已启动
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
- **每个项目可单独选编译引擎**：编辑器「⋯ → 编译引擎」，可选自动或任一已安装引擎；设置持久化到项目，换引擎自动重编（编译缓存按引擎隔离）。系统会自动发现装在用户目录的 TeX Live（无需 sudo）。
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

服务启动后运行：

```bash
npm test
# 指定地址：BASE_URL=http://127.0.0.1:3000 npm test
```

`scripts/smoke-test.mjs` 是零额外依赖的端到端回归套件，覆盖 124 项：认证与鉴权、注册审批闭环（待审拦截 → 管理员通过 / 拒绝 → 放行）、管理员权限隔离、项目/文件 CRUD、路径穿越拦截、中文名上传、版本快照与恢复、强制编译与结果去重、WebSocket 编译广播、协同断线重连不重复内容、错误诊断、Option clash 诊断与一键修复闭环、拼接文档与误报过滤、unicode-math 粗体希腊字母诊断与修复、项目级编译引擎选择与校验、开放注册开关与账号管控、协作评论（源码选区/PDF 圈选/跨成员回复/权限）、账号隔离与成员权限、ZIP 往返、迁移场景导入（顶层目录剥离、主文件自动识别、子目录文件、导入时自动修复冲突）、非法 ZIP 与 GitHub 链接校验。测试会自建临时项目与账号并在结束时清理。

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
```
