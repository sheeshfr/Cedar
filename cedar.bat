@echo off
chcp 65001 >nul
title Cedar - Drop-in Blog Engine and Studio
cd /d "%~dp0"
echo =============================================================
echo   Starting Cedar Local Studio...
echo =============================================================

set "PY_CMD="

:: 1. Check official Python installations in LocalAppData
if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    set PY_CMD="%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    goto :LAUNCH
)
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
    if exist "%%~D\python.exe" (
        set PY_CMD="%%~D\python.exe"
        goto :LAUNCH
    )
)

:: 2. Check official Python Launcher
if exist "%LOCALAPPDATA%\Programs\Python\Launcher\py.exe" (
    set PY_CMD="%LOCALAPPDATA%\Programs\Python\Launcher\py.exe" -3
    goto :LAUNCH
)

:: 3. Check Program Files and root installations
for /d %%D in ("C:\Program Files\Python3*") do (
    if exist "%%~D\python.exe" (
        set PY_CMD="%%~D\python.exe"
        goto :LAUNCH
    )
)
for /d %%D in ("C:\Python3*") do (
    if exist "%%~D\python.exe" (
        set PY_CMD="%%~D\python.exe"
        goto :LAUNCH
    )
)

:: 4. Check PATH commands if they actually execute (avoiding Microsoft Store alias)
py -3 -c "import sys; sys.exit(0)" >nul 2>&1
if not errorlevel 1 (
    set PY_CMD=py -3
    goto :LAUNCH
)

python -c "import sys; sys.exit(0)" >nul 2>&1
if not errorlevel 1 (
    set PY_CMD=python
    goto :LAUNCH
)

:LAUNCH
if not defined PY_CMD (
    echo.
    echo [ERROR] Python 3 was not found on your system!
    echo Please install Python 3 from https://www.python.org/downloads/
    echo or ensure it is added to your PATH.
    echo.
    pause
    exit /b 1
)

%PY_CMD% "%~dp0serve.py" %*
if errorlevel 1 (
    echo.
    echo Cedar server stopped.
    pause
)
