@echo off
REM Does F1 live timing deliver the full feed without a login token?
REM Run this during a live session (practice/quali/race).
cd /d "%~dp0"
node test-anon-f1.js
echo.
pause
