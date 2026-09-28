// Prépare le build Next.js standalone pour l'empaquetage Electron.
// Lance : next build, puis copie .next/static et public/ dans .next/standalone/
//
// L'application desktop tourne toujours en mode 100 % local : aucune variable
// NEXT_PUBLIC_SUPABASE_* n'est transmise au build (même si .env.local en définit,
// pour du développement web), donc aucun écran de connexion n'apparaît jamais
// dans l'app packagée. La clé Albert (.env.electron, non versionné) est copiée
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

console.log('▶ next build (mode local — Supabase désactivé)...')
execSync('npx next build', {
  stdio: 'inherit',
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_BUILD: 'true',
    // Force le mode local dans le build packagé, quoi que .env.local définisse
    // par ailleurs pour le développement web avec synchronisation cloud.
    NEXT_PUBLIC_SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ''
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
