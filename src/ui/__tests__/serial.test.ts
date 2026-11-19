// Puerto serie con un puerto falso que imita la pantalla: respuestas inmediatas, partidas,
// con CRC dañado o ausentes.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crc16Modbus } from '../../core/icl';
import { connect, disconnect, downloadFiles, readWatch, setLink, stopDownload, useComm, writeWatch } from '../comm';

type Script = (frame: Uint8Array, reply: (b: number[], delayMs?: number) => void) => void;

let script: Script = () => {};
let written: Uint8Array[] = [];

function installFakePort() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const readable = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) });
  const writable = new WritableStream<Uint8Array>({
    write(b) {
      written.push(b);
      // La respuesta puede encolarse antes de que write() termine (caso «inmediato»).
      script(b, (bytes, delay = 0) => {
        const send = () => ctrl.enqueue(Uint8Array.from(bytes));
        if (delay < 0) send();
        else setTimeout(send, delay);
      });
    },
  });
  Object.defineProperty(globalThis.navigator, 'serial', {
    configurable: true,
    value: { requestPort: async () => ({ open: async () => {}, close: async () => {}, readable, writable, getInfo: () => ({}) }) },
  });
}

const withCrc = (body: number[]) => {
  const c = crc16Modbus(Uint8Array.from(body));
  return [0x5a, 0xa5, body.length + 2, ...body, c & 0xff, c >> 8];
};

beforeEach(async () => {
  written = [];
  script = () => {};
  setLink({ header: [0x5a, 0xa5], crc: false });
  installFakePort();
  useComm.setState({ log: [] });
  await connect();
});
afterEach(async () => {
  await disconnect();
});

const watch = { vp: '5000', type: 0, label: '', value: '' };

describe('puerto serie', () => {
  it('respuesta inmediata (antes de terminar la escritura)', async () => {
    script = (f, reply) => f[3] === 0x83 && reply([0x5a, 0xa5, 0x06, 0x83, 0x50, 0x00, 0x01, 0x01, 0x2c], -1);
    useComm.setState({ watches: [watch] });
    expect(await readWatch(useComm.getState().watches[0])).toBe(true);
    expect(useComm.getState().watches[0].value).toBe('300');
  });

  it('respuesta partida en varios trozos', async () => {
    script = (f, reply) => {
      if (f[3] !== 0x83) return;
      reply([0x5a, 0xa5, 0x06, 0x83], 5);
      reply([0x50, 0x00, 0x01], 15);
      reply([0x00, 0x07], 25);
    };
    useComm.setState({ watches: [watch] });
    expect(await readWatch(useComm.getState().watches[0])).toBe(true);
    expect(useComm.getState().watches[0].value).toBe('7');
  });

  it('descarta tramas con CRC incorrecto y reintenta', async () => {
    setLink({ header: [0x5a, 0xa5], crc: true });
    let n = 0;
    script = (f, reply) => {
      if (f[3] !== 0x83) return;
      const good = withCrc([0x83, 0x50, 0x00, 0x01, 0x00, 0x2a]);
      if (n++ === 0) good[good.length - 1] ^= 0xff; // primera respuesta dañada
      reply(good, 5);
    };
    useComm.setState({ watches: [watch] });
    expect(await readWatch(useComm.getState().watches[0])).toBe(true);
    expect(n).toBe(2);
    expect(useComm.getState().watches[0].value).toBe('42');
    expect(useComm.getState().log.some((e) => e.dir === 'err' && e.text.includes('CRC incorrecto'))).toBe(true);
  });

  it('sin respuesta: reintenta y lo indica', async () => {
    useComm.setState({ watches: [watch] });
    expect(await readWatch(useComm.getState().watches[0])).toBe(false);
    expect(written.filter((w) => w[3] === 0x83)).toHaveLength(3); // 1 intento + 2 reintentos
    expect(useComm.getState().watches[0].value).toBe('sin respuesta');
  });

  it('escritura sin confirmación: no se repite', async () => {
    expect(await writeWatch(watch, '5')).toBe(false);
    expect(written.filter((w) => w[3] === 0x82)).toHaveLength(1);
  });

  it('las operaciones no se mezclan: lecturas en cola', async () => {
    const order: number[] = [];
    script = (f, reply) => {
      if (f[3] !== 0x83) return;
      order.push(f[4]);
      reply([0x5a, 0xa5, 0x06, 0x83, f[4], f[5], 0x01, 0x00, f[4]], 20);
    };
    const a = { ...watch, vp: '5000' };
    const b = { ...watch, vp: '6000' };
    useComm.setState({ watches: [a, b] });
    const [ra, rb] = await Promise.all([readWatch(a), readWatch(b)]);
    expect([ra, rb]).toEqual([true, true]);
    expect(order).toEqual([0x50, 0x60]);
  });

  it('descarga con respuesta inmediata a la petición de sector', async () => {
    let expecting = 0;
    const got: number[] = [];
    script = (f, reply) => {
      if (expecting > 0) {
        expecting -= f.length;
        got[got.length - 1] += f.length;
        return;
      }
      if (f[3] === 0x8f) {
        got.push(0);
        expecting = f[5] === 13 ? 1000 : 2000;
        reply([0x4f, 0x4b], -1);
      }
    };
    await downloadFiles([
      { name: '13TouchFile.bin', data: new Uint8Array(1000) },
      { name: '14ShowFile.bin', data: new Uint8Array(2000) },
    ]);
    const d = useComm.getState().download!;
    expect(d.running).toBe(false);
    expect(d.done).toBe(2);
    expect(got).toEqual([1000, 2000]);
  }, 10000);

  it('cancelar la descarga deja la conexión utilizable', async () => {
    script = (f, reply) => {
      if (f[3] === 0x8f) {
        reply([0x4f, 0x4b], -1);
        setTimeout(stopDownload, 5);
      }
      if (f.length === 7 && f[3] === 0x83) reply([0x5a, 0xa5, 0x06, 0x83, 0x50, 0x00, 0x01, 0x00, 0x09], 5);
    };
    await downloadFiles([{ name: '32.icl', data: new Uint8Array(600 * 1024) }]);
    const d = useComm.getState().download!;
    expect(d.running).toBe(false);
    expect(d.done).toBeLessThan(d.total);
    useComm.setState({ watches: [watch] });
    expect(await readWatch(useComm.getState().watches[0])).toBe(true);
  }, 10000);
});
