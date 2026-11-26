'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fx', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  resetSessions: () => ipcRenderer.invoke('settings:reset-sessions'),
  hide: () => ipcRenderer.send('win:hide'),
  openSettings: () => ipcRenderer.send('win:open-settings'),
  resize: (width) => ipcRenderer.send('win:resize', width),
  quit: () => ipcRenderer.send('win:quit'),
  popupMenu: () => ipcRenderer.send('menu:popup'),
  onSettings: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),
  onVisibility: (cb) => ipcRenderer.on('visibility', (_e, v) => cb(v)),
  onTickNow: (cb) => ipcRenderer.on('tick-now', () => cb()),
});
