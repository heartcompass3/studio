@echo off
chcp 65001 >nul
title Heart Compass Studio V2
cd /d "%~dp0"
echo ===================================================
echo   Heart Compass Studio Pro - מצפן הלב אולפן סטודיו
echo ===================================================
echo Starting Studio server...
call npm.cmd run dev -- --open
pause
