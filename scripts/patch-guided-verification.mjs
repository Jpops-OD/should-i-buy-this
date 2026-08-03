import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/main-phase3.tsx', import.meta.url);
let source = await readFile(file, 'utf8');

if (!source.includes("import './guided-verification.css';")) {
  const marker = "import './auto-discovery.css';";
  if (!source.includes(marker)) throw new Error('Guided verification patch failed: stylesheet marker missing');
  source = source.replace(marker, `${marker}\nimport './guided-verification.css';`);
}

if (!source.includes('function GuidedRetailerVerification(')) {
  const marker = 'function App() {';
  if (!source.includes(marker)) throw new Error('Guided verification patch failed: App marker missing');
  const component = `
type GuidedRetailerStatus = 'not-checked' | 'confirmed' | 'not-found' | 'wrong-product' | 'out-of-stock';
type GuidedRetailerEntry = { status: GuidedRetailerStatus; price: string; shipping: string; freeShipping: boolean; pickup: boolean; checkedAt: string };

const GUIDED_RETAILERS = [
  { name: 'Walmart', search: (q: string) => 'https://www.walmart.com/search?q=' + encodeURIComponent(q) },
  { name: 'Target', search: (q: string) => 'https://www.target.com/s?searchTerm=' + encodeURIComponent(q) },
  { name: 'Amazon', search: (q: string) => 'https://www.amazon.com/s?k=' + encodeURIComponent(q) },
  { name: 'Best Buy', search: (q: string) => 'https://www.bestbuy.com/site/searchpage.jsp?st=' + encodeURIComponent(q) },
];

function GuidedRetailerVerification({ product, profileId, currency }: { product: ProductDraft; profileId: string; currency: string }) {
  const query = [product.brand, product.model || product.sku, product.title].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const storageKey = 'sibt-guided-' + profileId + '-' + (product.model || product.sku || product.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
  const blank = (): GuidedRetailerEntry => ({ status: 'not-checked', price: '', shipping: '', freeShipping: false, pickup: false, checkedAt: '' });
  const [entries, setEntries] = React.useState<Record<string, GuidedRetailerEntry>>(() => {
    try { return { ...Object.fromEntries(GUIDED_RETAILERS.map((r) => [r.name, blank()])), ...JSON.parse(localStorage.getItem(storageKey) || '{}') }; }
    catch { return Object.fromEntries(GUIDED_RETAILERS.map((r) => [r.name, blank()])); }
  });

  React.useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(entries)); }, [entries, storageKey]);

  const update = (name: string, patch: Partial<GuidedRetailerEntry>) => setEntries((current) => ({
    ...current,
    [name]: { ...(current[name] || blank()), ...patch, checkedAt: new Date().toISOString() },
  }));

  const confirmed = GUIDED_RETAILERS.map((retailer) => {
    const entry = entries[retailer.name] || blank();
    const price = Number(entry.price);
    const shipping = entry.freeShipping ? 0 : Number(entry.shipping || 0);
    return { retailer, entry, price, total: price + shipping };
  }).filter((item) => item.entry.status === 'confirmed' && Number.isFinite(item.price) && item.price > 0)
    .sort((a, b) => a.total - b.total);

  const openRetailer = (name: string, url: string) => {
    update(name, { status: entries[name]?.status === 'confirmed' ? 'confirmed' : 'not-checked' });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openAll = () => GUIDED_RETAILERS.forEach((retailer, index) => {
    window.setTimeout(() => openRetailer(retailer.name, retailer.search(query)), index * 180);
  });

  return <section className="guided-workspace">
    <div className="guided-heading">
      <div><span className="eyebrow">GUIDED PRICE CHECK</span><h2>Verify prices at the main retailers</h2><p>The app found the product identity. Open each retailer’s prepared search, confirm what you see, and the comparison updates here. No copying links.</p></div>
      <button className="secondary" type="button" onClick={openAll}><Icon name="arrow" /> Open all 4 checks</button>
    </div>

    <div className="guided-retailer-grid">
      {GUIDED_RETAILERS.map((retailer) => {
        const entry = entries[retailer.name] || blank();
        return <article className={`guided-retailer ${entry.status === 'confirmed' ? 'confirmed' : ''}`} key={retailer.name}>
          <div className="guided-retailer-top"><div><b>{retailer.name}</b><small>{entry.status === 'confirmed' ? 'Price confirmed' : entry.status === 'not-found' ? 'Item not found' : entry.status === 'wrong-product' ? 'Different model' : entry.status === 'out-of-stock' ? 'Out of stock' : 'Not checked yet'}</small></div><button className="secondary compact-button" type="button" onClick={() => openRetailer(retailer.name, retailer.search(query))}>Verify at {retailer.name}</button></div>
          <label>Status<select value={entry.status} onChange={(event) => update(retailer.name, { status: event.target.value as GuidedRetailerStatus })}><option value="not-checked">Not checked</option><option value="confirmed">Correct item — enter price</option><option value="not-found">Item not found</option><option value="wrong-product">Different model</option><option value="out-of-stock">Out of stock</option></select></label>
          {entry.status === 'confirmed' && <div className="guided-fields">
            <label>Item price<input inputMode="decimal" min="0" step="0.01" type="number" value={entry.price} onChange={(event) => update(retailer.name, { price: event.target.value })} placeholder="0.00" /></label>
            <label>Shipping<input inputMode="decimal" min="0" step="0.01" type="number" disabled={entry.freeShipping} value={entry.shipping} onChange={(event) => update(retailer.name, { shipping: event.target.value })} placeholder="0.00" /></label>
            <label className="guided-check"><input type="checkbox" checked={entry.freeShipping} onChange={(event) => update(retailer.name, { freeShipping: event.target.checked, shipping: event.target.checked ? '' : entry.shipping })} /> Free shipping</label>
            <label className="guided-check"><input type="checkbox" checked={entry.pickup} onChange={(event) => update(retailer.name, { pickup: event.target.checked })} /> Pickup available</label>
          </div>}
        </article>;
      })}
    </div>

    <div className="guided-summary">
      <div><span className="data-label">Confirmed retailers</span><b>{confirmed.length} of {GUIDED_RETAILERS.length}</b></div>
      <div><span className="data-label">Current best price</span><b>{confirmed[0] ? money(confirmed[0].total, currency) : 'Confirm a price to compare'}</b>{confirmed[0] && <small>{confirmed[0].retailer.name}{confirmed[0].entry.freeShipping ? ' · free shipping' : ''}</small>}</div>
      <div><span className="data-label">Difference</span><b>{confirmed.length >= 2 ? money(confirmed[confirmed.length - 1].total - confirmed[0].total, currency) : 'Need 2 prices'}</b></div>
    </div>
    {confirmed.length >= 2 && <div className="notice success"><span className="notice-icon"><Icon name="check" /></span><span><b>{confirmed[0].retailer.name} is currently lowest</b><small>Based on the prices you confirmed. Recheck availability and final taxes at checkout.</small></span></div>}
  </section>;
}

`;
  source = source.replace(marker, component + marker);
}

const insertion = '<button className="secondary" type="button" onClick={() => { setIntakeDraft(confirmed || null); setResult(null); setError(null); window.scrollTo({ top: 0, behavior: \'smooth\' }); }}>Review details and search again</button>';
if (source.includes(insertion) && !source.includes('<GuidedRetailerVerification product={result.product}')) {
  source = source.replace(insertion, `<GuidedRetailerVerification product={result.product} profileId={profile.id} currency={profile.currency} />\n            ${insertion}`);
}

await writeFile(file, source, 'utf8');
console.log('Applied guided retailer verification workspace');
