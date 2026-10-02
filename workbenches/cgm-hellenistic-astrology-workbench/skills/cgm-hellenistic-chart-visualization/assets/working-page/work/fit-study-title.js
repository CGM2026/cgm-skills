(() => {
  const header = document.querySelector('.masthead');
  const name = header.querySelector('.name');
  const identity = header.querySelector('.identity');
  const birth = header.querySelector('.birth');
  const full = name.textContent;
  function fit() {
    name.textContent = full;
    name.style.fontSize = '';
    const preferred = parseFloat(getComputedStyle(name).fontSize);
    // Keep the smallest title line as tall as the two lines of birth details.
    const minimum = Math.min(preferred, Math.ceil(birth.getBoundingClientRect().height / 1.15));
    let size = preferred;
    name.style.fontSize = size + 'px';
    while (name.scrollWidth > identity.clientWidth && size > minimum) {
      name.style.fontSize = (--size) + 'px';
    }
    const characters = Array.from(full);
    while (name.scrollWidth > identity.clientWidth && characters.length > 1) {
      characters.pop();
      name.textContent = characters.join('') + '…';
    }
  }
  document.fonts.ready.then(fit);
  let pending;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(fit);
  });
  fit();
})();
