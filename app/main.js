// FlyBreak — notch host. A transparent, click-through, always-on-top window hugging the notch.
// The brain (../brain/server.py) is spawned as a child process and talks to the renderer over ws.
const { app, BrowserWindow, screen, Tray, Menu, nativeImage, ipcMain } = require('electron');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

app.dock?.hide();

const W = 1000, H = 300;
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
  brainProc = spawn(py, [srv], { cwd: path.dirname(srv), stdio: ['ignore', 'pipe', 'pipe'] });
  brainProc.stdout.on('data', d => process.stdout.write('[brain] ' + d));
  brainProc.stderr.on('data', d => process.stderr.write('[brain] ' + d));
  brainProc.on('exit', c => console.log('[brain] exited', c));
}

app.whenReady().then(() => {
  const d = screen.getPrimaryDisplay();
  const notch = notchGeometry();
  win = new BrowserWindow({
    x: Math.round(d.bounds.x + notch.x + notch.w / 2 - W / 2), y: d.bounds.y, width: W, height: H,
    transparent: true, frame: false, enableLargerThanScreen: true, hasShadow: false, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, roundedCorners: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile('index.html', { query: { notchX: notch.x - (win.getBounds().x - d.bounds.x), notchW: notch.w, notchH: notch.h } });

  // Cursor-as-predator: the fly must see the cursor even when it is far from our window.
  setInterval(() => {
    if (win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint(), b = win.getBounds();
    win.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 16);

  const send = (ch, v) => !win.isDestroyed() && win.webContents.send(ch, v);
  tray = new Tray(nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAaklEQVQ4T2NkoBAwUqifYdQABkKBQFQYMDAw/CdVM7oBjOgaSDUEwwBSXYCiHt0FpLoCwwBSXICSDtBdQKorMAIRFxdgaEZ3AbGuwBmIRIdBRPYHSelQWH+hGoBNM1FpAacL0DUT7QJCXgAA5XosEfQb8AoAAAAASUVORK5CYII='));
  tray.setToolTip('FlyBreak');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Start focus (25 min)', click: () => send('cmd', 'focus') },
    { label: 'FlyBreak now (60 s)', click: () => send('cmd', 'break') },
    { label: 'Fly, free (demo)', click: () => send('cmd', 'free') },
    { label: 'Rest', click: () => send('cmd', 'rest') },
    { type: 'separator' },
    { label: 'Reset brain', click: () => send('cmd', 'resetBrain') },
    { label: 'Quit', click: () => app.quit() },
  ]));
  startBrain();
});

ipcMain.on('log', (_e, m) => console.log('[fly]', m));
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => brainProc?.kill());
