@echo off
echo Creating project structure...

:: Client Directories
mkdir "client\src\app"
mkdir "client\src\components"
mkdir "client\src\layouts"
mkdir "client\src\features"
mkdir "client\src\hooks"
mkdir "client\src\services"
mkdir "client\src\lib"
mkdir "client\src\styles"
mkdir "client\public"

:: Client Files
type nul > "client\src\app\App.jsx"
type nul > "client\src\app\router.jsx"
type nul > "client\src\styles\index.css"
type nul > "client\src\main.jsx"
type nul > "client\index.html"
type nul > "client\vite.config.js"
type nul > "client\package.json"
type nul > "client\.gitignore"

:: Server Directories
mkdir "server\src\config"
mkdir "server\src\middleware"
mkdir "server\src\modules\health"

:: Server Files
type nul > "server\src\config\env.js"
type nul > "server\src\config\database.js"
type nul > "server\src\config\redis.js"
type nul > "server\src\middleware\errorHandler.js"
type nul > "server\src\middleware\notFound.js"
type nul > "server\src\middleware\security.js"
type nul > "server\src\modules\health\health.controller.js"
type nul > "server\src\modules\health\health.routes.js"
type nul > "server\src\modules\health\health.service.js"
type nul > "server\src\app.js"
type nul > "server\src\server.js"
type nul > "server\.env"
type nul > "server\.env.example"
type nul > "server\.gitignore"
type nul > "server\package.json"

echo Structure created successfully!
pause