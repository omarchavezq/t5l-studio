// Diálogos abiertos desde distintos sitios (barra superior, propiedades, atajos).
import { create } from 'zustand';
import type { Project } from '../core/types';

export type ToolDialog = { kind: 'findVp' } | { kind: 'importPages'; source: Project } | { kind: 'keyboard'; controlId: string } | { kind: 'initValues' } | { kind: 'modbus' } | { kind: 'network' } | { kind: 'languages' } | { kind: 'video' } | { kind: 'audio' } | { kind: 'fsk' } | null;

export const useUi = create<{ dialog: ToolDialog }>(() => ({ dialog: null }));
export const openDialog = (d: ToolDialog) => useUi.setState({ dialog: d });
export const closeDialog = () => useUi.setState({ dialog: null });
