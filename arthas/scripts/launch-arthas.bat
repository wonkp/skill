@echo off
setlocal
rem Usage: launch-arthas.bat [ARTHAS_HOME]
rem Starts arthas-boot.jar in this window; pick the target Java process by index.

set "ARTHAS_HOME=%~1"
if "%ARTHAS_HOME%"=="" set "ARTHAS_HOME=C:\IT\Tools\arthas"

if not exist "%ARTHAS_HOME%\arthas-boot.jar" (
    echo [ERROR] arthas-boot.jar not found under "%ARTHAS_HOME%".
    echo Check the arthas path in the global CLAUDE.md.
    pause
    exit /b 1
)

cd /d "%ARTHAS_HOME%"
echo ============================================================
echo  Arthas 4.x  home: %ARTHAS_HOME%
echo  Select the Java process to attach by index, then press Enter.
echo  MCP endpoint : http://127.0.0.1:8563/mcp
echo  Telnet       : 127.0.0.1:3658
echo ============================================================
echo.

java -jar arthas-boot.jar

echo.
echo [Arthas exited] Press any key to close this window.
pause >nul
endlocal
