// Proceso principal de Electron para T5L Studio.
const { app, BrowserWindow, dialog, ipcMain, Menu, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { writeProject } = require('./project-file.cjs');
const { writePackage } = require('./package-files.cjs');

const isDev = process.env.VITE_DEV === '1';
const APP_URL = isDev ? 'http://localhost:5173/' : null;
const appIndex = () => require('node:url').pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;

/** Solo la página de la app puede usar el IPC. */
function trusted(e) {
  const url = e.senderFrame?.url ?? '';
  return isDev ? url.startsWith(APP_URL) : url.split(/[?#]/)[0] === appIndex();
}
function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!trusted(e)) throw new Error('Origen no permitido.');
    return fn(e, ...args);
  });
}

// Rutas de proyecto que el usuario eligió (diálogo, recientes o doble clic). save-project no escribe en otras.
const allowedProjects = new Set();
const allow = (p) => (allowedProjects.add(path.resolve(p)), p);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0f1115',
    title: 'T5L Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  // Sin navegación ni ventanas nuevas: la app es una sola página local.
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question', title: 'Cambios sin guardar',
      message: 'Hay cambios sin guardar. ¿Cerrar y descartarlos?',
      buttons: ['Seguir editando', 'Descartar y cerrar'],
      defaultId: 0, cancelId: 0, noLink: true,
    });
    if (choice === 1) event.preventDefault();
  });
  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Doble clic en un .dgusx: abrir ese proyecto al arrancar
  const fileArg = process.argv.slice(1).find((a) => /\.dgusx$/i.test(a));
  if (fileArg) {
    win.webContents.once('did-finish-load', async () => {
      try {
        win.webContents.send('open-file', { path: allow(fileArg), text: await fs.readFile(fileArg, 'utf8') });
      } catch {
        /* archivo no legible */
      }
    });
  }

  // Prueba de humo: DGUS_SMOKE=1 carga la app sin mostrarla, comprueba que montó y sale.
  if (process.env.DGUS_SMOKE === '1') {
    win.hide();
    let cspErrors = 0;
    win.webContents.on('console-message', (e) => {
      if (/Content Security Policy/i.test(e.message ?? '')) cspErrors++;
    });
    win.webContents.on('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 1500));
      const result = await win.webContents.executeJavaScript(
        `window.dgus.recentList().then((r) => JSON.stringify({ electron: !!window.dgus, ipc: Array.isArray(r), csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'), cspErrors: ${cspErrors}, welcome: !!document.querySelector('.welcome'), tools: document.querySelectorAll('.tb-item').length, controls: document.querySelectorAll('.screen .ctl').length, project: document.querySelector('.project-name')?.textContent ?? '' }))`,
      );
      console.log('SMOKE', result);
      // DGUS_SMOKE_SCRIPT: archivo con una expresión JS (puede ser una promesa) para probar flujos en la app real.
      if (process.env.DGUS_SMOKE_SCRIPT) {
        try {
          const code = await fs.readFile(process.env.DGUS_SMOKE_SCRIPT, 'utf8');
          console.log('SMOKE_SCRIPT', JSON.stringify(await win.webContents.executeJavaScript(code)));
        } catch (e) {
          console.log('SMOKE_SCRIPT_FAIL', e.message);
        }
        console.log('SMOKE_CSP', cspErrors);
      }
      app.exit(0);
    });
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      console.log('SMOKE_FAIL', code, desc);
      app.exit(1);
    });
  }
}

// ---- Proyectos recientes: los guarda el proceso principal y solo admite rutas elegidas en diálogos.
const recentFile = () => path.join(app.getPath('userData'), 'recientes.json');
async function readRecent() {
  try {
    const list = JSON.parse(await fs.readFile(recentFile(), 'utf8'));
    return Array.isArray(list) ? list.filter((x) => typeof x?.path === 'string').slice(0, 10) : [];
  } catch {
    return [];
  }
}
async function addRecent(filePath) {
  const list = (await readRecent()).filter((x) => x.path !== filePath);
  list.unshift({ path: filePath, name: path.basename(filePath, path.extname(filePath)), time: Date.now() });
  try {
    await fs.writeFile(recentFile(), JSON.stringify(list.slice(0, 10), null, 2), 'utf8');
  } catch {
    /* sin permiso de escritura: la lista no es crítica */
  }
}
handle('recent-list', async () => readRecent());
handle('open-recent', async (_e, filePath) => {
  const list = await readRecent();
  if (typeof filePath !== 'string' || !list.some((x) => x.path === filePath)) return null;
  allow(filePath);
  try {
    const text = await fs.readFile(filePath, 'utf8');
    await addRecent(filePath);
    return { path: filePath, text };
  } catch {
    return { path: filePath, text: null };
  }
});
handle('save-file', async (_e, name, data) => {
  if (typeof data !== 'string' && !(data instanceof Uint8Array) && !(data instanceof ArrayBuffer)) throw new Error('Datos no válidos.');
  const ext = path.extname(String(name)).slice(1) || '*';
  const r = await dialog.showSaveDialog({ title: 'Guardar archivo', defaultPath: path.basename(String(name)), filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, typeof data === 'string' ? data : Buffer.from(data));
  return r.filePath;
});

const IMAGE_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.bmp': 'image/bmp' };

handle('open-project', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Abrir proyecto',
    filters: [{ name: 'Proyecto T5L Studio', extensions: ['dgusx', 'json'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const text = await fs.readFile(r.filePaths[0], 'utf8');
  await addRecent(r.filePaths[0]);
  return { path: allow(r.filePaths[0]), text };
});

handle('save-project', async (_e, filePath, text) => {
  if (typeof text !== 'string') throw new Error('Proyecto no válido.');
  let target = typeof filePath === 'string' && allowedProjects.has(path.resolve(filePath)) ? filePath : null;
  if (!target) {
    const r = await dialog.showSaveDialog({
      title: 'Guardar proyecto',
      filters: [{ name: 'Proyecto T5L Studio', extensions: ['dgusx'] }],
    });
    if (r.canceled || !r.filePath) return null;
    target = allow(r.filePath);
  }
  await writeProject(target, text);
  await addRecent(target);
  return target;
});

handle('export-files', async (_e, files) => {
  if (!Array.isArray(files) || files.some((f) => typeof f?.name !== 'string' || !(f.data instanceof Uint8Array || f.data instanceof ArrayBuffer || Array.isArray(f.data)))) throw new Error('Archivos no válidos.');
  const r = await dialog.showOpenDialog({
    title: 'Elegir carpeta de salida (se creará DWIN_SET dentro)',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return writePackage(r.filePaths[0], files);
});

handle('open-images', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Importar imágenes de fondo',
    filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'bmp'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (r.canceled) return [];
  const out = [];
  for (const p of r.filePaths) {
    const ext = path.extname(p).toLowerCase();
    const mime = IMAGE_EXT[ext] || 'application/octet-stream';
    const buf = await fs.readFile(p);
    out.push({ name: path.basename(p), dataUrl: `data:${mime};base64,${buf.toString('base64')}` });
  }
  return out;
});

handle('open-folder', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Elegir la carpeta del proyecto DGUS o su carpeta DWIN_SET',
    properties: ['openDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  let dir = r.filePaths[0];
  const sub = path.join(dir, 'DWIN_SET');
  try {
    if ((await fs.stat(sub)).isDirectory()) dir = sub;
  } catch {
    /* la carpeta elegida ya es DWIN_SET */
  }
  const files = [];
  for (const name of await fs.readdir(dir)) {
    const full = path.join(dir, name);
    const st = await fs.stat(full);
    if (!st.isFile() || st.size > 64 * 1024 * 1024) continue;
    files.push({ name, data: new Uint8Array(await fs.readFile(full)) });
  }
  const parent = path.basename(path.dirname(dir));
  const projectDir = path.basename(dir).toUpperCase() === 'DWIN_SET' ? path.dirname(dir) : dir;
  const metadata = [];
  let metadataBytes = 0;
  const addMetadata = async (full, name) => {
    const st = await fs.stat(full);
    if (!st.isFile() || st.size > 32 * 1024 * 1024 || metadataBytes + st.size > 64 * 1024 * 1024 || metadata.length >= 4094) return;
    const data = new Uint8Array(await fs.readFile(full));
    metadataBytes += data.length; metadata.push({ name, data });
  };
  for (const name of ['DWprj.hmi', 'DWprj.tft']) {
    const full = path.join(projectDir, name);
    try { await addMetadata(full, name); } catch { /* opcional */ }
  }
  try {
    for (const entry of await fs.readdir(path.join(projectDir, 'TFT'), { withFileTypes: true })) {
      if (!entry.isFile() || !/\.tft$/i.test(entry.name) || metadata.length >= 4094) continue;
      await addMetadata(path.join(projectDir, 'TFT', entry.name), `TFT/${entry.name}`);
    }
  } catch { /* no hay documentos TFT originales */ }
  return { folder: path.basename(dir).toUpperCase() === 'DWIN_SET' ? parent : path.basename(dir), files, metadata };
});

// ---- Puerto serie (Web Serial). La app muestra su propio selector de puertos.
let pendingPortChoice = null;
function setupSerial() {
  const ses = session.defaultSession;
  ses.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    if (pendingPortChoice) pendingPortChoice('');
    pendingPortChoice = callback;
    webContents.send(
      'serial-port-list',
      portList.map((p) => ({ portId: p.portId, portName: p.portName, displayName: p.displayName, vendorId: p.vendorId, productId: p.productId })),
    );
  });
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'serial' || permission === 'clipboard-sanitized-write');
  ses.setDevicePermissionHandler((details) => details.deviceType === 'serial');
  // Cámara, micrófono, ubicación, notificaciones…: la app no los usa.
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'serial' || permission === 'clipboard-sanitized-write'));
}
ipcMain.on('serial-port-choose', (e, portId) => {
  if (!trusted(e)) return;
  if (pendingPortChoice) pendingPortChoice(typeof portId === 'string' ? portId : '');
  pendingPortChoice = null;
});

// Antes se llamaba «DGUS Studio»: se trae su lista de recientes la primera vez.
async function migrateRecent() {
  const legacy = path.join(app.getPath('appData'), 'DGUS Studio', 'recientes.json');
  try {
    await fs.access(recentFile());
  } catch {
    await fs.mkdir(path.dirname(recentFile()), { recursive: true }).catch(() => {});
    await fs.copyFile(legacy, recentFile()).catch(() => {});
  }
}

app.whenReady().then(async () => {
  await migrateRecent();
  setupSerial();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
