import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/main-phase3.tsx', import.meta.url);
let source = await readFile(file, 'utf8');

function replaceOnce(find, replacement, label) {
  if (!source.includes(find)) throw new Error(`Phase 4 patch failed: ${label}`);
  source = source.replace(find, replacement);
}

const lines = (...items) => items.join('\n');

replaceOnce(
  "import './phase3-1.css';",
  "import './phase3-1.css';\nimport './phase4.css';",
  'Phase 3.1 stylesheet import was not found',
);

replaceOnce(
  lines(
    'type Offer = {',
    '  store: string;',
    '  itemPrice: number;',
    '  shipping: number | null;',
    '  deliveredPrice: number;',
    '  delivery: string;',
    '  match: string;',
    '};',
  ),
  lines(
    'type Offer = {',
    '  store: string;',
    '  itemPrice: number;',
    '  shipping: number | null;',
    '  deliveredPrice: number;',
    '  delivery: string;',
    '  match: string;',
    '  url?: string;',
    '  seller?: string;',
    '  condition?: string;',
    '  availability?: string;',
    '  priceVerified?: boolean;',
    '  shippingVerified?: boolean;',
    '  checkedAt?: string;',
    '  matchReason?: string;',
    '};',
  ),
  'Offer type was not found',
);

replaceOnce(
  "  status?: 'verified' | 'partial' | 'blocked' | 'unsupported' | 'intake';",
  "  status?: 'verified' | 'partial' | 'blocked' | 'unsupported' | 'intake' | 'researched' | 'research-limited';",
  'Result status type was not found',
);

replaceOnce(
  '  intake?: ProductDraft;\n};',
  lines(
    '  intake?: ProductDraft;',
    '  research?: {',
    '    query: string;',
    '    checkedAt: string;',
    '    searchedCount: number;',
    '    attemptedCount: number;',
    '    blockedStores: string[];',
    '    failedStores: string[];',
    '    supportedRetailers: string[];',
    '    setupRequired: boolean;',
    '    providerError: string;',
    '  };',
    '};',
  ),
  'Research result insertion point was not found',
);

replaceOnce(
  "const response = await fetch('/api/analyze', {",
  "const response = await fetch('/api/research', {",
  'Research endpoint was not found',
);

replaceOnce(
  '<button className="primary" type="button" disabled={loading || !intakeDraft.title.trim()} onClick={() => analyze(false)}><Icon name="check" /> Confirm product</button>',
  '<button className="primary" type="button" disabled={loading || !intakeDraft.title.trim()} onClick={() => analyze(false)}>{loading ? <><span className="spinner compact" /> Researching retailers…</> : <><Icon name="search" /> Confirm and research</>}</button>',
  'Confirmation research button was not found',
);

replaceOnce(
  '<div className="eyebrow"><Icon name="check" size={16} /> PRODUCT CONFIRMED</div>',
  '<div className="eyebrow"><Icon name="search" size={16} /> RETAILER RESEARCH</div>',
  'Confirmed-product eyebrow was not found',
);

replaceOnce(
  '<p>You supplied everything required for product identification. Nothing else is missing from this step.</p>',
  '<p>{result.research?.setupRequired ? \'The product is fully identified. The retailer-search connection still needs to be added before the app can compare stores.\' : `You supplied everything required. The app checked ${result.research?.attemptedCount || 0} candidate page${result.research?.attemptedCount === 1 ? \'\' : \'s\'}, but did not verify enough comparable listings for a shopping score.`}</p>',
  'Research status explanation was not found',
);

replaceOnce(
  '<div className="status-pill success"><Icon name="check" size={16} /> Ready for retailer research</div>',
  '<div className="status-pill warning"><Icon name="alert" size={16} /> No recommendation yet</div>',
  'Research status pill was not found',
);

replaceOnce(
  '            <article><span>Variant</span><b>{result.product.variant || \'Not specified\'}</b></article>',
  lines(
    '            <article><span>Variant</span><b>{result.product.variant || \'Not specified\'}</b></article>',
    '            <article><span>Comparable listings</span><b>{result.offers.length}</b><small>At least two are required for a recommendation.</small></article>',
    '            <article><span>Pages attempted</span><b>{result.research?.attemptedCount || 0}</b><small>{result.research?.blockedStores.length ? `${result.research.blockedStores.length} retailer${result.research.blockedStores.length === 1 ? \'\' : \'s\'} blocked automated reading.` : \'No retailer blocks were recorded.\'}</small></article>',
  ),
  'Research stats insertion point was not found',
);

replaceOnce(
  '<div><b>Product identity saved</b><p>The next product phase will research matching retailers, delivered price, shipping, returns, seller quality, and availability. This confirmation page is not a shopping score.</p></div>',
  '<div><b>{result.research?.setupRequired ? \'Retailer search is not connected\' : \'Research completed without enough evidence\'}</b><p>{result.research?.setupRequired ? \'Nothing is missing from your product information. Add the Brave Search API secret to let the app discover retailer pages.\' : \'Nothing is missing from your product information. The app found fewer than two comparable listings, so it correctly stopped instead of inventing a recommendation.\'}</p>{result.research?.providerError && <small>{result.research.providerError}</small>}</div>',
  'Research-ready note was not found',
);

replaceOnce(
  '<button className="secondary" type="button" onClick={() => { setIntakeDraft(confirmed || null); setResult(null); setError(null); window.scrollTo({ top: 0, behavior: \'smooth\' }); }}>Edit product details</button>',
  '<button className="secondary" type="button" onClick={() => { setIntakeDraft(confirmed || null); setResult(null); setError(null); window.scrollTo({ top: 0, behavior: \'smooth\' }); }}>Review details and retry</button>',
  'Research retry action was not found',
);

replaceOnce(
  lines(
    '          <div className={`status-pill ${result.status === \'verified\' ? \'success\' : \'warning\'}`}>',
    '            <Icon name={result.status === \'verified\' || result.status === \'intake\' ? \'check\' : \'alert\'} size={16} />',
    '            {result.status === \'verified\' ? \'Verified sample result\' : result.status === \'intake\' ? \'Product identified\' : \'Partial verification\'}',
    '          </div>',
  ),
  lines(
    '          <div className={`status-pill ${result.status === \'verified\' || result.status === \'researched\' ? \'success\' : \'warning\'}`}>',
    '            <Icon name={result.status === \'verified\' || result.status === \'researched\' || result.status === \'intake\' ? \'check\' : \'alert\'} size={16} />',
    '            {result.status === \'verified\' ? \'Verified sample result\' : result.status === \'researched\' ? \'Retailers compared\' : result.status === \'intake\' ? \'Product identified\' : \'Partial verification\'}',
    '          </div>',
  ),
  'Result status pill was not found',
);

replaceOnce(
  "      {result.status === 'partial' && (",
  lines(
    "      {result.status === 'researched' && result.research && (",
    '        <div className="notice info research-evidence">',
    '          <span className="notice-icon"><Icon name="search" /></span>',
    '          <span><b>Live retailer research</b><small>Checked {new Date(result.research.checkedAt).toLocaleString()} using “{result.research.query}”. Prices are linked to their source pages. Shipping marked unverified must be confirmed at checkout.</small></span>',
    '        </div>',
    '      )}',
    '',
    "      {result.status === 'partial' && (",
  ),
  'Research evidence insertion point was not found',
);

replaceOnce(
  '<small>{best ? `${money(best.deliveredPrice, profile.currency)} before unverified shipping` : \'No verified price found\'}</small>',
  '<small>{best ? `${money(best.deliveredPrice, profile.currency)} ${best.shippingVerified ? \'verified delivered total\' : \'listed price; shipping unverified\'}` : \'No verified price found\'}</small>',
  'Best-offer shipping label was not found',
);

replaceOnce(
  '                <div><span className="data-label">Arrival</span><b>{offer.delivery}</b></div>\n              </article>',
  lines(
    '                <div><span className="data-label">Arrival</span><b>{offer.delivery}</b></div>',
    '                <div className="offer-meta">',
    '                  <span><b>{offer.seller || offer.store}</b><small>{offer.condition || \'Condition unknown\'} · {offer.availability || \'Availability unknown\'}</small></span>',
    '                  <span><small>{offer.matchReason || \'Listing details matched the confirmed product.\'}</small></span>',
    '                  {offer.url && <a href={offer.url} target="_blank" rel="noreferrer">Open listing <Icon name="arrow" size={14} /></a>}',
    '                </div>',
    '              </article>',
  ),
  'Offer source details insertion point was not found',
);

await writeFile(file, source, 'utf8');
console.log('Applied Phase 4 comparison interface');
