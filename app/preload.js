const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('notch', {
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
  onCommand: (cb) => ipcRenderer.on('cmd', (_e, c) => cb(c)),
  log: (m) => ipcRenderer.send('log', m),
});
