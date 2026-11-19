import { create } from 'zustand';

interface ToastState {
  text: string | null;
  kind: 'ok' | 'error';
}

export const useToast = create<ToastState>(() => ({ text: null, kind: 'ok' }));

let timer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, kind: 'ok' | 'error' = 'ok') {
  useToast.setState({ text, kind });
  clearTimeout(timer);
  timer = setTimeout(() => useToast.setState({ text: null }), 3200);
}
