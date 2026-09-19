// FlyBreak — notch host. A transparent, click-through, always-on-top window hugging the notch.
// The brain (../brain/server.py) is spawned as a child process and talks to the renderer over ws.
const { app, BrowserWindow, screen, Tray, Menu, nativeImage, ipcMain } = require('electron');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

app.dock?.hide();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win, tray, brainProc;

// Notch geometry in points, from NSScreen (cached). Falls back to the 16" M1 Pro layout.
function notchGeometry() {
  const cache = path.join(app.getPath('userData'), 'notch.json');
  try { return JSON.parse(fs.readFileSync(cache, 'utf8')); } catch {}
  let g = { x: 771.5, w: 185, h: 32 };
  try {
    const out = execFileSync('swift', [path.join(__dirname, 'notch.swift')], { timeout: 20000 }).toString();
    const m = out.match(/notch (\S+) (\S+) (\S+)/);
    if (m) g = { x: +m[1], w: +m[2], h: +m[3] };
  } catch (e) { console.log('notch probe failed, using default', e.message); }
  try { fs.writeFileSync(cache, JSON.stringify(g)); } catch {}
  return g;
}

function startBrain() {
  const py = path.join(__dirname, '..', 'brain', 'engine', '.venv', 'bin', 'python');
  const srv = path.join(__dirname, '..', 'brain', 'server.py');
  if (!fs.existsSync(py)) { console.log('brain venv missing; run without brain'); return; }
  brainProc = spawn(py, ['-u', srv], { cwd: path.dirname(srv), stdio: ['ignore', 'pipe', 'pipe'] });
  brainProc.stdout.on('data', d => process.stdout.write('[brain] ' + d));
  brainProc.stderr.on('data', d => process.stderr.write('[brain] ' + d));
  brainProc.on('exit', c => console.log('[brain] exited', c));
}

app.whenReady().then(() => {
  const d = screen.getPrimaryDisplay();
  const notch = notchGeometry();
  // full display, so the fly owns the whole screen and the break can dim it
  const W = d.bounds.width, H = d.bounds.height;
  win = new BrowserWindow({
    x: d.bounds.x, y: d.bounds.y, width: W, height: H,
    transparent: true, frame: false, enableLargerThanScreen: true, hasShadow: false, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, roundedCorners: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile('index.html', { query: { notchX: notch.x, notchW: notch.w, notchH: notch.h, w: W, h: H } });

  // Cursor-as-predator: the fly must see the cursor even when it is far from our window.
  setInterval(() => {
    if (win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint(), b = win.getBounds();
    win.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 16);

  const send = (ch, v) => !win.isDestroyed() && win.webContents.send(ch, v);
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('🪰');
  tray.setToolTip('FlyBreak');
  const menu = Menu.buildFromTemplate([
    { label: 'Start focus (25 min)', click: () => send('cmd', 'focus') },
    { label: 'FlyBreak now (60 s)', click: () => send('cmd', 'break') },
    { label: 'Fly, free (demo)', click: () => send('cmd', 'free') },
    { label: 'Rest', click: () => send('cmd', 'rest') },
    { type: 'separator' },
    { label: 'Reset brain', click: () => send('cmd', 'resetBrain') },
    { label: 'Quit', click: () => app.quit() },
  ]);
  // no setContextMenu: pop it ourselves so the renderer can lift the stage darkness while it is open
  tray.on('click', () => { send('menu', true); tray.popUpContextMenu(menu); send('menu', false); });
  tray.on('right-click', () => { send('menu', true); tray.popUpContextMenu(menu); send('menu', false); });
  startBrain();
});

ipcMain.on('log', (_e, m) => console.log('[fly]', m));
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => brainProc?.kill());
