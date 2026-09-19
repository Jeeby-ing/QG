# QUEST LOG · Git 使用指南

> 写给不想背命令的人。**日常只需要记住 4 条命令**，其余当字典查。
> 所有命令都在项目目录 `Quest-log` 里执行（在文件夹地址栏输入 `cmd` 回车即可）。

---

## 0. 日常只要这 4 条

```bash
git status                 # ① 看现在改了哪些文件
git add -A                 # ② 把改动全部加入待提交
git commit -m "说明"       # ③ 存成一个版本（本地存档）
git push                   # ④ 同步到 GitHub（云端备份）
```

一句话记住流程：**改代码 → `status` 看一眼 → `add -A` → `commit` → `push`。**

推送成功后 `git log --oneline -1` 能看到刚才那行，GitHub 网页上也会立刻出现。

---

## 1. 检查状态 / 历史

```bash
git status                 # 当前有哪些改动（最常用，随便看，不会改任何东西）
git log --oneline -10      # 最近 10 个版本，左边那串 7 位字符是「版本号」
git diff                   # 看具体改了哪些行（很长，一般不细看）
git show 8d6c3ef           # 看某个版本到底改了什么
```

---

## 2. 提交（本地存档）

```bash
git add -A                              # 全部改动
git add static/style.css                # 只提交某一个文件
git commit -m "修了任务卡片星星大小"     # 存档，说明写清楚
```

> 提交只是**存在本机**。要上传到 GitHub 还得 `git push`。
> 建议每完成一件小事就提交一次，出问题好回退。

---

## 3. 推送到 GitHub

### 3.1 正常情况
```bash
git push
```
输出里出现 `xxxxxx..yyyyyy  master -> master` 就是成功了。

### 3.2 ⚠️ 本机踩过的坑：`error: 502` 怎么修（已修好，留档）

**症状**：`git ls-remote` 正常，但 `git push` 一直报
`fatal: unable to access 'https://github.com/...': The requested URL returned error: 502`。
清代理、换 HTTP/1.1、重试全都无效。

**根因**：`C:\Windows\System32\drivers\etc\hosts` 里有一段 Steam++（Watt Toolkit）写的劫持：

```
# Steam++ Start
127.0.0.1 github.com
127.0.0.1 api.github.com
127.0.0.1 raw.githubusercontent.com
...
# Steam++ End
```

也就是说 **`github.com` 被解析成了本机 `127.0.0.1`**，本机 443 端口是 Steam++ 的
加速转发服务，而它当时转发 git 的 `git-receive-pack`（POST）返回了 **502 Bad Gateway**。
所以不是你的网络问题，也不是仓库权限问题。

**修复方式（当前采用）**：让 Git 走 SSH 的 443 端口，绕开被劫持的 https。
新建了 `C:\Users\MMCGA\.ssh\config`：

```
Host github.com
    HostName ssh.github.com      # 真正连的是没被劫持的 ssh.github.com
    Port 443                     # 443 端口不会被防火墙拦
    User git
    IdentityFile ~/.ssh/id_rsa
```

再把远端从 https 换成 ssh（只做一次）：

```bash
git remote set-url origin git@github.com:Jeeby-ing/QG.git
git remote -v                    # 确认已变成 git@github.com:...
git push                         # 现在能推了
```

**如果哪天又推不上去**，按顺序试：

```bash
git remote -v                                  # 1. 看是不是 https 被换回来了
ssh -T git@github.com                          # 2. 应显示 "Hi Jeeby-ing! You've successfully authenticated"
git push                                       # 3. 再推
```

第 2 步失败的话，多半是 Steam++ 在作怪：**打开 Watt Toolkit → 把「GitHub 加速」关掉**
（或直接退出 Steam++），再试一次。想要彻底干净的话，用管理员权限编辑 hosts，
把 `# Steam++ Start` 到 `# Steam++ End` 之间那几行 `github.com` 前面都加上 `#` 注释掉。

> 顺带记一笔：如果改用 https 推送时遇到 `schannel: CRYPT_E_REVOCATION_OFFLINE`，
> 执行一次 `git config --global http.schannelCheckRevoke false` 即可。

---

## 4. 回退 / 撤销

```bash
# 只撤销「还没提交」的改动
git restore static/style.css      # 丢弃这一个文件的改动
git restore .                     # 丢弃全部未提交改动（慎用！）

# 已经提交了，想撤销刚才那次提交（改动保留在工作区）
git reset --soft HEAD~1

# 想回到某个历史版本看一眼（不会删东西）
git checkout 8d6c3ef              # 回到那个版本
git checkout master               # 看完回到最新

# 把某个版本的内容整体拿回来（例如恢复一个被改坏的文件）
git checkout 8d6c3ef -- static/style.css
```

**安全网**：`git checkout <版本号>` 只是切过去看，不会删任何东西，随时 `git checkout master` 回来。

---

## 5. 分支（想大改又怕改坏时用）

```bash
git switch -c exp-ui         # 新建并切到分支 exp-ui
# …随便改、随便提交…
git switch master            # 回主线（分支上的改动不影响主线）
git merge exp-ui             # 满意了就把分支合并进主线
git branch -D exp-ui         # 不要了，删掉分支
```

---

## 6. 几条要记住的规矩

- **每次改完代码**：`git add -A && git commit -m "说明"`，否则出问题找不到回退点。
- **数据库 `quest_log.db` 不进仓库**（已在 `.gitignore` 排除），
  所以切版本、回退都**不会丢任务数据**——但也意味着它不会被备份，别手动删。
- **巨型素材不进仓库**：`static/wallpapers/*.mp4`、`references/`、`assets-source/`。
- 报 `Author identity unknown` 时先设置一次身份：
  ```bash
  git config user.name "Jeeby"
  git config user.email "你的邮箱"
  ```
- 报 `Updates were rejected`（远端比你新）时：
  ```bash
  git pull --rebase
  git push
  ```

---

## 7. 提交记录速查

| 版本 | 内容 |
|---|---|
| `a63f5ad` | 建立 git 基线（改版前快照） |
| `88cb39b` | R16 界面返工 |
| `2dce949` | R17 |
| `f2ba788` | R18 星级色条恢复 / 按钮磨砂玻璃 |
| `8d6c3ef` | R19 星级色条收窄回退、去左侧色条、奖励流程、兑换窗口、按钮几何、周更与任务源石 |

回退到任意一版：`git checkout <版本号>`
