'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bj', {
  getState: () => ipcRenderer.invoke('bj:getState'),
  activate: (key) => ipcRenderer.invoke('bj:activate', key),
  deactivate: () => ipcRenderer.invoke('bj:deactivate'),
  consume: (sig) => ipcRenderer.invoke('bj:consume', sig),
  openCheckout: () => ipcRenderer.invoke('bj:openCheckout'),
  openCasino: (url) => ipcRenderer.invoke('bj:openCasino', url),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('bj:setAlwaysOnTop', flag),
  setMini: (flag) => ipcRenderer.invoke('bj:setMini', flag),
  onLiveAdvice: (cb) => ipcRenderer.on('bj:liveAdvice', (_e, payload) => cb(payload))
});
