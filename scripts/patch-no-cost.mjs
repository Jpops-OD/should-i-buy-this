import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/main-phase3.tsx', import.meta.url);
let source = await readFile(file, 'utf8');

function replaceOnce(find, replacement, label) {
  if (!source.includes(find)) throw new Error(`No-cost patch failed: ${label}`);
  source = source.replace(find, replacement);
}

const lines = (...items) => items.join('\n');

replaceOnce(
  "import './phase4.css';",
  "import './phase4.css';\nimport './no-cost.css';",
  'Phase 4 stylesheet import was not found',
);

replaceOnce(
  lines(
    '    providerError: string;',
    '  };',
  ),
  lines(
    '    providerError: string;',
    '    noCost?: boolean;',
    '    searchLinks?: Record<string, string>;',
    '    rejectedStores?: string[];',
    '  };',
  ),
  'Research result type was not found',
);

replaceOnce(
  "  const [visualSearchLoading, setVisualSearchLoading] = useState(false);",
  lines(
    '  const [visualSearchLoading, setVisualSearchLoading] = useState(false);',
    "  const [listingUrlsInput, setListingUrlsInput] = useState('');",
  ),
  'Visual-search state was not found',
);

replaceOnce(
  lines(
    '              memberships: profile.memberships,',
    '            }),',
  ),
  lines(
    '              memberships: profile.memberships,',
    "              listingUrls: listingUrlsInput.split(/\\s+/).map((item) => item.trim()).filter(Boolean),",
    '            }),',
  ),
  'Research request body was not found',
);

source = source.replaceAll(
  'The image is sent to Google Cloud Vision only when you choose online image search. This app does not save the image after the request.',
  'The image is read by the app through Cloudflare Workers AI. No paid reverse-image search service is used.',
);

source = source.replaceAll(
  "{error.code !== 'VISUAL_SEARCH_UNAVAILABLE' && (",
  '{false && (',
);

replaceOnce(
  '<p>{result.research?.setupRequired ? \'The product is fully identified. The retailer-search connection still needs to be added before the app can compare stores.\' : `You supplied everything required. The app checked ${result.research?.attemptedCount || 0} candidate page${result.research?.attemptedCount === 1 ? \'\' : \'s\'}, but did not verify enough comparable listings for a shopping score.`}</p>',
  '<p>The product is fully identified. Use the free search links below, paste matching retailer product links, and the app will verify them before creating a score.</p>',
  'Research explanation was not found',
);

replaceOnce(
  '<div><b>{result.research?.setupRequired ? \'Retailer search is not connected\' : \'Research completed without enough evidence\'}</b><p>{result.research?.setupRequired ? \'Nothing is missing from your product information. Add the Brave Search API secret to let the app discover retailer pages.\' : \'Nothing is missing from your product information. The app found fewer than two comparable listings, so it correctly stopped instead of inventing a recommendation.\'}</p>{result.research?.providerError && <small>{result.research.providerError}</small>}</div>',
  '<div><b>More retailer links are needed</b><p>Nothing is missing from your product information. The app needs at least two verified listings and will not invent prices or use a paid search API.</p></div>',
  'Paid-provider research note was not found',
);

replaceOnce(
  '          <div className="confirmed-product-actions">',
  lines(
    '          <section className="no-cost-research-panel">',
    '            <div className="section-heading compact-heading">',
    '              <div className="section-icon"><Icon name="search" /></div>',
    '              <div><span className="kicker">No-cost retailer search</span><h2>Find and add matching listings</h2></div>',
    '            </div>',
    '            <p>Open one or more searches, copy the exact retailer product-page links, and paste them below. One link per line works best.</p>',
    '            <div className="free-search-links">',
    '              {result.research?.searchLinks && Object.entries(result.research.searchLinks).map(([name, url]) => (',
    '                <a key={name} href={String(url)} target="_blank" rel="noreferrer">{name.replace(/([A-Z])/g, \' $1\').replace(/^./, (letter) => letter.toUpperCase())} <Icon name="arrow" size={14} /></a>',
    '              ))}',
    '            </div>',
    '            <label>',
    '              Retailer product links',
    '              <textarea value={listingUrlsInput} onChange={(event) => setListingUrlsInput(event.target.value)} placeholder="https://www.retailer.com/product/...\nhttps://www.another-store.com/product/..." />',
    '            </label>',
    '            <button className="primary" type="button" disabled={loading || !listingUrlsInput.trim()} onClick={() => analyze(false)}>',
    '              {loading ? <><span className="spinner compact" /> Verifying listings…</> : <><Icon name="check" /> Verify and compare these links</>}',
    '            </button>',
    '            <small className="no-cost-note">No subscription, search API, or paid image service is required. Retailers that block automated reading will be identified clearly.</small>',
    '          </section>',
    '',
    '          <div className="confirmed-product-actions">',
  ),
  'Limited-research actions were not found',
);

await writeFile(file, source, 'utf8');
console.log('Applied no-cost-only interface');
