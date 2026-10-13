@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请安装 Node.js 后重新启动 Atlas。
  pause
  exit /b 1
)
node.exe "%~dp0scripts\start-local.mjs"
if errorlevel 1 pause
