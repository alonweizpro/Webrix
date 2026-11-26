'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (ch) => (fn) => {
  const h = (e, d) => fn(d);
  ipcRenderer.on(ch, h);
  return () => ipcRenderer.removeListener(ch, h);
};

contextBridge.exposeInMainWorld('webrix', {
  platform: process.platform,
  win: {
    min: () => ipcRenderer.send('win:min'),
    max: () => ipcRenderer.send('win:max'),
    close: () => ipcRenderer.send('win:close'),
    fullscreen: () => ipcRenderer.send('win:fullscreen'),
    onState: on('win:state')
  },
  config: { set: (patch) => ipcRenderer.invoke('config:set', patch) },
  metrics: () => ipcRenderer.invoke('metrics'),
  clearData: () => ipcRenderer.invoke('clear-data'),
  showDownload: (p) => ipcRenderer.send('dl:show', p),
  onShortcut: on('shortcut'),
  onOpenTab: on('tab:open'),
  onSearch: on('search'),
  onAdblock: on('adblock:count'),
  onDownload: on('dl'),
  perm: {
    answer: (id, allow, remember) => ipcRenderer.send('perm:answer', { id, allow, remember }),
    list: () => ipcRenderer.invoke('perm:list'),
    clear: () => ipcRenderer.invoke('perm:clear'),
    onAsk: on('perm:ask'),
    onCancel: on('perm:cancel')
  },
  update: {
    get: () => ipcRenderer.invoke('update:get'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.send('update:install'),
    onState: on('update:state')
  }
});
