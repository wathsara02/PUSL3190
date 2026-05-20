@echo off
chcp 65001 > nul
setlocal

echo ============================================================
echo   Omi Card Game — Full Demo Suite
echo   Run from: WEBAPP\demo\
echo ============================================================
echo.

:: Detect Python
where python > nul 2>&1
if errorlevel 1 (
    echo ERROR: python not found in PATH.
    echo Activate your venv first:
    echo   cd ..\last\backend ^&^& .venv\Scripts\activate
    pause
    exit /b 1
)

set PAUSE_BETWEEN=1

echo [1/7] Weights Check ...
echo ============================================================
python 01_weights_check.py
if errorlevel 1 ( echo FAILED & goto :end )
echo.
if %PAUSE_BETWEEN%==1 pause

echo [2/7] Game Simulation ...
echo ============================================================
python 02_game_simulation.py
if errorlevel 1 ( echo FAILED & goto :end )
echo.
if %PAUSE_BETWEEN%==1 pause

echo [3/7] AI vs Random Benchmark ...
echo ============================================================
python 03_ai_vs_random.py
if errorlevel 1 ( echo FAILED & goto :end )
echo.
if %PAUSE_BETWEEN%==1 pause

echo [4/7] Rules Engine Demo ...
echo ============================================================
python 04_rules_demo.py
if errorlevel 1 ( echo FAILED & goto :end )
echo.
if %PAUSE_BETWEEN%==1 pause

echo [5/7] Observation Vector Breakdown ...
echo ============================================================
python 05_observation_demo.py
if errorlevel 1 ( echo FAILED & goto :end )
echo.
if %PAUSE_BETWEEN%==1 pause

echo [6/7] Live API Demo (requires backend on port 8000) ...
echo ============================================================
python 06_api_demo.py
if errorlevel 1 ( echo FAILED & goto :end )
echo.
if %PAUSE_BETWEEN%==1 pause

echo [7/7] AI Card Decision Showcase ...
echo ============================================================
python 07_ai_card_decision.py
if errorlevel 1 ( echo FAILED & goto :end )
echo.

:end
echo ============================================================
echo   All demos complete.
echo ============================================================
pause
