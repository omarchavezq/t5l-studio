import type { LucideProps } from 'lucide-react';
import { CONTROL_ICONS } from './iconMap';

export function Icon({ name, ...rest }: { name: string } & LucideProps) {
  const C = CONTROL_ICONS[name] ?? CONTROL_ICONS.Box;
  return <C size={16} strokeWidth={1.8} {...rest} />;
}
