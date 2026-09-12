# Quest-log 项目结构文档

> 用途：当 AI 上下文为空白（换窗口/新会话）时，先读本文件即可快速理解项目架构，避免误改。
> 最后更新：2026-09-02

## 1. 项目概览

Quest-log 是个人任务管理工具（游戏化风格，参考《明日方舟》）。用户记录任务（tasks）、资源（resources）、经验、成就，支持按类型筛选、移动端访问（cpolar 远程隧道）、视频壁纸。

- **技术栈**：FastAPI（后端）+ SQLite（数据）+ 原生 HTML/CSS/JS（前端，无框架构建，直接静态托管）。
- **运行**：后端 `main.py` 用 `uvicorn main:app --host 0.0.0.0 --port 8000` 启动（系统 Python 3.14）。前端由 FastAPI 以 `/static/` 托管。
- **入口**：`questlog_launcher.py` / 桌面 `一键启动.bat` 一键起服务 + cpolar + 浏览器。

## 2. 目录结构

```
Quest-log/
├─ main.py                  # 后端全部逻辑：数据模型、API 路由、导入导出、成就、礼包、追踪、壁纸
├─ wallpaper_software.py    # 壁纸（Wallpaper Engine）相关接口
├─ questlog_launcher.py     # 启动器：起 uvicorn + cpolar + 打开浏览器
├─ organize_assets.py       # 从 assets-source 提取图标到 static/icons/ 的整理脚本
├─ static/
│  ├─ index.html            # 前端入口（含 SVG 滤镜 <defs>、筛选栏、各视图 section、任务表单 modal）
│  ├─ app.js                # 前端全部逻辑（~3300 行）：渲染、筛选、表单、奖励弹窗、图谱、日历等
│  ├─ style.css             # 全部样式（~3100 行），含主题变量、移动端 @media 适配
│  ├─ icons/                # 前端使用的真实图标 PNG（见第 6 节）
│  ├─ badges/ fonts/ page/ textures/ vendor/ wallpapers/  # 其他静态资源（徽章、字体、页面、纹理、三方库、壁纸）
├─ assets-source/           # 从 GitHub 克隆的游戏内解包美术（yuanyan3060/ArknightsGameResource）
│  ├─ item/ avatar/ portrait/ skin/ enemy/ skill/ map/ building_skill/ item_rarity_img/  # 各类真实 PNG
│  ├─ _all_items/           # item/ 全部 1307 个物品图标的备份副本
│  ├─ _prts_leftovers/      # PRTS/GamePress 早期非透明遗留图标
│  ├─ manifest.json         # 各目录文件数清单
├─ docs/                    # 文档
│  ├─ PROJECT_STRUCTURE.md  # 本文件
│  ├─ PROMPT_FOR_AI.md      # 给外部 AI 的任务拆解提示词（JSON 规范、track/task_line/分类 约定）
│  ├─ AGENT_TASK.md / GIT_GUIDE.md / VISUAL_SPEC.md / WALLPAPER_SETUP.md
├─ data/                    # 运行时数据（quest_log.db 在此或其父目录）
├─ references/              # 截图参考（官网截图 / 游戏内截图）
└─ REMOTE_URL.txt           # cpolar 隧道地址（手机访问用）
```

## 3. 数据模型（核心）

### 3.1 tasks 表（最重要）

| 字段 | 含义 | 备注 |
|------|------|------|
| `id` | 主键 | |
| `parent_id` | 父任务 | 树形嵌套；父子为**聚合关系**（父进度按子任务自动汇总），不是门禁 |
| `title` / `description` | 标题/描述 | |
| `priority` | 1~6 星 | |
| `task_line` | `main`/`side` | **任务线**：`main`=与某个主线战役任务关联；`side`=与长线任务无关的日常事务 |
| `track` | `daily`/`campaign` | **分桶（2026-09 新增）**：`daily`=日常任务；`campaign`=主线战役（长期规划/目标）。前端筛选栏可按此分桶 |
| `status` | todo/in_progress/paused/done/cancelled | |
| `progress_mode` | auto/manual/count | auto=按子任务汇总；manual=手动拖动；count=按 target/current 计数 |
| `progress` | 0~100 | |
| `target_value` / `current_value` | 计数用 | |
| `prerequisite_id` | 前置依赖 | **唯一门禁**：仅当显式前置依赖未完成时才锁定子任务，父子不互锁 |
| `is_tracked` | 是否追踪中 | |
| `reward_exp` / `reward_lungmen` / `reward_source_stone` / `reward_orundum` | 奖励资源 | 龙门币=lungmen、源石=source_stone、合成玉=orundum、经验=exp |
| `drop_config` | 随机掉落 JSON | `{"random_drops":["exp:30","source_stone:5",...]}` 或 `[...]` |
| `reward_claimed` | 是否已领取 | |
| `tags` | 多对多 | 通过 `tags`/`task_tags` 表；前端"分类"即写入 tags（受 settings.categories 管理） |
| `archived` / `deleted` | 软删除标记 | |

### 3.2 其它表
- `resources`：5 种资源当前值（exp/source_stone/lungmen/orundum/sanity）。
- `settings`：单行 JSON（`id=1`），含主题、壁纸、追踪专注开关、**`categories`=受管分类清单**（默认 [学习,健身,工作,生活,其他]）、username 等。
- `tags` / `task_tags`：标签名与任务关联。
- `achievements` / `achievement_unlocks`、`gift_packs`、`tracking_sessions`、`resource_transactions`。

## 4. 前端架构

- **`static/index.html`**：结构骨架。筛选栏（`#filterBar` 内 `#filterStatus`/`#filterPriority`/`#filterTrack`/`#filterTaskLine`/`#filterCategory`/`#filterTracked`/`#filterSearch`）、任务列表 `#taskList`、各视图 section（tasks/graph/calendar/achievements/profile）、任务表单 `#taskForm`（含 `#taskFormTrack` 分桶、`#taskFormCategory` 分类）。
- **`static/app.js`**：
  - `state`：全局状态（tasks/flatTasks/filter/settings/collapsedTasks 等）。
  - `filterTasks()`：所有筛选（状态/优先级/分桶 track/任务线/分类 category/追踪/搜索[含标签]/依赖）在此集中处理。
  - `renderTasks()` → `appendTaskGroups()` → `createTaskCard(task)`：渲染卡片。
  - `createTaskCard()`：构建单卡（星标、标题、`task-line-tag` 任务线、`task-track-tag` 分桶、折叠按钮、标签、进度、操作按钮）。
  - `completeTaskAndHandleReward()`：领取流程（并行加载 + 恢复滚动位置，避免移动端跳顶/延迟）。
  - `openRewardModal()`：奖励弹窗（资源卡片用真实 SVG 并 `tryUpgradeResIcon` 换真图；随机掉落用真实资源图标或宝箱图标）。
  - `tryUpgradeResIcon(span, name)`：把 `static/icons/<name>.png` 自动替换占位 SVG。
  - `renderCategoryFilter()` / `onCategoryFilterChange()`：分类下拉（受管，可"＋新建分类"）。
  - `toggleCollapse(id)` + `state.collapsedTasks`：子任务折叠/展开。
- **`static/style.css`**：主题 CSS 变量（深色为主）、卡片/筛选/弹窗样式、移动端 `@media (max-width:768px)` 适配。

### 4.1 前端铁律（改动前必读）
- **版本号**：`index.html` 引 `app.js?v=YYYYMMDD-NN` / `style.css?v=YYYYMMDD-NN`，改前端后**必须升版本号**，否则浏览器缓存旧文件 = "改了没用"。
- **API 路径**：`app.js` 里 `const API_BASE = '/api'`，所有 `apiGet/apiPost/...` 的 endpoint **一律不带 `/api` 前缀**（写 `/tasks` 而非 `/api/tasks`，否则拼成 `/api/api/...` → 404）。
- **背景层**：`style.css` 末尾有 `.bg-layer{opacity:.18}` 兜底规则；针对 `.bg-layer` 子类的样式必须写三类名 `.bg-layer.bg-gradient` 或加 `!important`，否则被静默反压。
- **移动端**：`.task-actions` 在桌面端 hover 显示、移动端常显且占满卡片底行（`flex-basis:100%`），不要改回 `flex-shrink:0` 导致按钮溢出卡片被 `overflow:hidden` 裁掉。
- **最小改动**：只修已诊断的 bug，不牵连无关代码。

## 5. 关键功能约定

- **日常任务 vs 主线战役**：顶层分桶 `track`（daily/campaign）。主线战役放长期目标，用户据此找 AI 拆出 `daily` 任务执行。筛选栏可切换"全部分桶/日常任务/主线战役"。
- **任务线 main/side**：日常任务中与长线任务关联的标 `main`，无关的标 `side`（由用户/AI 拆解时决定）。
- **分类（category）**：复用 tags 机制，由 `settings.categories` 受管。筛选栏下拉可点开选择并"＋新建分类"；任务表单可选分类（写入 tags）。搜索关键词会匹配标题/描述/**标签名**。
- **子任务折叠**：父任务卡左侧 chevron 切换 `state.collapsedTasks`，折叠时仅显示父任务。
- **奖励掉落图标**：已知资源类型（`exp`/`lungmen`/`source_stone`/`orundum`）显示对应真实图标；未知类型显示宝箱图标（替代原先未完成的金色加号占位）。

## 6. 资源图标（static/icons/）

当前激活的 5 个真实游戏图标（来自 `assets-source/item/`，均 183×183 透明 PNG）：

| 文件 | 资源 | 方舟 iconId |
|------|------|-------------|
| `lungmen.png` | 龙门币 | GOLD |
| `orundum.png` | 合成玉 | DIAMOND_SHD |
| `source_stone.png` | 源石（至纯源石） | DIAMOND |
| `sanity.png` | 理智 | AP_GAMEPLAY |
| `exp.png` | 经验 | EXP_PLAYER |

要增换其它图标（干员头像、材料……）：从 `assets-source/<目录>/` 复制 PNG 到 `static/icons/`，前端按文件名自动生效。详见 `static/icons/README.md`。

## 7. AI 拆解任务（给外部 AI）

把 `docs/PROMPT_FOR_AI.md` 复制给 ChatGPT/Claude 等，让其输出符合导入规范的 JSON（含 `track`/`task_line`/`tags`），粘进前端"导入"窗口即可。

## 8. 重新整合资源

`organize_assets.py` 从 `assets-source/item/` 重新提取 5 个激活图标并刷新 `_all_items/` 备份；`assets-source/manifest.json` 记录各目录文件数。
