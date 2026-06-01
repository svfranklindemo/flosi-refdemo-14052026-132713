export default function decorate(block) {
  const items = [...block.querySelectorAll('li')].map((li) => li.textContent.trim());
  if (!items.length) return;

  block.innerHTML = '';

  const label = document.createElement('span');
  label.className = 'ticker-label';
  label.textContent = 'ÚLTIMAS';

  const track = document.createElement('div');
  track.className = 'ticker-track';

  const content = document.createElement('div');
  content.className = 'ticker-content';

  // Duplica para o loop contínuo ficar suave
  [...items, ...items].forEach((text) => {
    const span = document.createElement('span');
    span.className = 'ticker-item';
    span.textContent = text;
    content.appendChild(span);
  });

  track.appendChild(content);
  block.appendChild(label);
  block.appendChild(track);
}
