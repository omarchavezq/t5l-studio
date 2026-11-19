const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// El original permanece intacto si falla la escritura del temporal o su reemplazo.
async function writeProject(target, text) {
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  let handle;
  let created = false;
  try {
    handle = await fs.open(temp, 'wx');
    created = true;
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temp, target);
  } finally {
    await handle?.close();
    if (created) await fs.unlink(temp).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

module.exports = { writeProject };
