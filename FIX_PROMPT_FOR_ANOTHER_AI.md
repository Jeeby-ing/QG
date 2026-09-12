# Quest-log 前端修复提示词（带给另一个 AI 窗口）

> 复制下面 `=== 提示词开始 ===` 到 `=== 提示词结束 ===` 之间的全部内容，粘贴到另一个对话窗口即可。

=== 提示词开始 ===

你帮我修一个本地 Web 项目 Quest-log 的两个前端问题。下面是完整背景，请先读完再动手，**不要重复已做过的无效修改**。

## 项目基本信息
- 本地路径：`C:\Users\MMCGA\Desktop\Quest-log`
- 技术栈：FastAPI + SQLite + 原生 HTML/CSS/JS（无框架、无构建步骤）
- 前端入口：`static/index.html`，样式 `static/style.css`，逻辑 `static/app.js`
- 后端：`main.py`，用 `uvicorn main:app --host 0.0.0.0 --port 8000` 启动，静态文件由 `/static/` 直接托管
- **铁律**：改了 `static/app.js` 或 `static/style.css` 后，必须同步把 `index.html` 里引用的版本号 `?v=YYYYMMDD-NN` 升一位（当前是 `?v=20260903-84`），否则浏览器死缓存旧文件。favicon 引用也要带 `?v=` 戳。
- 数据库：`quest_log.db`（根目录，注意不是 `data/quest_log.db`），任务表 `tasks`，关键字段：`deleted`（整数 0/1）、`archived`（0/1）、`status`（如 'done'/'pending'/'cancelled'）

## 待修问题 A：任务图谱里显示"已删除"的节点（用户说"没删掉"，无痕模式也还在）

### 已确认的事实（务必基于这些排查，不要假设）
1. 数据库真实状态（已用 python 直连核实）：`quest_log.db` 中 `deleted!=0` 的任务 = **0 个**，`archived=1` 的任务 = **0 个**。全部 42 个任务都是 `deleted=0, archived=0` 的活跃任务（之前 3 个测试垃圾任务已物理删除）。
2. 当前代码（版本 -84）的图谱过滤逻辑：
   - `renderGraph()` 里：`const nodes = state.flatTasks.filter(t => !(t.deleted == 1 || t.deleted === true) && !t.archived);` （app.js 约 1672 行）
   - `getLevelMap()` 里同样排除了 deleted 和 archived（约 1858 行）
   - 也就是说，**从代码逻辑看，图谱本就不渲染 deleted/archived 节点**。
3. **关键点**：`显示归档`/`显示已删除` 两个复选框（DOM id 为 `showArchived`/`showDeleted`，app.js 约 158-159 行 cache，337-338 行绑定 change→applyFilters）**只影响"任务列表"的过滤**（applyFilters 里 1288-1289 行），**完全不影响图谱 renderGraph**。
4. API 已加 `cache: 'no-store'`（apiGet 里），理论上不缓存响应。

### 矛盾（这是排查重点）
用户重启浏览器、甚至说要重启电脑，图谱里**仍然看到他认为是"已删除"的节点**。无痕模式（完全无缓存）也看到。但数据库和代码都表明不该有。所以"继续改过滤代码"是无效的——问题在别处。

### 请按此顺序排查（不要跳步）
1. **先核对浏览器实际加载的 app.js 是不是 -84**：在用户的浏览器（F12 → Network）里看 `app.js?v=...` 请求的完整 URL，query 是不是 `20260903-84`。如果不是 -84，说明浏览器/中间层在喂旧文件（见第 3、4 步）。
2. 让用户打开图谱页面，在浏览器 Console 执行诊断，把结果发回来：
   ```js
   // 看真实内存数据里有没有 deleted/archived 的
   console.log('deleted/archived 节点数:', state.flatTasks.filter(t=>t.deleted||t.archived).length);
   // 看用户到底觉得哪些节点不该显示
   console.log('status=done 的节点:', state.flatTasks.filter(t=>t.status==='done').map(t=>t.title));
   // 看渲染进图谱的节点总数
   console.log('图谱 nodes 数:', document.querySelectorAll('.graph-node, [class*="graph-node"]').length);
   ```
3. **确认访问地址**：用户是用 `http://127.0.0.1:8000` 还是 **cpolar 随机域名**？如果用 cpolar 域名，旧隧道可能已关闭/指向别处，或 cpolar 有边缘缓存。让他改用 `127.0.0.1:8000` 直连再试。
4. **确认 uvicorn 进程**：`netstat -ano | findstr :8000` 看 LISTEN 的 PID，确认它跑的就是这个 `Quest-log` 目录的 `main.py`（不是别的项目/旧副本）。必要时杀掉旧进程用系统 Python 3.14 重启：`C:/Users/MMCGA/AppData/Local/Programs/Python/Python314/python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000`。
5. **关键歧义——和用户确认**：用户口中的"已删除节点"有可能其实是 `status='done'`（已完成）的任务，他在图谱里看到完成的任务就以为没删掉。**直接问用户**：图谱里具体哪个任务标题不该显示？把那个标题告诉我，我查库确认它的 `deleted/archived/status` 真实值。如果是 `status='done'` 的，那需求其实是"图谱隐藏已完成任务"，要在 renderGraph 里加 `t.status!=='done'` 过滤（或不隐藏、仅灰显，按用户偏好）。

### 期望效果
图谱只显示用户期望看到的节点，删除/归档的任务彻底消失；无论用 127.0.0.1 还是 cpolar 都一致。

## 待修问题 B：导航栏时间戳位置偏右，需要左移一点

### 当前状态（已确认）
- 时间戳 DOM 在 `static/index.html` 第 85-86 行，位于 `.nav-right` 容器**内部**第一行：
  ```html
  <div class="nav-right">
      <span class="resource-timestamp" id="resourceTimestamp"></span>
      <div class="resource-display" id="resourceDisplay"> ... </div>
  ```
- 时间戳 CSS（`static/style.css` 约 440-447 行）用了 `margin-right: auto`，意图是把它推到 nav-right 的左边缘。但 `.nav-right` 本身在 `.top-nav`（`justify-content:space-between`）的最右侧，所以时间戳视觉上仍然偏右，没真正靠中间。
- 之前 -81 曾把时间戳移到 `</nav>` 之后、nav-right 之前（top-nav 直接子元素），结果"不见了"（疑似被 nav-center 的 flex:1 挤掉或 JS 渲染异常），-82 又放回了 nav-right 内。

### 期望效果
时间戳**稍微左移一点**即可——理想位置在"主页"标签（nav-center 最后一个按钮）右侧、资源栏左侧的空白区，而不是贴着导航栏最右。

### 建议改法（二选一，给另一个 AI 自己判断）
- 方案 1：把 `<span class="resource-timestamp">` 从 `.nav-right` 移到 `.nav-center`（标签组 `<nav>`）内部、最后一个按钮（`主页`）之后、`</nav>` 之前；CSS 去掉 `margin-right:auto`，改 `margin-left: 20px` 与标签隔开，并确保 `flex-shrink:0; white-space:nowrap`。注意：放 nav-center 内时 nav-center 是 `flex:1; justify-content:center`，时间戳会和标签组一起居中，需测试不会"不见"。
- 方案 2：保持时间戳在 nav-right 内，但把 `.nav-right` 的 `justify-content` 改为 `flex-start` 或给时间戳加 `margin-left` 负值把它往左拉——但 nav-right 在导航栏最右，margin 拉不动导航栏级位置，所以方案 1 更靠谱。
- 注意窄屏 `@media (max-width:768px)` 里 `.resource-timestamp { display:none }` 要保留（第 434 行），别误删。

## 已尝试过但无效的修改（不要重复）
- 多次在 renderGraph 里改过滤条件（`!t.deleted` → 兼容类型 `!(t.deleted==1||t.deleted===true)` → `&& !t.archived`），当前已是最终版，数据库也无 deleted 数据，所以再改过滤代码没用。
- 给 favicon 和静态资源加 `?v=` 版本戳打破浏览器缓存（已做，但仍有人反映"没变"，疑似 cpolar 域名或进程不是这个目录的）。
- 给 apiGet 加 `cache:'no-store'`（已做）。
- 时间戳在 nav-right 内用 `margin-right:auto`（当前状态，偏右没解决）。

## 交付要求
1. 改完前端记得升 `index.html` 的 `?v=` 版本号（如 -85）。
2. 用 `node --check static/app.js` 验证 JS 语法。
3. 用 `curl -s http://127.0.0.1:8000/ | grep -o 'v=20260903-[0-9]*'` 确认版本号已生效。
4. 先把问题 A 的"浏览器实际加载版本号 + 用户指认的具体节点标题"这两个信息确认清楚再下结论，避免盲改。

=== 提示词结束 ===
