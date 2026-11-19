const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dgus', {
  openProject: () => ipcRenderer.invoke('open-project'),
  saveProject: (path, text) => ipcRenderer.invoke('save-project', path, text),
  exportFiles: (files) => ipcRenderer.invoke('export-files', files),
  openImages: () => ipcRenderer.invoke('open-images'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  onSerialPorts: (cb) => {
    const h = (_e, list) => cb(list);
    ipcRenderer.on('serial-port-list', h);
    return () => ipcRenderer.removeListener('serial-port-list', h);
  },
  chooseSerialPort: (portId) => ipcRenderer.send('serial-port-choose', portId),
  onOpenFile: (cb) => ipcRenderer.on('open-file', (_e, f) => cb(f)),
  recentList: () => ipcRenderer.invoke('recent-list'),
  openRecent: (path) => ipcRenderer.invoke('open-recent', path),
  saveFile: (name, data) => ipcRenderer.invoke('save-file', name, data),
});
