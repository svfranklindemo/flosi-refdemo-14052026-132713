/*
import { patternDecorate } from '../../scripts/blockTemplate.js';

export default async function decorate(block) {
  patternDecorate(block);
}
*/

import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const KNOWN_CTA_STYLES = new Set([
  'button',
  'button-secondary',
  'button-dark',
  'cta-button',
  'cta-button-secondary',
  'cta-button-dark',
  'default',
]);

const KNOWN_CARD_STYLES = new Set([
  'default',
  'image-top',
  'image-bottom',
  'image-left',
  'image-right',
  'teaser-overlay',
  'gradient',
]);

const KNOWN_TAGS = new Map([
  ['exclusivo', 'EXCLUSIVO'],
  ['mega investiga', 'MEGA INVESTIGA'],
  ['radio infinita', 'RADIO INFINITA'],
  ['ultimo minuto', 'ÚLTIMO MINUTO'],
  ['último minuto', 'ÚLTIMO MINUTO'],
  ['analisis', 'ANÁLISIS'],
  ['análisis', 'ANÁLISIS'],
]);

function readConfigText(div) {
  const paragraph = div?.querySelector('p');
  return (paragraph?.textContent || div?.textContent || '').trim();
}

export default function decorate(block) {
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');

    const configDivs = [...row.children].slice(2);
    let ctaStyle = 'button';
    let cardStyle = 'default';
    let rawTag = '';

    configDivs.forEach((div) => {
      const propName = (div.getAttribute('data-aue-prop') || '').toLowerCase().trim();
      const value = readConfigText(div);
      if (!value) return;

      if (propName === 'ctastyle' && KNOWN_CTA_STYLES.has(value)) {
        ctaStyle = value;
        return;
      }
      if (propName === 'style' && KNOWN_CARD_STYLES.has(value)) {
        cardStyle = value;
        return;
      }
      if (propName === 'tag' && KNOWN_TAGS.has(value.toLowerCase().trim())) {
        rawTag = value;
      }
    });

    if (!rawTag || cardStyle === 'default' || ctaStyle === 'button') {
      const configValues = configDivs.map((div) => readConfigText(div)).filter(Boolean);
      if (ctaStyle === 'button') {
        ctaStyle = configValues.find((value) => KNOWN_CTA_STYLES.has(value)) || 'button';
      }
      if (cardStyle === 'default') {
        cardStyle = configValues.find((value) => KNOWN_CARD_STYLES.has(value)) || 'default';
      }
      if (!rawTag) {
        rawTag = configValues.find((value) => KNOWN_TAGS.has(value.toLowerCase().trim())) || '';
      }
    }

    const tagLabel = rawTag ? KNOWN_TAGS.get(rawTag.toLowerCase().trim()) : '';

    if (cardStyle && cardStyle !== 'default') {
      li.className = cardStyle;
    }

    if (tagLabel) {
      li.dataset.cardTag = tagLabel;
      li.dataset.cardTagType = rawTag.toLowerCase().trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-');
    }

    moveInstrumentation(row, li);
    while (row.firstElementChild) li.append(row.firstElementChild);
    
    // Process the li children to identify and style them correctly
    [...li.children].forEach((div, index) => {
      // First div (index 0) - Image
      if (index === 0) {
        div.className = 'cards-card-image';
      }
      // Second div (index 1) - Content with button
      else if (index === 1) {
        div.className = 'cards-card-body';
      }
      // Config columns (index >= 2) stay hidden
      else if (index >= 2) {
        div.className = 'cards-config';
        const p = div.querySelector('p');
        if (p) {
          p.style.display = 'none'; // Hide the configuration text
        }
      }
    });
    
    // Apply CTA styles to button containers
    const buttonContainers = li.querySelectorAll('p.button-container');
    buttonContainers.forEach(buttonContainer => {
      // Remove any existing CTA classes
      buttonContainer.classList.remove('default', 'cta-button', 'cta-button-secondary', 'cta-button-dark', 'cta-default');
      // Add the correct CTA class
      buttonContainer.classList.add(ctaStyle);
    });
    
    ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    moveInstrumentation(img, optimizedPic.querySelector('img'));
    img.closest('picture').replaceWith(optimizedPic);
  });
 
  block.textContent = '';
  block.append(ul);

  const blocks = document.querySelectorAll(`.cards`);
  blocks.forEach((block, index) => {
    block.id = `cards-${index}`;
    
    // Add indexed IDs to images within the block
    const images = block.querySelectorAll('img');
    images.forEach((img, imgIndex) => {
      const imgId = `cards_${index}_image_${imgIndex}`;
      img.id = imgId;
    });

    // Add indexed IDs to text content divs only
    const cardBodies = block.querySelectorAll('.cards-card-body');
    cardBodies.forEach((cardBody, bodyIndex) => {
      cardBody.setAttribute('data-text-block-index', bodyIndex);
    });

    // Add indexed IDs to heading elements with container context
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6','p'].forEach((tag) => {
      const elements = block.querySelectorAll(tag);
      elements.forEach((el) => {
        const textBlock = el.closest('[data-text-block-index]');
        const textBlockIndex = textBlock ? textBlock.getAttribute('data-text-block-index') : 'unknown';
        
        // Count this tag within its text block
        const textBlockElements = textBlock ? textBlock.querySelectorAll(tag) : [el];
        const tagIndex = Array.from(textBlockElements).indexOf(el);
        
        el.id = `cards_${index}_text_${textBlockIndex}_${tag}_${tagIndex}`;
      });
    });
  });
}
