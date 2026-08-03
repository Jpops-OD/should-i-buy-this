import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/main-phase3.tsx', import.meta.url);
let source = await readFile(file, 'utf8');

function replaceOnce(find, replacement, label) {
  if (!source.includes(find)) throw new Error(`Quick link confirmation patch failed: ${label}`);
  source = source.replace(find, replacement);
}

replaceOnce(
  "import './auto-discovery.css';",
  "import './auto-discovery.css';\nimport './quick-link-confirmation.css';",
  'auto-discovery stylesheet import',
);

replaceOnce(
  '<section className="intake-confirmation" aria-labelledby="confirm-product-heading">',
  '<section className={`intake-confirmation ${mode === \'link\' ? \'quick-link-confirmation\' : \'\'}`} aria-labelledby="confirm-product-heading">',
  'confirmation section class',
);

replaceOnce(
  '<div><span className="kicker">Review before continuing</span><h3 id="confirm-product-heading">Confirm the product details</h3><p>Correct anything that was read incorrectly. These details become the product identity used for research.</p></div>',
  '<div><span className="kicker">{mode === \'link\' ? \'Product found\' : \'Review before continuing\'}</span><h3 id="confirm-product-heading">{mode === \'link\' ? \'Is this the right item?\' : \'Confirm the product details\'}</h3><p>{mode === \'link\' ? \'Confirm the match and the app will immediately search other retailers and compare verified prices.\' : \'Correct anything that was read incorrectly. These details become the product identity used for research.\'}</p></div>',
  'confirmation heading',
);

replaceOnce(
  '<div className="grid confirmation-grid">',
  `<div className="quick-product-match" aria-label="Product found">
                <div><span>Product</span><strong>{intakeDraft.title}</strong></div>
                <div><span>Retailer</span><strong>{intakeDraft.seller || intakeDraft.sourceName || 'Source store'}</strong></div>
                {intakeDraft.visiblePrice != null && <div><span>Listed price</span><strong>{money(intakeDraft.visiblePrice, intakeDraft.currency || profile.currency)}</strong></div>}
                {(intakeDraft.model || intakeDraft.sku) && <div><span>Model</span><strong>{intakeDraft.model || intakeDraft.sku}</strong></div>}
              </div>
              <div className="grid confirmation-grid">`,
  'quick product match insertion',
);

source = source
  .replaceAll('>Start over</button>', '>{mode === \'link\' ? \'No, this is not it\' : \'Start over\'}</button>')
  .replaceAll('<Icon name="check" /> Confirm and research', '<Icon name="check" /> {mode === \'link\' ? \'Yes, compare prices\' : \'Confirm and research\'}')
  .replaceAll('<Icon name="check" /> Use these details', '<Icon name="check" /> {mode === \'link\' ? \'Yes, compare prices\' : \'Use these details\'}');

await writeFile(file, source, 'utf8');
console.log('Applied simplified one-link confirmation flow');
