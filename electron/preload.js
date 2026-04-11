import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    on: (channel, func) => {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    },
    once: (channel, func) => {
      ipcRenderer.once(channel, (event, ...args) => func(...args));
    },
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  },
  getAppVersion: async () => ipcRenderer.invoke('get-app-version'),
  getAppPath: async () => ipcRenderer.invoke('get-app-path'),
});
