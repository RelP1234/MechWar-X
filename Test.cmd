@echo off
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" test.mjs
) else (
  node test.mjs
)
pause
