@echo off
setlocal
set "HERE=%~dp0"
set "COMFY=%HERE%..\..\.."
set "PY="
if exist "%COMFY%\..\python_embeded\python.exe" set "PY=%COMFY%\..\python_embeded\python.exe"
if not defined PY if exist "%COMFY%\.venv\Scripts\python.exe" set "PY=%COMFY%\.venv\Scripts\python.exe"
if not defined PY if exist "%COMFY%\venv\Scripts\python.exe" set "PY=%COMFY%\venv\Scripts\python.exe"
if not defined PY (
  echo Could not find ComfyUI's Python next to this extension.
  echo Run it with ComfyUI's Python yourself:  path\to\python.exe "%HERE%install_sageattention.py"
  pause
  exit /b 1
)
echo Close ComfyUI before installing, then press a key.
pause
"%PY%" "%HERE%install_sageattention.py" "%PY%" %*
pause
