// Ce fichier est lancé par Electron avec ELECTRON_RUN_AS_NODE=1
// Il démarre le serveur Next.js standalone en mode Node pur
const fs = require('fs')
const path = require('path')

const standaloneDir =
  process.env.IS_PACKAGED === '1'
    ? path.join(process.env.RESOURCES_PATH, 'standalone')
    : path.join(__dirname, '..', '.next', 'standalone')

// Charge la clé Albert embarquée au build (scripts/electron-prepare.mjs) sans
// dépendre du chargement .env implicite de Next ni des filtres de glob
// d'electron-builder sur les fichiers cachés.
function chargerEnv(fichier) {
  if (!fs.existsSync(fichier)) return
  const contenu = fs.readFileSync(fichier, 'utf-8')
  for (const ligne of contenu.split('\n')) {
    const trimmed = ligne.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    const cle = trimmed.slice(0, index).trim()
    const valeur = trimmed.slice(index + 1).trim()
    if (cle && !(cle in process.env)) {
      process.env[cle] = valeur
    }
  }
}

chargerEnv(path.join(standaloneDir, 'albert.env'))

process.chdir(standaloneDir)
require(path.join(standaloneDir, 'server.js'))
