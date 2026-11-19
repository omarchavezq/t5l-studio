import { AlertTriangle } from 'lucide-react';
import { resolveConflictByIgnoring, resolveConflictByReassign, useConflict } from '../actions';

/** Archivos que comparten sectores de memoria: reasignar números o generar como DGUS 7.6. */
export function ConflictDialog() {
  const conflict = useConflict((s) => s.conflict);
  if (!conflict) return null;
  const { plan } = conflict;
  const close = () => useConflict.setState({ conflict: null });
  const canReassign = plan.moves.length > 0 && plan.unresolved.length === 0;

  return (
    <div className="overlay" onPointerDown={close}>
      <div className="dialog" style={{ width: 620 }} onPointerDown={(e) => e.stopPropagation()}>
        <h2>
          <AlertTriangle size={18} color="var(--warn)" style={{ verticalAlign: -3 }} /> Archivos que se pisan en la memoria
        </h2>
        <div className="sub">
          Cada archivo ocupa sectores de 256 KB a partir de su número. Algunos comparten sectores: en la pantalla, el último que se cargue sobrescribirá parte del otro.
        </div>
        <div className="body">
          {plan.moves.length > 0 && (
            <div>
              <b>Propuesta de reasignación</b>
              <table className="watch">
                <thead>
                  <tr>
                    <th>Archivo</th>
                    <th>Nuevo nombre</th>
                    <th>Sectores</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.moves.map((m) => (
                    <tr key={m.file}>
                      <td className="mono">{m.file}</td>
                      <td className="mono">{m.newName}</td>
                      <td className="mono">
                        {m.to}–{m.to + m.sectors - 1}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="muted-txt" style={{ marginTop: 6 }}>
                {plan.refs.length
                  ? `Se ${plan.refs.length === 1 ? 'actualizará 1 referencia' : `actualizarán ${plan.refs.length} referencias`}: ${[...new Set(plan.refs.map((r) => r.controlName))].slice(0, 6).join(', ')}${plan.refs.length > 6 ? '…' : ''}.`
                  : 'Ningún control usa estos números: no cambia ninguna referencia.'}{' '}
                Sus archivos originales no se modifican; el cambio se puede deshacer.
              </div>
            </div>
          )}
          {plan.rawControls.length > 0 && (
            <div className="msg warn">
              <AlertTriangle size={14} />
              {plan.rawControls.length} controles importados sin decodificar podrían usar estos números y no se actualizan solos. Revíselos: {plan.rawControls.slice(0, 4).map((r) => r.controlName).join(', ')}.
            </div>
          )}
          {plan.unresolved.map((u, i) => (
            <div key={i} className="msg error">
              {u}
            </div>
          ))}
        </div>
        <div className="foot">
          <button className="btn outline" onClick={close}>
            Cancelar
          </button>
          <button className="btn outline" onClick={resolveConflictByIgnoring} title="Igual que DGUS 7.6: los archivos se generan sin cambios">
            Generar igualmente
          </button>
          <button className="btn primary" disabled={!canReassign} onClick={resolveConflictByReassign}>
            Reasignar y generar
          </button>
        </div>
      </div>
    </div>
  );
}
