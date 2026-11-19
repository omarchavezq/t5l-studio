// Capturas para el README: carga dist/ en Electron, abre el proyecto de ejemplo y guarda PNG en docs/img.
// Uso: npm run build && npx electron scripts/capture.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const example = fs.readFileSync(path.join(root, 'ejemplos', 'prueba-t5l.dgusx'), 'utf8');
const out = (n) => path.join(root, 'docs', 'img', n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 900, backgroundColor: '#0f1115', webPreferences: { offscreen: false } });
  await win.loadFile(path.join(root, 'dist', 'index.html'));
  await wait(1200);
  const js = (code) => win.webContents.executeJavaScript(code);
  const shot = async (name) => {
    await wait(700);
    await js(`document.querySelectorAll('.toast, .toasts > *').forEach((e) => e.remove())`);
    await wait(100);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(out(name), img.toPNG());
    console.log('CAPTURA', name, img.getSize());
  };

  // 1. Bienvenida (con dos recientes de muestra en el navegador)
  await shot('bienvenida.png');

  // 2. Editor con el proyecto de ejemplo: se abre como lo haría «Abrir proyecto»
  await js(`(async () => {
    const text = ${JSON.stringify(example)};
    const file = new File([text], 'prueba-t5l.dgusx', { type: 'application/json' });
    window.__dgusFile = file;
    const orig = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') {
        Object.defineProperty(this, 'files', { value: [window.__dgusFile] });
        this.dispatchEvent(new Event('change', { bubbles: true }));
        HTMLInputElement.prototype.click = orig;
        return;
      }
      return orig.call(this);
    };
    [...document.querySelectorAll('button')].find((b) => /Abrir proyecto/.test(b.textContent)).click();
  })()`);
  await wait(1200);
  await js(`(() => {
    const c = [...document.querySelectorAll('.screen .ctl')].find((e) => /Valor|Temperatura|Número/i.test(e.title)) ?? document.querySelectorAll('.screen .ctl')[2];
    const r = c.getBoundingClientRect(), o = { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, button: 0, pointerId: 1 };
    c.dispatchEvent(new PointerEvent('pointerdown', o)); window.dispatchEvent(new PointerEvent('pointerup', o));
  })()`);
  await shot('editor.png');

  // 3. Simulación
  await js(`[...document.querySelectorAll('button')].find((b) => /Simular/.test(b.textContent)).click()`);
  await wait(300);
  await js(`[...document.querySelectorAll('button')].find((b) => /Ocultar zonas/.test(b.textContent))?.click()`);
  await shot('simulador.png');
  app.exit(0);
});
