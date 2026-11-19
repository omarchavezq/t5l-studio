// Genera build/icon.png (1024 px) dibujándolo con un canvas en una ventana oculta de Electron.
// Uso: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const html = `<canvas id="c" width="1024" height="1024"></canvas><script>
const c = document.getElementById('c'), g = c.getContext('2d');
const r = (x, y, w, h, rad) => { g.beginPath(); g.roundRect(x, y, w, h, rad); };
// fondo con degradado
const grad = g.createLinearGradient(0, 0, 1024, 1024);
grad.addColorStop(0, '#4f8cff'); grad.addColorStop(1, '#8b5cf6');
r(48, 48, 928, 928, 210); g.fillStyle = grad; g.fill();
// pantalla
r(190, 250, 644, 430, 46); g.fillStyle = '#0f1115'; g.fill();
r(222, 282, 580, 366, 26); g.fillStyle = '#1e2633'; g.fill();
// elementos de interfaz
g.fillStyle = '#3dd6a5'; r(262, 324, 250, 64, 14); g.fill();
g.fillStyle = '#ff8a3d'; r(262, 420, 160, 64, 14); g.fill();
g.fillStyle = '#4f8cff'; r(446, 420, 160, 64, 14); g.fill();
g.fillStyle = '#e6e9ef'; r(262, 520, 500, 24, 12); g.fill();
g.fillStyle = '#3dd6a5'; r(262, 520, 300, 24, 12); g.fill();
// soporte
g.fillStyle = '#0f1115'; r(452, 680, 120, 70, 8); g.fill(); r(352, 742, 320, 40, 20); g.fill();
document.title = c.toDataURL('image/png');
</script>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1100, height: 1100 });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const dataUrl = await win.webContents.executeJavaScript('document.title');
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('ICON', out, fs.statSync(out).size);
  app.exit(0);
});
