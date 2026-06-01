function normalizeConfigKey(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sanitizeHtml(rawHtml) {
  if (!rawHtml) return '';
  const template = document.createElement('template');
  template.innerHTML = rawHtml;
  template.content.querySelectorAll('script').forEach((node) => node.remove());
  template.content.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    });
  });
  return template.innerHTML;
}

function scopeCss(css, uid) {
  if (!css) return '';
  const scope = `[data-code-id="${uid}"]`;
  return css.replace(/(^|})\s*([^@}{][^{}]*)\s*\{/g, (match, brace, selectors) => {
    const scopedSelectors = selectors
      .split(',')
      .map((s) => `${scope} ${s.trim()}`)
      .join(', ');
    return `${brace}\n${scopedSelectors} {`;
  });
}

export default function decorate(block) {
  let content = '';
  let styles = '';

  Array.from(block.querySelectorAll(':scope > div')).forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');
    if (cells.length < 2) return;
    const key = normalizeConfigKey(cells[0].textContent);
    const value = (cells[1]?.textContent || '').trim();
    if (key === 'content') content = value;
    if (key === 'styles') styles = value;
  });

  const uid = `code-${Math.random().toString(36).slice(2, 10)}`;
  block.innerHTML = '';
  block.classList.add('code');

  const wrapper = document.createElement('div');
  wrapper.className = 'code-content';
  wrapper.setAttribute('data-code-id', uid);
  wrapper.innerHTML = sanitizeHtml(content);

  const style = document.createElement('style');
  style.textContent = scopeCss(styles, uid);

  block.append(style, wrapper);
}
