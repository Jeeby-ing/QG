# QUEST LOG 动态壁纸设置教程

## 1. 准备壁纸文件
把壁纸文件放到项目目录：

```text
static/wallpapers/
```

支持：

- 图片：`.jpg`、`.png`、`.webp`
- 视频：`.mp4`、`.webm`

例如：

```text
static/wallpapers/my-wallpaper.mp4
```

## 2. 获取壁纸 URL

### 本机文件
启动 QUEST LOG 后，本机文件地址是：

```text
http://localhost:8000/static/wallpapers/my-wallpaper.mp4
```

视频壁纸建议使用支持 Range 的地址：

```text
http://localhost:8000/media/wallpapers/my-wallpaper.mp4
```

### 手机/局域网访问
如果手机和电脑在同一 WiFi，把 `localhost` 换成电脑的局域网 IP：

```text
http://192.168.x.x:8000/static/wallpapers/my-wallpaper.mp4
```

电脑 IP 可以通过 `start_quest_log.bat` 启动时看到，也可以在命令行运行：

```text
ipconfig
```

找到 `IPv4 地址`。

### 网络图片/视频
也可以直接使用外链：

```text
https://example.com/wallpaper.mp4
https://example.com/wallpaper.jpg
```

## 3. 在 QUEST LOG 中设置壁纸

1. 打开网页。
2. 点击右上角齿轮「设置」。
3. 找到「动态壁纸类型」：
   - `无壁纸`
   - `图片壁纸`
   - `视频动态壁纸`
4. 在「壁纸 URL」输入框粘贴上面得到的地址。
5. 选择类型后会自动保存并立即生效。

## 4. 手机远程访问完整步骤

1. 双击 `start_quest_log.bat`。
2. 记下启动窗口显示的局域网地址，例如 `http://192.168.1.5:8000`。
3. 手机连接同一个 WiFi。
4. 手机浏览器打开该地址。
5. 在手机上的设置里同样填写壁纸 URL。

> 如果手机无法访问，检查 Windows 防火墙是否允许 Python 通过专用网络，或暂时关闭防火墙测试。

## 5. 推荐壁纸来源

- 自己录制的视频
- Wallpaper Engine 导出的 `.mp4`
- 免费壁纸网站（注意版权，优先 CC0 / 可商用授权）

## 6. 当前限制

- 视频壁纸使用浏览器原生 `<video>` 播放，因此 URL 必须能被浏览器直接访问。
- 如果使用 Wallpaper Engine 的 `.mp4`，请先导出为普通视频文件。
- 后续可以接入 Wallpaper Engine / Lively Wallpaper 官方接口，实现更完整的动态壁纸联动。
