# Quest-log 方舟图标下载脚本
# 从 GamePress Wiki 下载透明背景 PNG 图标
# 用法：右键 → 使用 PowerShell 运行（或双击）

$ErrorActionPreference = "Stop"
$destDir = "$PSScriptRoot\static\icons"
if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }

# GamePress Wiki 的方舟物品图标直链（透明背景 PNG）
$icons = @{
    "lungmen.png"     = "https://gamepress.gg/arknights/sites/arknights/files/2021-04/icon_item_lmd.png"
    "orundum.png"     = "https://gamepress.gg/arknights/sites/arknights/files/2021-04/item_orundum.png"
    "source_stone.png"= "https://gamepress.gg/arknights/sites/arknights/files/2021-04/item_originium_prime.png"
    "sanity.png"      = "https://gamepress.gg/arknights/sites/arknights/files/2021-04/ap_icon.png"
    "exp.png"         = "https://gamepress.gg/arknights/sites/arknights/files/2021-04/item_exp_book.png"
}

Write-Host "=== Quest-log 方舟图标下载 ===" -ForegroundColor Cyan
Write-Host "目标目录: $destDir" -ForegroundColor Gray

foreach ($name in $icons.Keys) {
    $url = $icons[$name]
    $outFile = Join-Path $destDir $name
    Write-Host "  下载 $name ..." -NoNewline
    try {
        Invoke-WebRequest -Uri $url -OutFile $outFile -UseBasicParsing -TimeoutSec 30
        $size = (Get-Item $outFile).Length
        if ($size -lt 500) {
            Write-Host " 失败（文件过小，可能 URL 已失效）" -ForegroundColor Red
            Remove-Item $outFile -Force -ErrorAction SilentlyContinue
        } else {
            Write-Host " OK ($size bytes)" -ForegroundColor Green
        }
    } catch {
        Write-Host " 失败: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "完成！刷新 Quest-log 页面（Ctrl+F5）即可看到新图标。" -ForegroundColor Cyan
Write-Host "如果某个图标下载失败，手动从以下地址保存到 static/icons\ 即可：" -ForegroundColor Yellow
foreach ($name in $icons.Keys) {
    Write-Host "  $name -> $($icons[$name])" -ForegroundColor Gray
}
Read-Host "`n按回车键退出"
