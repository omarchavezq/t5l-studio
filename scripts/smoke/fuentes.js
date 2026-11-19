(async () => {
  const w = (t) => new Promise((r) => setTimeout(r, t));
  [...document.querySelectorAll('button')].find((b) => /Abrir ejemplo/.test(b.textContent))?.click();
  await w(600);
  [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Fuentes')).click();
  await w(400);
  const seen = [];
  const obs = new MutationObserver(() => { const m = document.querySelector('.dialog .msg.info')?.textContent; if (m && seen[seen.length - 1] !== m) seen.push(m); });
  obs.observe(document.querySelector('.dialog'), { subtree: true, childList: true, characterData: true });
  const t0 = performance.now();
  [...document.querySelectorAll('.dialog button')].find((b) => b.textContent.includes('Generar y añadir')).click();
  const cancelShown = [...document.querySelectorAll('.dialog .foot button')].some((b) => b.textContent === 'Cancelar');
  for (let i = 0; i < 300 && !seen.some((s) => /^Listo/.test(s)); i++) await w(100);
  obs.disconnect();
  return { ms: Math.round(performance.now() - t0), cancelShown, steps: seen.length, first: seen.slice(0, 3), last: seen[seen.length - 1] };
})()
