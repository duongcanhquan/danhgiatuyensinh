@echo off
setlocal
set "PLUGIN=%~dp0..\\plugins\\superpowers"
set "HOOK=%PLUGIN%\\..\\..\\hooks\\session-start-proxy.cmd"
if exist "%HOOK%" (
  call "%HOOK%"
  exit /b %ERRORLEVEL%
)
set "BASE=%USERPROFILE%\.cursor\plugins\cache\cursor-public\superpowers"
if not exist "%BASE%" exit /b 0
for /f "delims=" %%D in ('dir /b /ad /o-n "%BASE%" 2^>nul') do (
  if exist "%BASE%\%%D\hooks\run-hook.cmd" (
    call "%BASE%\%%D\hooks\run-hook.cmd" session-start
    exit /b %ERRORLEVEL%
  )
)
exit /b 0
