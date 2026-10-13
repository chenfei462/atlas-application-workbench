@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，无法核实页面进程；本地数据库和数据已保留。
  pause
  exit /b 1
)
node.exe "%~dp0scripts\stop-local.mjs"
if errorlevel 1 pause
