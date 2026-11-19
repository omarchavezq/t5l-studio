const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Cada salida tiene un DWIN_SET nuevo. Nunca se mezclan restos de una generación anterior.
async function writePackage(parent, files) {
  const names = new Set();
  for (const f of files) {
    if (!f.name || /[\\/:*?"<>|\x00-\x1f]/.test(f.name) || /[. ]$/.test(f.name) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(f.name)) throw new Error('Nombre de archivo de salida no válido.');
    if (names.has(f.name.toLowerCase())) throw new Error('Archivo de salida repetido.');
    names.add(f.name.toLowerCase());
  }
  let target = path.join(path.resolve(parent), 'DWIN_SET');
  try {
    await fs.mkdir(target);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const wrapper = await fs.mkdtemp(path.join(path.resolve(parent), 'DGUS-'));
    target = path.join(wrapper, 'DWIN_SET');
    await fs.mkdir(target);
  }
  try {
    for (const f of files) await fs.writeFile(path.join(target, f.name), Buffer.from(f.data), { flag: 'wx' });
    return target;
  } catch (e) {
    // Una escritura incompleta no queda presentada como carpeta lista para SD.
    await fs.rename(target, `${target}.incompleto-${randomUUID()}`).catch(() => {});
    throw e;
  }
}

module.exports = { writePackage };
