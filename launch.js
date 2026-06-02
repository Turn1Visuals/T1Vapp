// Launcher script — unsets ELECTRON_RUN_AS_NODE before spawning Electron
// This is needed when running from VSCode terminal which sets that env var
const { spawn } = require('child_process')
const path = require('path')

const env = Object.assign({}, process.env)
delete env.ELECTRON_RUN_AS_NODE

const electronPath = require('electron')
const child = spawn(electronPath, ['.'], { stdio: 'inherit', env, windowsHide: false })

child.on('close', (code) => process.exit(code || 0))
