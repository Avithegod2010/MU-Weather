@echo off
rem MU Weather launcher - keeps node, npm cache and Metro bundler temp on E: drive
set "PATH=E:\Tools\nodejs;E:\Tools\npm-global;%PATH%"
set "TMP=E:\Tools\temp"
set "TEMP=E:\Tools\temp"
cd /d "%~dp0"
echo Starting MU Weather (Expo dev server, cache cleared)...
npx expo start --clear
