# Démarre l'environnement de développement complet :
#   PostgreSQL (Docker, port 5433) + API NestJS (3000) + frontend Vite (5173)
# Usage : .\start-dev.ps1        (depuis la racine du projet)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if (-not (Test-Path "$root\.env")) {
  Write-Host "Aucun .env : copiez .env.example en .env et renseignez les secrets (voir README §6)." -ForegroundColor Yellow
  exit 1
}

Write-Host "▶ PostgreSQL (docker compose)" -ForegroundColor Green
docker compose -f "$root\docker-compose.yml" up -d postgres | Out-Null

Write-Host "▶ Migrations Prisma" -ForegroundColor Green
Push-Location "$root\backend"; npx prisma migrate deploy | Out-Null; Pop-Location

Write-Host "▶ API NestJS  → http://localhost:3000/api  (Swagger : /api/docs)" -ForegroundColor Green
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\backend'; npm run start:dev"

Write-Host "▶ Frontend    → http://localhost:5173/connexion" -ForegroundColor Green
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "URL de connexion : http://localhost:5173/connexion" -ForegroundColor Cyan
Write-Host "Compte admin     : admin@declanaiss.local (mot de passe défini par SEED_PASSWORD au seed)"
