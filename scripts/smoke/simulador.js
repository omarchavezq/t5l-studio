(async () => {
  const w = (t) => new Promise((r) => setTimeout(r, t));
  const byTitle = (t) => [...document.querySelectorAll('.screen .ctl')].find((el) => el.title.startsWith(t));
  const tap = async (el) => { const r = el.getBoundingClientRect(); const o = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, pointerId: 1 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); await w(300); };
  [...document.querySelectorAll('button')].find((b) => /Abrir ejemplo/.test(b.textContent))?.click();
  await w(600);
  const val = () => byTitle('Consigna (valor)').textContent.replace('≈', '').trim();
  [...document.querySelectorAll('button')].find((b) => /Simular/.test(b.textContent)).click(); await w(500);
  const out = { v0: val() };
  await tap(byTitle('Subir')); out.plus = val();
  await tap(byTitle('Consigna ·'));
  out.dialog = document.querySelector('.sim-ask h2')?.textContent ?? null;
  const inp = document.querySelector('.sim-ask input');
  if (inp) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, '55.5'); inp.dispatchEvent(new Event('input', { bubbles: true })); await w(50); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await w(300); }
  out.afterInput = val();
  out.title = byTitle('Título').textContent;
  return out;
})()
