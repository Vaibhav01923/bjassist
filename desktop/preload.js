'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bj', {
  getState: () => ipcRenderer.invoke('bj:getState'),
  activate: (key) => ipcRenderer.invoke('bj:activate', key),
  deactivate: () => ipcRenderer.invoke('bj:deactivate'),
  consume: (sig) => ipcRenderer.invoke('bj:consume', sig),
  openCheckout: () => ipcRenderer.invoke('bj:openCheckout'),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('bj:setAlwaysOnTop', flag)
});
