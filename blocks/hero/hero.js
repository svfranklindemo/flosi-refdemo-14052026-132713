import { getMetadata } from '../../scripts/aem.js';
import { isAuthorEnvironment, moveInstrumentation } from '../../scripts/scripts.js';
import { readBlockConfig } from '../../scripts/aem.js';

/**
 * @param {Element} block
 */
export default function decorate(block) {
  const enableUnderline = block.querySelector(':scope > div:nth-child(3) > div')?.textContent?.trim() || 'true';
  const layoutStyle    = block.querySelector(':scope > div:nth-child(4) > div')?.textContent?.trim() || 'overlay';
  const ctaStyle       = block.querySelector(':scope > div:nth-child(5) > div')?.textContent?.trim() || 'default';
  const backgroundStyle = block.querySelector(':scope > div:nth-child(6) > div')?.textContent?.trim() || 'default';
  const liveModeRaw    = block.querySelector(':scope > div:nth-child(7) > div')?.textContent?.trim() || 'false';
  const isLive         = liveModeRaw === 'true' || liveModeRaw === '1';

  if (layoutStyle)    block.classList.add(layoutStyle);
  if (backgroundStyle) block.classList.add(backgroundStyle);
  if (enableUnderline.toLowerCase() === 'false') block.classList.add('removeunderline');

  const buttonContainer = block.querySelector('p.button-container');
  if (buttonContainer) buttonContainer.classList.add(`cta-${ctaStyle}`);

  // Inject live badge when flag is on
  if (isLive) {
    const badge = document.createElement('div');
    badge.className = 'hero-live-badge';
    badge.innerHTML = '<span class="live-dot"></span>EN VIVO';

    // Find the text content area and prepend badge before first heading
    const contentDiv = block.querySelector(':scope > div:nth-child(2) > div > div')
      || block.querySelector(':scope > div:nth-child(2) > div')
      || block.querySelector(':scope > div:nth-child(2)');

    if (contentDiv) {
      const firstEl = contentDiv.querySelector('h1, h2, h3, p');
      if (firstEl) contentDiv.insertBefore(badge, firstEl);
      else contentDiv.prepend(badge);
    }
  }

  // Hide config divs
  [3, 4, 5, 6, 7].forEach((n) => {
    const div = block.querySelector(`:scope > div:nth-child(${n})`);
    if (div) div.style.display = 'none';
  });
}
