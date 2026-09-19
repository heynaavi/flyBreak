const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('notch', {
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
  onCommand: (cb) => ipcRenderer.on('cmd', (_e, c) => cb(c)),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, open) => cb(open)),
  log: (m) => ipcRenderer.send('log', m),
});
