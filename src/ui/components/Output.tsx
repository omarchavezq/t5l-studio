import { useMemo, useState } from 'react';
import { AlertTriangle, CircleCheck, CircleX, Download, Info, Plug, PlugZap, Plus, RefreshCw, Send, Square, Trash2, X } from 'lucide-react';
import { planDownload, pageSwitch, parseHexStr, resetScreen, toHexStr } from '../../core/protocol';
import {
  BAUDS,
  WATCH_TYPES,
  clearLog,
  connect,
  disconnect,
  downloadFiles,
  estimateSeconds,
  readWatch,
  send,
  setLink,
  setPolling,
  stopDownload,
  useComm,
  writeWatch,
} from '../comm';
import { collectDwinSetFiles } from '../actions';
import { useStore } from '../store';
import { toast } from '../toast';
import type { Project } from '../../core/types';

export function Output() {
  const open = useStore((s) => s.outputOpen);
  const tab = useComm((s) => s.bottomTab);
  const messages = useStore((s) => s.messages);
  const st = useStore.getState;
  if (!open) return null;
  const errors = messages.filter((m) => m.level === 'error').length;
  const setTab = (t: typeof tab) => useComm.setState({ bottomTab: t });

  return (
    <section className="output">
      <div className="panel-head bottom-tabs">
        {(
          [
            ['output', `Salida${errors ? ` (${errors})` : ''}`],
            ['monitor', 'Monitor serie'],
            ['vars', 'Variables'],
            ['download', 'Descargar'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
        <div className="spacer" />
        {tab !== 'output' && <ConnectionBar />}
        <button className="btn icon" onClick={() => st().setOutputOpen(false)} title="Cerrar">
          <X size={14} />
        </button>
      </div>
      {tab === 'output' && <Messages />}
      {tab === 'monitor' && <Monitor />}
      {tab === 'vars' && <Variables />}
      {tab === 'download' && <DownloadTab />}
    </section>
  );
}

function ConnectionBar() {
  const { connected, baud, role, link, portLabel, download } = useComm();
  const busy = !!download?.running;
  return (
    <div className="conn-bar">
      <select className="field" value={role} disabled={busy} onChange={(e) => useComm.setState({ role: e.target.value as 'host' })} title="Papel del PC">
        <option value="host">PC ↔ pantalla</option>
        <option value="screen">PC simula la pantalla (para el MCU)</option>
      </select>
      <select className="field" value={baud} disabled={connected} onChange={(e) => useComm.setState({ baud: Number(e.target.value) })} title="Baudios">
        {BAUDS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <input
        className="field mono"
        style={{ width: 62 }}
        value={toHexStr(link.header).replace(' ', '')}
        title="Cabecera de trama (5AA5 por defecto)"
        onChange={(e) => {
          const b = parseHexStr(e.target.value);
          if (b.length === 2) setLink({ ...link, header: [b[0], b[1]] });
        }}
      />
      <label className="chk" title="CRC16 Modbus al final de cada trama (debe coincidir con la configuración de la pantalla)">
        <input type="checkbox" checked={link.crc} onChange={(e) => setLink({ ...link, crc: e.target.checked })} /> CRC
      </label>
      {connected ? (
        <button className="btn outline" onClick={disconnect} disabled={busy} title={portLabel}>
          <PlugZap size={14} color="var(--ok)" /> Desconectar
        </button>
      ) : (
        <button className="btn primary" onClick={connect}>
          <Plug size={14} /> Conectar
        </button>
      )}
    </div>
  );
}

function Messages() {
  const messages = useStore((s) => s.messages);
  const st = useStore.getState;
  return (
    <div className="panel-body mono-body">
      {!messages.length && <div className="msg info">Compile (Ctrl+B) para ver errores y avisos.</div>}
      {messages.map((m, i) => (
        <div
          key={i}
          className={`msg ${m.level} ${m.pageId != null ? 'clickable' : ''}`}
          onClick={() => {
            if (m.pageId == null) return;
            st().selectPage(m.pageId);
            if (m.controlId) st().select([m.controlId]);
          }}
        >
          {m.level === 'error' ? <CircleX size={14} /> : m.level === 'warn' ? <AlertTriangle size={14} /> : <Info size={14} />}
          <span>{m.text}</span>
        </div>
      ))}
    </div>
  );
}

function Monitor() {
  const log = useComm((s) => s.log);
  const link = useComm((s) => s.link);
  const [raw, setRaw] = useState('');
  const [page, setPage] = useState('0');
  return (
    <div className="monitor">
      <div className="panel-body mono-body">
        {!log.length && <div className="msg info">Las tramas enviadas (→) y recibidas (←) aparecerán aquí.</div>}
        {log.map((e, i) => (
          <div key={i} className={`logline ${e.dir}`}>
            <span className="t">{new Date(e.t).toLocaleTimeString()}</span>
            <span className="d">{e.dir === 'tx' ? '→' : e.dir === 'rx' ? '←' : '•'}</span>
            <span className="x">{e.text}</span>
            <span className="h">{e.hex}</span>
          </div>
        ))}
      </div>
      <div className="monitor-side">
        <label>
          Enviar bytes (hex)
          <div className="field-wrap">
            <input className="field mono" placeholder="5A A5 04 83 00 14 01" value={raw} onChange={(e) => setRaw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(parseHexStr(raw))} />
            <button className="btn icon outline" onClick={() => send(parseHexStr(raw))} title="Enviar">
              <Send size={14} />
            </button>
          </div>
        </label>
        <label>
          Cambiar a la página
          <div className="field-wrap">
            <input className="field" value={page} onChange={(e) => setPage(e.target.value)} />
            <button className="btn outline" onClick={() => send(pageSwitch(Number(page) || 0, link))}>
              Ir
            </button>
          </div>
        </label>
        <div className="field-wrap">
          <button className="btn outline" onClick={() => send(resetScreen(link), 'Reiniciar pantalla')}>
            <RefreshCw size={14} /> Reiniciar pantalla
          </button>
          <button className="btn icon" onClick={clearLog} title="Limpiar">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Variables() {
  const { watches, polling, connected } = useComm();
  const [edit, setEdit] = useState<Record<number, string>>({});
  const set = (i: number, patch: Partial<(typeof watches)[number]>) => useComm.setState({ watches: watches.map((w, k) => (k === i ? { ...w, ...patch } : w)) });
  const fromProject = () => {
    const page = useStore.getState().project.pages.find((p) => p.id === useStore.getState().pageId);
    const seen = new Set(watches.map((w) => w.vp.toUpperCase()));
    const add = (page?.controls ?? [])
      .filter((c) => typeof c.props.vp === 'string' && !seen.has(String(c.props.vp).toUpperCase()))
      .map((c) => ({ vp: String(c.props.vp).toUpperCase(), type: c.type === 'text' ? 9 : [1, 6, 7].includes(Number(c.props.varType)) ? Number(c.props.varType) : 0, label: c.name, value: '' }));
    useComm.setState({ watches: [...watches, ...add] });
  };
  return (
    <div className="panel-body">
      <table className="watch">
        <thead>
          <tr>
            <th>VP</th>
            <th>Tipo</th>
            <th>Nombre</th>
            <th>Valor leído</th>
            <th>Escribir</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {watches.map((w, i) => (
            <tr key={i}>
              <td>
                <input className="field mono" value={w.vp} onChange={(e) => set(i, { vp: e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 4) })} />
              </td>
              <td>
                <select className="field" value={w.type} onChange={(e) => set(i, { type: Number(e.target.value) })}>
                  {WATCH_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input className="field" value={w.label} onChange={(e) => set(i, { label: e.target.value })} />
              </td>
              <td className="mono val">{w.value}</td>
              <td>
                <div className="field-wrap">
                  <input className="field" value={edit[i] ?? ''} onChange={(e) => setEdit({ ...edit, [i]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && writeWatch(w, edit[i] ?? '')} />
                  <button className="btn icon outline" disabled={!connected} onClick={() => writeWatch(w, edit[i] ?? '')} title="Escribir">
                    <Send size={13} />
                  </button>
                  <button className="btn icon outline" disabled={!connected} onClick={() => readWatch(w)} title="Leer">
                    <RefreshCw size={13} />
                  </button>
                </div>
              </td>
              <td>
                <button className="btn icon" onClick={() => useComm.setState({ watches: watches.filter((_, k) => k !== i) })} title="Quitar">
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="field-wrap" style={{ padding: '8px 12px' }}>
        <button className="btn outline" onClick={() => useComm.setState({ watches: [...watches, { vp: '5000', type: 0, label: '', value: '' }] })}>
          <Plus size={14} /> Añadir
        </button>
        <button className="btn outline" onClick={fromProject} title="Añade las variables de los controles de la página actual">
          Desde la página
        </button>
        <label className="chk">
          <input type="checkbox" checked={polling} disabled={!connected} onChange={(e) => setPolling(e.target.checked)} /> Leer cada 0,5 s
        </label>
      </div>
    </div>
  );
}

function DownloadTab() {
  const project = useStore((s) => s.project);
  const { download, connected, baud } = useComm();
  const [files, setFiles] = useState<{ name: string; data: Uint8Array }[] | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [preparedFor, setPreparedFor] = useState<Project | null>(null);
  const documentId = useStore((s) => s.documentId);
  const [preparedDocument, setPreparedDocument] = useState<number | null>(null);
  const plan = useMemo(() => (files && preparedFor === project && preparedDocument === documentId ? planDownload(files) : null), [files, preparedFor, project, preparedDocument, documentId]);
  const total = plan?.sectors.reduce((n, s) => n + s.data.length, 0) ?? 0;

  const prepare = async () => {
    setPreparing(true);
    setFiles(null);
    try {
      setFiles(await collectDwinSetFiles());
      setPreparedFor(useStore.getState().project);
      setPreparedDocument(useStore.getState().documentId);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="panel-body" style={{ padding: '10px 12px' }}>
      <div className="field-wrap" style={{ marginBottom: 8 }}>
        <button className="btn outline" onClick={prepare} disabled={preparing || !!download?.running}>
          {preparing ? 'Preparando…' : `Preparar archivos de «${project.name}»`}
        </button>
        {plan && (
          <span className="muted-txt">
            {plan.sectors.length} sectores · {Math.round(total / 1024)} KB · ≈ {Math.ceil(estimateSeconds(total, plan.sectors.length, baud) / 60)} min a {baud} baudios
          </span>
        )}
        <div className="spacer" />
        {download?.running ? (
          <button className="btn outline" onClick={stopDownload}>
            <Square size={14} /> Cancelar
          </button>
        ) : (
          <button className="btn primary" disabled={!plan || !connected} onClick={() => files && downloadFiles(files)} title={connected ? '' : 'Conéctese primero'}>
            <Download size={14} /> Descargar a la pantalla
          </button>
        )}
      </div>
      {download && (
        <div className="progress-wrap">
          <div className="progress">
            <div style={{ width: `${(download.done / download.total) * 100}%` }} />
          </div>
          <span className="muted-txt">
            {download.running ? download.current : download.done >= download.total ? 'Completado' : 'Detenido'} · {Math.round(download.bytesPerSec / 1024)} KB/s
          </span>
        </div>
      )}
      {plan && (
        <table className="watch">
          <thead>
            <tr>
              <th>Sector</th>
              <th>Archivo</th>
              <th>Bytes</th>
            </tr>
          </thead>
          <tbody>
            {plan.sectors.map((s) => (
              <tr key={s.sector}>
                <td className="mono">{s.sector}</td>
                <td>{s.file}</td>
                <td className="mono">{s.data.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {plan?.warnings.map((w, i) => (
        <div key={i} className="msg warn">
          <AlertTriangle size={14} /> {w}
        </div>
      ))}
      {!plan && (
        <div className="msg info">
          <CircleCheck size={14} /> Descarga por puerto serie como DGUS 7.6: cada archivo va a los sectores de 256 KB que indica su número (13TouchFile → 13, 32.icl → 32…). La tarjeta SD
          sigue siendo más rápida para proyectos grandes.
        </div>
      )}
    </div>
  );
}
