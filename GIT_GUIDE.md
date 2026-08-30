# QUEST LOG · Git 操作指南

> 写给不太熟悉 Git 的你。照着抄命令即可，不用理解原理。
> 所有命令都在项目目录 `Quest-log` 里执行（在文件夹地址栏输入 `cmd` 回车，或用本工具）。

---

## 一、现在是什么情况

- 仓库已经建好（`git init`）。
- **改版前快照**：基线提交 `a63f5ad`，标签说明「建立 git 基线（改版前快照）」。
  - 如果新界面你不满意，随时可以一键退回这个版本。
- 数据库 `quest_log.db` 不会被 Git 记录（已在 `.gitignore` 排除），
  所以你的任务数据、壁纸设置**不会因为切版本而丢失**。

---

## 二、最常用的 6 个命令

### 1. 看改了什么（最安全，随便看）
```bash
git status          # 哪些文件改了/新增了
git diff            # 看具体改了哪些行（很长，可忽略）
git log --oneline   # 看提交历史，记住那串短编码
```

### 2. 把当前改动保存成一个版本（叫「提交」）
```bash
git add .
git commit -m "描述这次改了啥，比如：接入壁纸软件+视觉V4"
```
提交后 `git log --oneline` 里会多一行，那就是你刚存的版本。

### 3. 回退到「改版前」（最重要）
```bash
# 方式 A：临时看一眼旧版（看完输入下面命令回正常）
git checkout a63f5ad

# 方式 B：彻底回到旧版（你现在的界面改动会暂时消失，但没丢，还能回来）
git checkout a63f5ad

# 想回到最新版（你刚提交的那个）：
git checkout master
```
> 说明：`git checkout <版本号>` 只是切换查看，不会删除任何东西。
> 切回去之后，再用 `git checkout master` 就能回到最新。

### 4. 误删文件 / 想丢弃某个文件的改动
```bash
git restore 文件名          # 例如 git restore static/style.css
git restore .              # 丢弃所有未保存的改动（慎用）
```

### 5. 开一个「分支」做实验（不影响主线）
```bash
git branch 试验名          # 新建分支
git checkout 试验名        # 切到分支
# …随便改…
git checkout master        # 回到主线
```

### 6. 备份到云端（可选，需要你自己的 Git 账号）
```bash
git remote add origin 你的仓库地址   # 只做一次
git push -u origin master            # 推送到云端
```
> 没账号可以不推，本机仓库已经足够回退了。

---

## 三、一个典型场景：改砸了要回退

1. 先 `git status` 确认当前状态。
2. `git stash` 把当前半吊子改动先收起来（可选，防止冲突）。
3. `git checkout a63f5ad` 回到改版前。
4. 觉得旧版好：`git checkout master` 之前先 `git stash pop` 取回改动再继续改。

---

## 四、注意事项

- 改完界面后**记得 `git add . && git commit`**，否则回退时找不到这个版本。
- 巨型视频壁纸（`static/wallpapers/*.mp4`）和 `references/` 素材不进仓库，避免仓库膨胀。
- 数据库 `quest_log.db` 不进仓库，但它是你真正的任务数据，**别手动删**。
- 如果命令报 `Author identity unknown`，先设置一次：
  ```bash
  git config user.name "你的名字"
  git config user.email "你的邮箱"
  ```

---

## 五、本次改版包含的内容（提交后可回退）

- `static/style.css`：鹰角/明日方舟风格 V4 增强层（配色、装饰背景字、导航、按钮、成就六边形等）。
- `static/app.js`：任务卡光泽扫过动效；设置面板新增「本机壁纸软件」一键切换。
- `static/index.html`：资源版本号提升（强制刷新浏览器缓存）。
- `main.py` + `wallpaper_software.py`：后端检测 Wallpaper Engine / Lively Wallpaper 并一键切换系统壁纸。

回退命令（需要退回 V4 之前时）：
```bash
git checkout a63f5ad
```
