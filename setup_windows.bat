@echo off
setlocal

if not exist .venv (
  py -m venv .venv
)

call .venv\Scripts\activate
py -m pip install --upgrade pip
py -m pip install -r requirements.txt

if not exist .env (
  copy .env.example .env >nul
  echo Created .env from .env.example
)

echo.
echo Setup complete. Next run:
echo   .venv\Scripts\activate
echo   py main.py
