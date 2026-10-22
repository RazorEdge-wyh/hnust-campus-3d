@echo off
setlocal
if exist "node_modules\vite\bin\vite.js" goto run
echo Installing dependencies...
call pnpm install
:run
where node >nul 2>nul
if %errorlevel%==0 goto usenode
set "PATH=C:\Users\PC GAMER\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;%PATH%"
:usenode
node "node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 5175
pause
