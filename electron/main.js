const { app, BrowserWindow, Notification, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

// ⚠️ NE JAMAIS CHANGER sans plan de migration : PORT, ainsi que `productName` et
// `appId` dans package.json. Toutes les données de l'enseignant (séances, séquences,
// élèves, réglages, clé Albert) vivent dans le localStorage de l'origine
// http://127.0.0.1:3721, rangé dans le dossier userData (%APPDATA%\Sage sous Windows,
// ~/.config/Sage sous Linux) dérivé de productName. Modifier l'une de ces valeurs
// fait « disparaître » toutes les données après une mise à jour automatique.
// Filet de sécurité : Paramètres › Sauvegarde de mes données (export/import JSON).
const PORT = 3721
let mainWindow = null
let serverProcess = null

function waitForServer() {
  return new Promise((resolve) => {
    const started = Date.now()
    const interval = setInterval(() => {
      const req = http.get(`http://127.0.0.1:${PORT}`, () => {
        clearInterval(interval)
        resolve()
      })
      req.on('error', () => {})
      req.end()
      if (Date.now() - started > 30000) {
        clearInterval(interval)
        resolve()
      }
    }, 400)
  })
}

function startServer() {
  const runnerPath = path.join(__dirname, 'server-runner.js')
  serverProcess = spawn(process.execPath, [runnerPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      IS_PACKAGED: '1',
      RESOURCES_PATH: process.resourcesPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  serverProcess.stdout?.on('data', (d) => process.stdout.write('[sage] ' + d))
  serverProcess.stderr?.on('data', (d) => process.stderr.write('[sage] ' + d))

  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[sage] Server exited with code ${code}`)
    }
  })
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Sage',
    // L'exe Windows porte déjà l'icône (electron-builder) ; nécessaire sous Linux.
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'standalone', 'public', 'icons', 'icon-512.png')
      : path.join(__dirname, '..', 'public', 'icons', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  })

  // Ouvrir les liens externes dans le navigateur par défaut
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${PORT}`)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`) && !url.startsWith('http://localhost:')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })

  if (app.isPackaged) {
    startServer()
    await waitForServer()
    mainWindow.loadURL(`http://127.0.0.1:${PORT}`)
  } else {
    // Mode développement : Next.js tourne déjà via 'next dev'
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools()
  }
}

// Mises à jour automatiques : electron-updater lit latest.yml (Windows) ou
// latest-linux.yml (AppImage) sur le registre de paquets de la Forge (voir
// build.publish dans package.json et le job build de .gitlab-ci.yml), télécharge
// la nouvelle version en arrière-plan et l'installe à la fermeture de l'app.
function verifierMisesAJour() {
  autoUpdater.on('error', (err) => console.error('[sage] Mise à jour :', err?.message ?? err))
  autoUpdater.on('update-downloaded', ({ version }) => {
    if (!Notification.isSupported()) return
    new Notification({
      title: `Sage ${version} est prête`,
      body: "La mise à jour s'installera à la fermeture de Sage.",
    }).show()
  })
  // Hors ligne ou Forge injoignable : on réessaiera au prochain lancement.
  autoUpdater.checkForUpdates().catch(() => {})
}

if (process.platform === 'win32') app.setAppUserModelId('com.alacle.sage')

app.whenReady().then(() => {
  createWindow()
  if (app.isPackaged) verifierMisesAJour()
})

app.on('window-all-closed', () => {
  serverProcess?.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  serverProcess?.kill()
})

app.on('activate', () => {
  if (!mainWindow) createWindow()
})
