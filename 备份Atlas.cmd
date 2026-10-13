@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，无法创建备份。现有数据没有修改。
  pause
  exit /b 1
)
node.exe "%~dp0scripts\backup.mjs"
if errorlevel 1 (
  echo 备份未完整完成，请确认 Docker Desktop 和本地数据库运行正常后重试。
) else (
  echo 数据库和上传文件已备份到本文件夹下的 backups 目录。
)
pause
