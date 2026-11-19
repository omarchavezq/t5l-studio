(async () => {
  const w = (t) => new Promise((r) => setTimeout(r, t));
  const btn = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.textContent));
  const out = { welcomeAtStart: !!document.querySelector('.welcome') };
  btn(/Abrir ejemplo/).click();
  await w(600);
  out.controls = document.querySelectorAll('.screen .ctl').length;
  document.querySelector('button[title^="Inicio"]').click();
  await w(600);
  out.back = btn(/Volver a/)?.textContent.trim() ?? null;
  out.recent = [...document.querySelectorAll('.welcome-name')].map((e) => e.textContent);
  btn(/Volver a/)?.click();
  await w(400);
  out.backToEditor = !document.querySelector('.welcome');
  return out;
})()
