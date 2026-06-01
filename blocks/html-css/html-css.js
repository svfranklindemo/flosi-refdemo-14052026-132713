function getConfigValue(valueCell) {
  return (valueCell?.textContent || '').trim();
}

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
      if (/^on/i.test(attr.name)) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return template.innerHTML;
}

function scopeCss(css, uid) {
  if (!css) return '';
  const scope = `[data-html-css-id="${uid}"]`;
  return css.replace(/(^|})\s*([^@}{][^{}]*)\s*\{/g, (match, brace, selectors) => {
    const scopedSelectors = selectors
      .split(',')
      .map((s) => `${scope} ${s.trim()}`)
      .join(', ');
    return `${brace}\n${scopedSelectors} {`;
  });
}

export default function decorate(block) {
  let html = '';
  let css = '';

  Array.from(block.querySelectorAll(':scope > div')).forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');
    if (cells.length < 2) return;
    const key = normalizeConfigKey(cells[0].textContent);
    const value = getConfigValue(cells[1]);

    if (key === 'html') html = value;
    if (key === 'css') css = value;
  });

  const uid = `html-css-${Math.random().toString(36).slice(2, 10)}`;
  block.innerHTML = '';
  block.classList.add('html-css');

  const wrapper = document.createElement('div');
  wrapper.className = 'html-css-content';
  wrapper.setAttribute('data-html-css-id', uid);
  wrapper.innerHTML = sanitizeHtml(html);

  const style = document.createElement('style');
  const scopedCss = scopeCss(css, uid);
  style.textContent = scopedCss;

  block.append(style, wrapper);
}
