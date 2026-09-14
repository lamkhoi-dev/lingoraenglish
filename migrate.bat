@echo off
setlocal

rem File nay CHI ap dung migration moi sinh boi drizzle-kit (src\db\schema\*.sql),
rem dung cho thay doi schema hang ngay. KHONG dung file nay de dung mot database
rem HOAN TOAN MOI TU DAU (moi trang bi hoac disaster recovery) - truong hop do
rem phai chay tay theo dung thu tu: db\0000_auth_compat_shim.sql -> toan bo
rem supabase\migrations\*.sql (theo thu tu ten file, BO QUA file co "sandbox_exec"
rem vi day la role rieng cua Supabase) -> db\0001_bugfix_has_role_anon_grant.sql
rem -> db\0002_auth_tables.sql. Sau khi lam xong buoc do 1 lan, ghi
rem "0000_conscious_banshee.sql" vao file migrations/.applied tren VPS truoc khi
rem dung migrate.bat, vi file .sql do la ban snapshot trung voi bootstrap tren,
rem chay lai se loi "already exists".

rem ==== Cau hinh VPS (sua neu thay doi) ====
set VPS_HOST=221.132.19.75
set VPS_USER=root
set SSH_KEY=%USERPROFILE%\.ssh\lingoraenglish_vps
set REMOTE_DIR=/root/lingoraenglish-app
set DB_USER=lingora
set DB_NAME=lingoraenglish

echo.
echo === 1/4 Tao thu muc migrations tren VPS (neu chua co) ===
ssh -i "%SSH_KEY%" %VPS_USER%@%VPS_HOST% "mkdir -p %REMOTE_DIR%/migrations"
if errorlevel 1 (
  echo [LOI] Khong ket noi duoc VPS. Kiem tra mang/SSH key.
  exit /b 1
)

echo.
echo === 2/4 Copy toan bo file migration (.sql) va script ap dung len VPS ===
scp -i "%SSH_KEY%" src/db/schema/*.sql %VPS_USER%@%VPS_HOST%:%REMOTE_DIR%/migrations/
if errorlevel 1 (
  echo [LOI] Copy file migration that bai.
  exit /b 1
)
scp -i "%SSH_KEY%" scripts/remote-migrate.sh %VPS_USER%@%VPS_HOST%:%REMOTE_DIR%/
if errorlevel 1 (
  echo [LOI] Copy remote-migrate.sh that bai.
  exit /b 1
)
scp -i "%SSH_KEY%" docker-compose.yml %VPS_USER%@%VPS_HOST%:%REMOTE_DIR%/
if errorlevel 1 (
  echo [LOI] Copy docker-compose.yml that bai.
  exit /b 1
)

echo.
echo === 3/5 Dam bao Postgres dang chay ===
ssh -i "%SSH_KEY%" %VPS_USER%@%VPS_HOST% "cd %REMOTE_DIR% && docker compose up -d postgres"
if errorlevel 1 (
  echo [LOI] Khong khoi dong duoc Postgres - kiem tra bien POSTGRES_PASSWORD trong file .env tren VPS.
  exit /b 1
)

echo.
echo === 4/5 Cho Postgres san sang nhan ket noi ===
ssh -i "%SSH_KEY%" %VPS_USER%@%VPS_HOST% "for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do docker exec lingoraenglish-postgres pg_isready -U %DB_USER% -d %DB_NAME% >/dev/null 2>&1 && echo Postgres da san sang && exit 0; echo dang cho Postgres...; sleep 2; done; echo Postgres khong san sang sau 30s; exit 1"
if errorlevel 1 (
  echo [LOI] Postgres khong san sang kip thoi. Kiem tra log: ssh vao VPS roi chay docker logs lingoraenglish-postgres
  exit /b 1
)

echo.
echo === 5/5 Ap dung migration moi (bo qua migration da chay roi) ===
ssh -i "%SSH_KEY%" %VPS_USER%@%VPS_HOST% "cd %REMOTE_DIR% && DB_USER=%DB_USER% DB_NAME=%DB_NAME% sh remote-migrate.sh"
if errorlevel 1 (
  echo [LOI] Ap dung migration that bai. Xem log ben tren truoc khi thu lai.
  exit /b 1
)

echo.
echo ==== XONG. Database da duoc cap nhat migration moi nhat. ====
endlocal
