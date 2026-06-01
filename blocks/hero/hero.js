import { getMetadata } from '../../scripts/aem.js';
import { isAuthorEnvironment, moveInstrumentation } from '../../scripts/scripts.js';
import { readBlockConfig } from '../../scripts/aem.js';

/**
 * @param {Element} block
 */
export default function decorate(block) {
  // Lê configurações posicionais (divs 3–7)
  const enableUnderline = block.querySelector(':scope div:nth-child(3) > div')?.textContent?.trim() || 'true';
  const layoutStyle = block.querySelector(':scope div:nth-child(4) > div')?.textContent?.trim() || 'overlay';
  const ctaStyle = block.querySelector(':scope div:nth-child(5) > div')?.textContent?.trim() || 'default';
  const backgroundStyle = block.querySelector(':scope div:nth-child(6) > div')?.textContent?.trim() || 'default';
  // livemode: 'off' | 'live' | 'breaking'
  const liveMode = block.querySelector(':scope div:nth-child(7) > div')?.textContent?.trim()
    || block.querySelector('[data-aue-prop="livemode"]')?.textContent?.trim()
    || 'off';

  // Aplica classes de layout e background
  if (layoutStyle) block.classList.add(layoutStyle);
  if (backgroundStyle) block.classList.add(backgroundStyle);
  if (enableUnderline.toLowerCase() === 'false') block.classList.add('removeunderline');

  // Aplica CTA style ao button container
  const buttonContainer = block.querySelector('p.button-container');
  if (buttonContainer) buttonContainer.classList.add(`cta-${ctaStyle}`);

  // Injeta badge de live/breaking antes do conteúdo de texto
  if (liveMode && liveMode !== 'off') {
    const label = liveMode === 'live' ? 'EN VIVO' : 'BREAKING NEWS';
    const badge = document.createElement('div');
    badge.className = 'hero-live-badge';
    badge.innerHTML = `<span class="live-dot"></span>${label}`;

    // Insere antes do primeiro heading ou parágrafo do conteúdo
    const contentDiv = block.querySelector(':scope > div:first-child > div:nth-child(2)')
      || block.querySelector(':scope > div:first-child > div');
    if (contentDiv) {
      const firstEl = contentDiv.querySelector('h1, h2, h3, p');
      if (firstEl) contentDiv.insertBefore(badge, firstEl);
      else contentDiv.prepend(badge);
    }
  }

  // Oculta divs de configuração
  [3, 4, 5, 6, 7].forEach((n) => {
    const div = block.querySelector(`:scope div:nth-child(${n})`);
    if (div) div.style.display = 'none';
  });

  const ctaStyleParagraph = block.querySelector('p[data-aue-prop="ctastyle"]');
  if (ctaStyleParagraph) ctaStyleParagraph.style.display = 'none';
}
