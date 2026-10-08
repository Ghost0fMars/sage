// Prépare le build Next.js standalone pour l'empaquetage Electron.
// Lance : next build, puis copie .next/static et public/ dans .next/standalone/
//
// La clé Albert (.env.electron, non versionné) est copiée
// dans le dossier standalone pour être chargée automatiquement par Next au
// démarrage du serveur embarqué.
import { execSync } from 'child_process'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const electronEnvPath = join(root, '.env.electron')

if (!existsSync(electronEnvPath)) {
  console.error(
    '❌ .env.electron introuvable à la racine du projet.\n' +
    '   Créez-le à partir de .env.electron.example avec la clé ALBERT_API_KEY à embarquer dans l\'app desktop.'
  )
  process.exit(1)
}

if (!existsSync(join(root, 'public', 'carte', 'data', 'index.json'))) {
  console.error(
    '❌ Corpus des référentiels non indexé (public/carte/data/index.json absent).\n' +
    '   PDF dans public/carte/référentiels/, puis : npm run index-corpus (Python + pymupdf).'
  )
  process.exit(1)
}

console.log('▶ next build...')
execSync('npx next build', {
  stdio: 'inherit',
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_BUILD: 'true'
  }
})

const standaloneDir = join(root, '.next', 'standalone')
const staticSrc = join(root, '.next', 'static')
const staticDest = join(standaloneDir, '.next', 'static')
const publicSrc = join(root, 'public')
const publicDest = join(standaloneDir, 'public')

if (!existsSync(standaloneDir)) {
  console.error('❌ .next/standalone introuvable. Vérifiez que output: "standalone" est dans next.config.mjs')
  process.exit(1)
}

if (existsSync(staticDest)) rmSync(staticDest, { recursive: true })
cpSync(staticSrc, staticDest, { recursive: true })
console.log('✓ .next/static copié')

if (existsSync(publicDest)) rmSync(publicDest, { recursive: true })
cpSync(publicSrc, publicDest, { recursive: true })
console.log('✓ public/ copié')

// Nom sans point de tête : les patterns extraResources d'electron-builder
// (**/*) n'incluent pas toujours les fichiers cachés selon la plateforme.
// Chargé explicitement par electron/server-runner.js avant de démarrer le
// serveur (voir ce fichier) — on ne dépend pas du chargement .env implicite
// de Next, plus fragile à travers les mises à jour de version.
writeFileSync(join(standaloneDir, 'albert.env'), readFileSync(electronEnvPath))
console.log('✓ Clé Albert embarquée (albert.env)')

console.log('✓ Prêt pour electron-builder')
