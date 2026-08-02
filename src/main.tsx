import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Offer = {
  store: string;
  itemPrice: number;
  shipping: number | null;
  deliveredPrice: number;
  delivery: string;
  match: string;
};

type Risk = {
  level: 'low' | 'medium' | 'high';
  title: string;
  detail: string;
};

type Result = {
  product: {
    title: string;
    category?: string;
    dimensions?: { width: number; depth: number };
  };
  offers: Offer[];
  risks: Risk[];
  summary: string;
  status?: 'verified' | 'partial' | 'blocked' | 'unsupported';
  source?: string;
};

type AppError = {
  title: string;
  message: string;
  detail?: string;
  action?: string;
};

const sample: Result = {
  product: {
    title: 'Ridgeway 60-inch Acacia Patio Dining Table',
    category: 'Outdoor furniture',
    dimensions: { width: 60, depth: 35 },
  },
  offers: [
    { store: 'Walmart', itemPrice: 288, shipping: 0, deliveredPrice: 288, delivery: '3 days', match: 'Exact' },
    { store: 'Amazon', itemPrice: 279, shipping: 29.99, deliveredPrice: 308.99, delivery: '2 days', match: 'Exact' },
    { store: 'Target', itemPrice: 309.99, shipping: 0, deliveredPrice: 309.99, delivery: '5 days', match: 'Likely' },
  ],
  risks: [
    { level: 'low', title: 'Two exact matches found', detail: 'The same model appears at more than one store.' },
    { level: 'medium', title: 'Marketplace seller', detail: 'One offer may have a different return process.' },
  ],
  summary: 'Walmart is the best balance of delivered price, delivery speed, and seller confidence.',
  status: 'verified',
};

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

function normalizeError(status: number, payload: any): AppError {
  const code = payload?.code;
  if (code === 'RETAILER_BLOCKED' || status === 403) {
    return {
      title: 'This retailer blocked the automated check',
      message: 'The app is working, but this store would not allow us to read the public product page.',
      detail: 'Try another retailer link for the same item. Search-by-name and screenshot research will be added in a later phase.',
      action: 'Try another product link',
    };
  }
  if (code === 'UNSUPPORTED_INPUT' || status === 422) {
    return {
      title: 'That option is not connected yet',
      message: payload?.error || 'Phase 0 currently supports direct public product links.',
      detail: 'The sample assessment remains available while product search and screenshot intake are built.',
      action: 'Use a direct product link',
    };
  }
  if (code === 'INVALID_URL' || status === 400) {
    return {
      title: 'That does not look like a product link',
      message: payload?.error || 'Paste the full address from the retailer product page.',
      action: 'Check the link and try again',
    };
  }
  if (code === 'PRICE_NOT_FOUND') {
    return {
      title: 'The product was found, but the price was hidden',
      message: payload?.error || 'This store did not expose a public price we could verify.',
      detail: 'No recommendation was created from guessed pricing.',
      action: 'Try another retailer link',
    };
  }
  if (status >= 500) {
    return {
      title: 'We could not finish this check',
      message: 'The product page could not be read right now.',
      detail: 'This may be temporary, or the retailer may be limiting automated access.',
      action: 'Try again or use another retailer',
    };
  }
  return {
    title: 'This check could not be completed',
    message: payload?.error || 'Something unexpected happened.',
    action: 'Try again',
  };
}

function App() {
  const [profile, setProfile] = useState({ name: 'Personal', zip: '', priority: 'balance' });
  const [mode, setMode] = useState<'link' | 'search' | 'screenshot'>('link');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [tab, setTab] = useState<'overall' | 'compare' | 'fit' | 'risk'>('overall');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [space, setSpace] = useState({ width: 96, depth: 82 });
  const [fit, setFit] = useState<number | null>(null);

  const scores = useMemo(() => {
    if (!result) return null;
    const compare = Math.min(100, 45 + result.offers.length * 12 + result.offers.filter((offer) => offer.match === 'Exact').length * 8);
    const risk = Math.max(10, 100 - result.risks.reduce((total, item) => total + (item.level === 'high' ? 35 : item.level === 'medium' ? 15 : 5), 0));
    let overall = fit == null ? Math.round(compare * 0.65 + risk * 0.35) : Math.round(compare * 0.5 + fit * 0.25 + risk * 0.25);
    if (result.risks.some((item) => item.level === 'high')) overall = Math.min(overall, 59);
    return {
      compare,
      risk,
      overall,
      verdict: overall >= 82 ? 'Strong Buy' : overall >= 70 ? 'Worth Considering' : overall >= 55 ? 'Wait' : overall >= 35 ? 'Probably Skip' : 'Do Not Buy',
    };
  }, [result, fit]);

  async function analyze(useSample = false) {
    setLoading(true);
    setError(null);
    setFit(null);
    setTab('overall');

    try {
      if (useSample) {
        setResult(sample);
        return;
      }

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, input, zip: profile.zip, priority: profile.priority }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw { status: response.status, payload: data };
      setResult(data);
    } catch (caught: any) {
      const nextError = caught?.status ? normalizeError(caught.status, caught.payload) : normalizeError(503, {});
      setError(nextError);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function resetCheck() {
    setResult(null);
    setError(null);
    setFit(null);
    setInput('');
    setTab('overall');
  }

  if (!result) {
    return (
      <main>
        <header>
          <b>Should I Buy This?</b>
          <span>Free shopping check</span>
        </header>

        <section className="hero">
          <small>BEFORE YOU CHECK OUT</small>
          <h1>Find the best place to buy it—and the reasons not to.</h1>
          <p>Compare total price, shipping, arrival time, fit, and purchase risk.</p>
        </section>

        <section className="card grid">
          <label>
            Profile
            <input value={profile.name} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setProfile({ ...profile, name: event.target.value })} />
          </label>
          <label>
            Shipping ZIP
            <input inputMode="numeric" value={profile.zip} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setProfile({ ...profile, zip: event.target.value })} placeholder="17603" />
          </label>
          <label>
            What matters most?
            <select value={profile.priority} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setProfile({ ...profile, priority: event.target.value })}>
              <option value="balance">Best balance</option>
              <option value="price">Lowest price</option>
              <option value="speed">Fastest arrival</option>
            </select>
          </label>
        </section>

        <section className="card">
          <nav aria-label="Product input method">
            {(['link', 'search', 'screenshot'] as const).map((item) => (
              <button key={item} type="button" className={mode === item ? 'active' : ''} onClick={() => { setMode(item); setError(null); }}>
                {item === 'link' ? 'Product link' : item === 'search' ? 'Search by name' : 'Screenshot'}
              </button>
            ))}
          </nav>

          {mode !== 'link' && (
            <div className="notice" role="status">
              <b>{mode === 'search' ? 'Search by name is coming next.' : 'Screenshot reading is coming next.'}</b>
              <span>For Phase 0, paste a direct product page link or use the sample assessment.</span>
            </div>
          )}

          <textarea
            value={input}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value)}
            placeholder={mode === 'link' ? 'Paste a full product page link' : 'This input method is not connected yet'}
            disabled={mode !== 'link' || loading}
            aria-label="Product information"
          />

          <button className="primary" type="button" disabled={mode !== 'link' || !input.trim() || loading} onClick={() => analyze(false)}>
            {loading ? 'Checking the product…' : 'Check this purchase'}
          </button>
          <button className="link" type="button" disabled={loading} onClick={() => analyze(true)}>Try sample assessment</button>

          {loading && <div className="loading" role="status"><span className="spinner" />Reading the product page and checking what can be verified…</div>}

          {error && (
            <div className="error-card" role="alert">
              <strong>{error.title}</strong>
              <p>{error.message}</p>
              {error.detail && <small>{error.detail}</small>}
              {error.action && <b>{error.action}</b>}
            </div>
          )}
        </section>
      </main>
    );
  }

  const best = result.offers.length ? [...result.offers].sort((a, b) => a.deliveredPrice - b.deliveredPrice)[0] : null;

  return (
    <main>
      <header>
        <button className="link" type="button" onClick={resetCheck}>← New check</button>
        <b>Should I Buy This?</b>
      </header>

      <section className="title">
        <div>
          <small>PURCHASE ASSESSMENT</small>
          <h1>{result.product.title}</h1>
          <p>{result.product.category || 'Product comparison'}</p>
        </div>
        <div className="score"><strong>{scores?.overall}</strong><span>{scores?.verdict}</span></div>
      </section>

      {result.status === 'partial' && <div className="notice"><b>Partial verification</b><span>Only information exposed by the submitted retailer was used. No missing price or shipping data was guessed.</span></div>}

      <nav className="tabs" aria-label="Assessment details">
        {(['overall', 'compare', 'fit', 'risk'] as const).map((item) => (
          <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>
        ))}
      </nav>

      {tab === 'overall' && (
        <section className="card">
          <div className="metrics">
            <article><span>Best option</span><b>{best?.store || 'Not enough data'}</b><small>{best ? `${money(best.deliveredPrice)} before unverified shipping` : 'No verified price found'}</small></article>
            <article><span>Comparison</span><b>{scores?.compare}/100</b><small>{result.offers.length} verified offer{result.offers.length === 1 ? '' : 's'}</small></article>
            <article><span>Risk</span><b>{scores?.risk}/100</b><small>Based on currently verified details</small></article>
          </div>
          <div className="callout"><h2>Recommendation</h2><p>{result.summary}</p></div>
        </section>
      )}

      {tab === 'compare' && (
        <section className="card">
          <h2>Delivered-price comparison</h2>
          {result.offers.length === 0 ? <div className="empty-state">No verified offers were returned. The app will not invent comparison prices.</div> : result.offers.map((offer) => (
            <article className="offer" key={`${offer.store}-${offer.deliveredPrice}`}>
              <b>{offer.store}</b>
              <span>{money(offer.itemPrice)} item</span>
              <span>{offer.shipping === 0 ? 'Free shipping' : offer.shipping == null ? 'Shipping not verified' : `${money(offer.shipping)} shipping`}</span>
              <strong>{money(offer.deliveredPrice)} listed total</strong>
              <span>{offer.delivery}</span>
            </article>
          ))}
        </section>
      )}

      {tab === 'fit' && (
        <section className="card">
          <h2>Will it fit?</h2>
          <p className="supporting">Enter the maximum usable dimensions for the space.</p>
          <div className="grid">
            <label>Maximum width<input type="number" min="1" value={space.width} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSpace({ ...space, width: Number(event.target.value) })} /></label>
            <label>Maximum depth<input type="number" min="1" value={space.depth} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSpace({ ...space, depth: Number(event.target.value) })} /></label>
          </div>
          <button className="primary" type="button" onClick={() => {
            const dimensions = result.product.dimensions;
            setFit(!dimensions ? 45 : dimensions.width > space.width || dimensions.depth > space.depth ? 18 : 92);
          }}>Check fit</button>
          {fit != null && <p className={`fit ${fit < 40 ? 'bad' : fit < 70 ? 'unknown' : 'good'}`}>{fit >= 80 ? 'Fits within the entered space.' : fit >= 40 ? 'Product dimensions were not fully verified.' : 'The item is larger than the entered space.'} Fit score: {fit}/100</p>}
        </section>
      )}

      {tab === 'risk' && (
        <section className="card">
          <h2>Purchase risk</h2>
          {result.risks.map((risk, index) => <article className={`risk ${risk.level}`} key={`${risk.title}-${index}`}><b>{risk.title}</b><p>{risk.detail}</p></article>)}
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
