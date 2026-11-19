import { useEffect, useMemo, useRef, useState } from 'react';
import { FileType2, Upload } from 'lucide-react';
import { toBase64 } from '../../core/bytes';
import { ASC_MAX, ASC_MIN, CHARSETS, codesFor } from '../../core/fonts';
import { DEFAULT_RENDER, generateFont, loadFontFile, makeRenderer, systemFonts, type RenderOptions } from '../fontRender';
import type { FontJob } from '../fontBuild';
import { exportFiles } from '../platform';
import { useStore } from '../store';
import { toast } from '../toast';

type Kind = 'ascii0' | 'gray' | 'grayAscii' | 'fixed';
type FixedKind = 'byte' | 'gb2312' | 'unicode';

const KINDS: { value: Kind; label: string; help: string }[] = [
  { value: 'ascii0', label: 'ASCII 0# (variables numéricas, RTC, HEX)', help: 'Todos los anchos de 4 a 64 px en un solo archivo (3 MB). Es la librería 0 por defecto: 0_DWIN_ASC.HZK.' },
  { value: 'gray', label: 'Unicode en grises (Texto DGUS II)', help: 'Bordes suavizados a 16 niveles y ancho proporcional. Formato de UnicodeGrayFont de DWIN.' },
  { value: 'grayAscii', label: 'ASCII en grises de 4 / 8 bits (fontbit4)', help: 'Formato ASCII de fontbit4: caracteres ! a ~, espacio y saltos. Para Texto DGUS II con codificación ASCII; reproducción física pendiente.' },
  { value: 'fixed', label: 'Mapa de bits fijo (control Texto)', help: 'Un solo tamaño a 1 bit. Formato según el manual de DGUS II: verifíquelo en la pantalla.' },
];

/** Recoge los caracteres usados en textos iniciales y unidades del proyecto. */
function projectChars(): string {
  const set = new Set<string>();
  for (const p of useStore.getState().project.pages)
    for (const c of p.controls) for (const k of ['init', 'unit', 'format']) for (const ch of String(c.props[k] ?? '')) set.add(ch);
  return [...set].join('');
}

export function FontDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('ascii0');
  const [fonts, setFonts] = useState<string[]>([]);
  const [opt, setOpt] = useState<RenderOptions>(DEFAULT_RENDER);
  const [threshold, setThreshold] = useState(110);
  const [fileId, setFileId] = useState(1);
  const [sample, setSample] = useState('Temp: 123.5°C  ABCabc');
  const [previewW, setPreviewW] = useState(24);
  const [gw, setGw] = useState(24);
  const [gh, setGh] = useState(32);
  const [fixedKind, setFixedKind] = useState<FixedKind>('unicode');
  const [grayBits, setGrayBits] = useState<4 | 8>(4);
  const [sets, setSets] = useState<string[]>(['latin1', 'symbols']);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    systemFonts().then((f) => setFonts(f));
  }, []);
  useEffect(() => {
    setFileId(kind === 'ascii0' ? 1 : kind.startsWith('gray') ? 40 : 60);
    if (kind.startsWith('gray')) setOpt((o) => ({ ...o, scale: 0.8, baseline: 0.8, align: 'left' }));
    else setOpt((o) => ({ ...o, scale: kind === 'ascii0' ? 0.72 : 0.85, baseline: kind === 'ascii0' ? 0.78 : 0.85, align: 'center' }));
  }, [kind]);

  const render = useMemo(() => makeRenderer(opt), [opt]);
  const codes = useMemo(() => codesFor(sets, extra), [sets, extra]);
  const fileName = kind === 'ascii0' ? `${fileId}_DWIN_ASC.HZK` : kind === 'gray' ? `${fileId}_DGUS2.DZK` : kind === 'grayAscii' ? `${fileId}_DGUS2_ASC_${grayBits}b.DZK` : `${fileId}_${fixedKind.toUpperCase()}_${gw}x${gh}.DZK`;

  // Vista previa: el texto dibujado tal como quedará en la librería
  useEffect(() => {
    const c = preview.current;
    if (!c) return;
    const w = kind === 'ascii0' ? previewW : gw;
    const h = kind === 'ascii0' ? previewW * 2 : gh;
    const text = kind === 'ascii0' || kind === 'grayAscii' ? sample.replace(/[^\x20-\x7e]/g, '?') : sample;
    const zoom = Math.max(1, Math.min(4, Math.floor(560 / Math.max(1, text.length * w))));
    c.width = Math.max(1, text.length * w);
    c.height = h;
    c.style.width = `${c.width * zoom}px`;
    c.style.height = `${h * zoom}px`;
    const g = c.getContext('2d')!;
    const img = g.createImageData(c.width, h);
    let x0 = 0;
    for (const ch of text) {
      const gl = render(ch.codePointAt(0)!, w, h);
      let used = w;
      if (kind === 'gray') {
        let last = 0;
        let first = w;
        for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (gl[y * w + x] >= 16) (first = Math.min(first, x)), (last = x);
        used = ch === ' ' ? Math.floor(w / 4) : first <= last ? last - first + 2 : w / 3;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const v = gl[y * w + Math.min(w - 1, x + (first <= last ? first : 0))] & 0xf0;
            const p = (y * c.width + x0 + x) * 4;
            if (x0 + x < c.width) img.data.set([v, v, v, 255], p);
          }
      } else if (kind === 'grayAscii') {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const v = ch === ' ' ? 0 : grayBits === 4 ? (gl[y * w + x] >> 4) * 17 : gl[y * w + x];
          img.data.set([v, v, v, 255], (y * c.width + x0 + x) * 4);
        }
        used = ch === ' ' ? Math.floor(w / 2) : w;
      } else {
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const v = gl[y * w + x] >= threshold ? 255 : 0;
            img.data.set([v, v, v, 255], (y * c.width + x0 + x) * 4);
          }
      }
      x0 += Math.round(used);
    }
    g.putImageData(img, 0, 0);
  }, [render, kind, sample, previewW, gw, gh, threshold, grayBits]);

  const running = useRef<AbortController | null>(null);
  const [working, setWorking] = useState(false);
  const generate = async (): Promise<Uint8Array | null> => {
    const abort = new AbortController();
    running.current = abort;
    setWorking(true);
    setBusy('Generando…');
    try {
      const t0 = performance.now();
      const job: FontJob = { kind, fixedKind, codes, gw, gh, threshold, grayBits, fileId };
      const data = await generateFont(job, opt, (done, total) => setBusy(`Generando… ${Math.min(99, Math.round((done * 100) / Math.max(1, total)))} %`), abort.signal);
      setBusy(`Listo: ${fileName} · ${Math.round(data.length / 1024)} KB en ${Math.round(performance.now() - t0)} ms`);
      return data;
    } catch (e) {
      setBusy(abort.signal.aborted ? 'Cancelado.' : null);
      if (!abort.signal.aborted) toast((e as Error).message, 'error');
      return null;
    } finally {
      running.current = null;
      setWorking(false);
    }
  };
  const cancel = () => running.current?.abort();
  const close = () => (cancel(), onClose());

  const addToProject = async () => {
    const data = await generate();
    if (!data) return;
    useStore.getState().mutate((d) => {
      d.extraFiles ??= {};
      for (const n of Object.keys(d.extraFiles)) if (new RegExp(`^${fileId}[_.]`).test(n) && /\.(hzk|dzk)$/i.test(n)) delete d.extraFiles[n];
      d.extraFiles[fileName] = toBase64(data);
    });
    toast(`${fileName} añadido al proyecto: se exportará con DWIN_SET`);
  };

  const saveFile = async () => {
    const data = await generate();
    if (data) await exportFiles([{ name: fileName, data }]);
  };

  const set = <K extends keyof RenderOptions>(k: K, v: RenderOptions[K]) => setOpt((o) => ({ ...o, [k]: v }));
  const k = KINDS.find((x) => x.value === kind)!;
  const fontFile = useRef<HTMLInputElement>(null);

  return (
    <div className="overlay" onPointerDown={close}>
      <div className="dialog font-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <h2>
          <FileType2 size={18} style={{ verticalAlign: -3 }} /> Generador de fuentes
        </h2>
        <div className="sub">{k.help}</div>
        <div className="font-grid">
          <div className="body">
            <label>
              Tipo de librería
              <select className="field" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {KINDS.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipografía
              <div className="field-wrap">
                <select className="field" value={opt.family} onChange={(e) => set('family', e.target.value)}>
                  {[...new Set([opt.family, ...fonts])].map((f) => (
                    <option key={f} value={f} style={{ fontFamily: f }}>
                      {f}
                    </option>
                  ))}
                </select>
                <button className="btn outline" title="Cargar un archivo TTF, OTF o WOFF" onClick={() => fontFile.current?.click()}>
                  <Upload size={14} /> TTF
                </button>
                <input
                  ref={fontFile}
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const name = await loadFontFile(f);
                      setFonts((l) => [name, ...l]);
                      set('family', name);
                    } catch {
                      toast('No se pudo cargar la fuente', 'error');
                    }
                  }}
                />
              </div>
            </label>
            <div className="row2">
              <label className="chk">
                <input type="checkbox" checked={opt.bold} onChange={(e) => set('bold', e.target.checked)} /> Negrita
              </label>
              <label className="chk">
                <input type="checkbox" checked={opt.italic} onChange={(e) => set('italic', e.target.checked)} /> Cursiva
              </label>
              {!kind.startsWith('gray') && (
                <label className="chk">
                  <input type="checkbox" checked={opt.align === 'center'} onChange={(e) => set('align', e.target.checked ? 'center' : 'left')} /> Centrar en la celda
                </label>
              )}
            </div>
            <Slider label="Tamaño de letra" value={Math.round(opt.scale * 100)} min={30} max={130} suffix="% de la celda" onChange={(v) => set('scale', v / 100)} />
            <Slider label="Línea base" value={Math.round(opt.baseline * 100)} min={40} max={100} suffix="%" onChange={(v) => set('baseline', v / 100)} />
            <Slider label="Desplazamiento X" value={Math.round(opt.offsetX * 100)} min={-30} max={30} suffix="%" onChange={(v) => set('offsetX', v / 100)} />
            {!kind.startsWith('gray') && <Slider label="Grosor (umbral)" value={256 - threshold} min={16} max={240} suffix="" onChange={(v) => setThreshold(256 - v)} />}
            {kind === 'grayAscii' && <label>Niveles de gris<select className="field" value={grayBits} onChange={(e) => setGrayBits(Number(e.target.value) as 4 | 8)}><option value={4}>16 niveles (4 bits)</option><option value={8}>256 niveles (8 bits)</option></select></label>}
            {kind === 'fixed' && (
              <label>
                Codificación
                <select className="field" value={fixedKind} onChange={(e) => setFixedKind(e.target.value as FixedKind)}>
                  <option value="unicode">UNICODE (codificación 5)</option>
                  <option value="gb2312">GB2312 (codificación 1)</option>
                  <option value="byte">8 bits (codificación 0)</option>
                </select>
              </label>
            )}
            {kind !== 'ascii0' && (
              <div className="row2">
                <label>
                  {kind === 'gray' ? 'Ancho máximo' : 'Ancho'} (px)
                  <input className="field" type="number" min={4} max={255} value={gw} onChange={(e) => setGw(Number(e.target.value))} />
                </label>
                <label>
                  {kind === 'gray' ? 'Alto máximo' : 'Alto'} (px)
                  <input className="field" type="number" min={4} max={255} value={gh} onChange={(e) => setGh(Number(e.target.value))} />
                </label>
              </div>
            )}
            {(kind === 'gray' || (kind === 'fixed' && fixedKind === 'unicode')) && (
              <div className="charsets">
                <span>Caracteres ({codes.length})</span>
                {CHARSETS.map((cs) => (
                  <label key={cs.id} className="chk">
                    <input
                      type="checkbox"
                      checked={sets.includes(cs.id)}
                      onChange={(e) => setSets((s) => (e.target.checked ? [...s, cs.id] : s.filter((x) => x !== cs.id)))}
                    />
                    {cs.label}
                  </label>
                ))}
                <div className="field-wrap">
                  <input className="field" placeholder="Caracteres adicionales…" value={extra} onChange={(e) => setExtra(e.target.value)} />
                  <button className="btn outline" onClick={() => setExtra((x) => x + projectChars())} title="Añade los caracteres de los textos del proyecto">
                    Del proyecto
                  </button>
                </div>
              </div>
            )}
            <label>
              Número de archivo (ID de fuente en DGUS)
              <input className="field" type="number" min={0} max={255} value={fileId} onChange={(e) => setFileId(Number(e.target.value))} />
            </label>
          </div>
          <div className="font-preview">
            <label>
              Texto de prueba
              <input className="field" value={sample} onChange={(e) => setSample(e.target.value)} />
            </label>
            {kind === 'ascii0' && (
              <Slider label="Ancho de vista previa" value={previewW} min={ASC_MIN} max={ASC_MAX} suffix={` px (alto ${previewW * 2})`} onChange={setPreviewW} />
            )}
            <div className="preview-box">
              <canvas ref={preview} style={{ imageRendering: 'pixelated' }} />
            </div>
            <div className="muted-txt">
              Archivo: <b>{fileName}</b>
              {kind === 'ascii0' && ' · los controles con «Fuente (ID)» igual a este número la usarán'}
            </div>
            {busy && <div className="msg info">{busy}</div>}
          </div>
        </div>
        <div className="foot">
          <button className="btn outline" onClick={working ? cancel : close}>
            {working ? 'Cancelar' : 'Cerrar'}
          </button>
          <button className="btn outline" onClick={saveFile} disabled={working}>
            Guardar archivo…
          </button>
          <button className="btn primary" onClick={addToProject} disabled={working}>
            Generar y añadir al proyecto
          </button>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <label>
      <span>
        {label}: <b>{value}</b>
        {suffix}
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
