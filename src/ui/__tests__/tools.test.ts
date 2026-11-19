import { describe, expect, it } from 'vitest';
import { addPagesFrom } from '../actions';
import { useStore } from '../store';
import { demoProject, newProject } from '../../core/project';
import { createControl } from '../../core/controls';

describe('importar páginas de otro proyecto', () => {
  it('renumera las que chocan y actualiza los saltos entre ellas', () => {
    useStore.getState().setProject(demoProject()); // páginas 0 y 1
    const other = newProject('otro');
    const back = createControl('basicTouch', 0, 0);
    back.props.picNext = 1; // salta a la página 1 del otro proyecto
    other.pages = [
      { id: 0, name: 'A', controls: [back] },
      { id: 1, name: 'B', controls: [] },
      { id: 7, name: 'C', controls: [] },
    ];
    addPagesFrom(other, [0, 1, 7]);
    const pages = useStore.getState().project.pages;
    expect(pages.map((p) => p.id)).toEqual([0, 1, 2, 3, 7]);
    const a = pages.find((p) => p.name === 'A')!;
    expect(a.id).toBe(2);
    expect(a.controls[0].props.picNext).toBe(3); // la página B pasó a ser la 3
    expect(a.controls[0].id).not.toBe(back.id);
    expect(useStore.getState().past.length).toBe(1); // se puede deshacer
  });
});
