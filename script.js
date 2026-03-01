const root = document.documentElement;
const modeButtons = document.querySelectorAll('.mode-btn');
const swatches = document.querySelectorAll('.swatch');
const animToggle = document.getElementById('animToggle');
const opacityRange = document.getElementById('opacityRange');
const opacityVal = document.getElementById('opacityVal');

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    modeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    root.setAttribute('data-theme', btn.dataset.theme);
  });
});

swatches.forEach((swatch) => {
  swatch.addEventListener('click', () => {
    swatches.forEach((s) => s.classList.remove('active'));
    swatch.classList.add('active');
    root.style.setProperty('--accent', swatch.dataset.accent);
  });
});

animToggle.addEventListener('change', (e) => {
  document.body.classList.toggle('no-anim', !e.target.checked);
});

opacityRange.addEventListener('input', (e) => {
  const val = Number(e.target.value);
  root.style.setProperty('--pattern-opacity', String(val / 100));
  opacityVal.textContent = `${val}%`;
});
