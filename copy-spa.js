import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const distDir = path.join(__dirname, 'dist')
const indexHtmlPath = path.join(distDir, 'index.html')

if (!fs.existsSync(indexHtmlPath)) {
  console.error('dist/index.html not found! Build might have failed.')
  process.exit(1)
}

const indexContent = fs.readFileSync(indexHtmlPath, 'utf-8')

// 1. Generate 404.html (standard SPA fallback for static hosting)
fs.writeFileSync(path.join(distDir, '404.html'), indexContent, 'utf-8')

// 2. Pre-generate physical directories for clean URL serving
// This guarantees direct access on static servers (like Render) even if SPA rewrite rules are not yet configured in the dashboard
const routes = [
  'privacy-policy',
  'terms-and-conditions',
  'terms-conditions',
  'privacy',
  'terms',
  'login',
  'signup',
  'register',
  'dashboard',
  'courses',
  'course-details',
  'learning',
  'explore',
  'video-lesson',
]

for (const route of routes) {
  const targetDir = path.join(distDir, route)
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }
  fs.writeFileSync(path.join(targetDir, 'index.html'), indexContent, 'utf-8')
}

console.log('SPA fallback files and route directories successfully generated.')
