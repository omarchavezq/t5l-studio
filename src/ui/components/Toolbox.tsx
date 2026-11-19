import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { toolbox } from '../../core/controls';
import { useStore } from '../store';
import { Icon } from './Icon';
import { Resources } from './Resources';

export const DND_TYPE = 'application/x-dgus-control';

export function Toolbox() {
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<'tools' | 'res'>('tools');
  const nIcl = useStore((s) => Object.keys(s.project.icl ?? {}).length);
  const addControl = useStore((s) => s.addControl);
  const { width, height } = useStore((s) => s.project.settings);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return toolbox()
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (d) =>
            !needle ||
            d.label.toLowerCase().includes(needle) ||
            d.description.toLowerCase().includes(needle) ||
            d.legacy.toLowerCase().includes(needle),
        ),
      }))
      .filter((g) => g.items.length);
  }, [q]);

  return (
    <aside className="panel left">
      <div className="tabs">
        <button className={tab === 'tools' ? 'on' : ''} onClick={() => setTab('tools')}>
          Controles
        </button>
        <button className={tab === 'res' ? 'on' : ''} onClick={() => setTab('res')}>
          Recursos{nIcl ? ` (${nIcl})` : ''}
        </button>
      </div>
      {tab === 'res' && <Resources />}
      {tab === 'tools' && (
      <>
      <div className="search">
        <Search size={14} />
        <input placeholder="Buscar control…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="panel-body">
        {groups.map((g) => {
          const isClosed = closed[g.category] && !q;
          return (
            <div className="tb-cat" key={g.category}>
              <button className="tb-cat-title" onClick={() => setClosed((c) => ({ ...c, [g.category]: !c[g.category] }))}>
                {isClosed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                {g.category}
                <span style={{ marginLeft: 'auto', fontWeight: 500 }}>{g.items.length}</span>
              </button>
              {!isClosed &&
                g.items.map((d) => (
                  <button
                    key={d.type}
                    className="tb-item"
                    title={`${d.description}\n\nEquivale a: ${d.legacy}\nArrastre al lienzo o haga doble clic para añadir.`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DND_TYPE, d.type);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDoubleClick={() => addControl(d.type, width / 2 - d.defaultSize.w / 2, height / 2 - d.defaultSize.h / 2)}
                  >
                    <span className={`tb-icon ${d.kind}`}>
                      <Icon name={d.icon} />
                    </span>
                    <span className="tb-label">{d.label}</span>
                  </button>
                ))}
            </div>
          );
        })}
      </div>
      <div className="tb-legend">
        <span className="lt">Táctil (13)</span>
        <span className="ld">Visualización (14)</span>
      </div>
      </>
      )}
    </aside>
  );
}
