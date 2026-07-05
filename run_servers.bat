@echo off
title SENTRY-AI Launcher
echo ===================================================
echo SENTRY-AI // LAUNCHING DEEPFORENSICS SERVERS...
echo ===================================================
echo.

:: Check for backend virtual environment
if not exist "backend\.venv\" (
    echo [ERROR] Backend virtual environment not found in backend\.venv
    echo Please install dependencies first.
    pause
    exit /b
)

:: Start Backend Server
echo [1/2] Launching Asynchronous FastAPI Backend Server...
start cmd /k "title SENTRY-AI [BACKEND] && cd backend && .venv\Scripts\activate && uvicorn app.main:app --host 0.0.0.0 --port 8000"

:: Start Frontend Server
echo [2/2] Launching Modern Vite+React Frontend Server...
start cmd /k "title SENTRY-AI [FRONTEND] && cd frontend && npm run dev"

echo.
echo ===================================================
echo SENTRY-AI servers launched successfully!
echo.
echo - FastAPI Backend Portal: http://localhost:8000
echo - React Forensics Console: http://localhost:5173
echo.
echo Press any key to exit this launcher terminal.
echo ===================================================
pause > nul
