@echo off
setlocal

rem ==== Cau hinh VPS (sua neu thay doi) ====
set VPS_HOST=221.132.19.75
set VPS_USER=root
set SSH_KEY=%USERPROFILE%\.ssh\lingoraenglish_vps
set REMOTE_DIR=/root/lingoraenglish-app
set IMAGE_NAME=lingoraenglish-app:latest
set TAR_FILE=lingoraenglish-app.tar
set GZ_FILE=lingoraenglish-app.tar.gz
rem Giu ket noi SSH song khi truyen file lon, tranh bi thiet bi mang giua duong
rem cat ket noi vi tuong la "khong hoat dong".
set SSH_OPTS=-o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o ConnectTimeout=15

echo.
echo === 1/5 Build Docker image tu code hien tai ===
docker build -t %IMAGE_NAME% .
if errorlevel 1 (
  echo [LOI] Build that bai. Dung lai, kiem tra loi ben tren.
  exit /b 1
)

echo.
echo === 2/5 Luu image ra file va nen lai (nho hon, truyen nhanh hon, do rot mang giua chung) ===
docker save -o %TAR_FILE% %IMAGE_NAME%
if errorlevel 1 (
  echo [LOI] docker save that bai. Dung lai.
  exit /b 1
)
del %GZ_FILE% 2>nul
gzip %TAR_FILE%
if errorlevel 1 (
  echo [LOI] Nen file that bai. Dung lai.
  exit /b 1
)

echo.
echo === 3/5 Copy image (nen) + docker-compose.yml + .env.docker len VPS ===
set RETRIES=4
:retry_copy_image
scp %SSH_OPTS% -i "%SSH_KEY%" %GZ_FILE% %VPS_USER%@%VPS_HOST%:%REMOTE_DIR%/
if errorlevel 1 (
  set /a RETRIES-=1
  if %RETRIES% gtr 0 (
    echo [CANH BAO] Mang bi gian doan giua chung, dang thu lai... con %RETRIES% lan
    timeout /t 3 >nul
    goto retry_copy_image
  )
  echo [LOI] Copy image that bai sau nhieu lan thu. Kiem tra mang/VPN toi VPS.
  exit /b 1
)
scp %SSH_OPTS% -i "%SSH_KEY%" docker-compose.yml %VPS_USER%@%VPS_HOST%:%REMOTE_DIR%/
if errorlevel 1 (
  echo [LOI] Copy docker-compose.yml that bai.
  exit /b 1
)
scp %SSH_OPTS% -i "%SSH_KEY%" .env.docker %VPS_USER%@%VPS_HOST%:%REMOTE_DIR%/
if errorlevel 1 (
  echo [LOI] Copy .env.docker that bai.
  exit /b 1
)

echo.
echo === 4/5 Giai nen, nap image moi tren VPS va khoi dong lai container ===
ssh %SSH_OPTS% -i "%SSH_KEY%" %VPS_USER%@%VPS_HOST% "cd %REMOTE_DIR% && gunzip -f %GZ_FILE% && docker load -i %TAR_FILE% && docker compose up -d && rm -f %TAR_FILE%"
if errorlevel 1 (
  echo [LOI] Trien khai tren VPS that bai. Xem log ben tren.
  exit /b 1
)

echo.
echo === 5/5 Don file tam o may local ===
del %TAR_FILE% 2>nul
del %GZ_FILE% 2>nul

echo.
echo ==== XONG. Dang xem log container (Ctrl+C de thoat, container van chay binh thuong) ====
ssh %SSH_OPTS% -i "%SSH_KEY%" %VPS_USER%@%VPS_HOST% "cd %REMOTE_DIR% && docker compose logs -f app"

rem Neu co migration DB moi (file .sql moi trong src\db\schema\), chay migrate.bat
rem TRUOC khi chay deploy.bat nay.

endlocal
