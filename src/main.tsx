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

type IconName =
  | 'shield'
  | 'check'
  | 'link'
  | 'search'
  | 'image'
  | 'scale'
  | 'ruler'
  | 'alert'
  | 'clock'
  | 'spark'
  | 'arrow'
  | 'price'
  | 'risk';

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    shield: <path d="M12 3 5 6v5c0 4.4 2.9 8.5 7 10 4.1-1.5 7-5.6 7-10V6l-7-3Z" />,
    check: <path d="m7 12 3 3 7-7" />,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></>,
    scale: <><path d="M12 3v18M5 7h14M7 7l-4 7h8L7 7Zm10 0-4 7h8l-4-7Z" /></>,
    ruler: <><path d="m4 16 12-12 4 4L8 20H4v-4Z" /><path d="m13 7 4 4M10 10l2 2M7 13l2 2" /></>,
    alert: <><path d="M12 3 2.8 19h18.4L12 3Z" /><path d="M12 9v4M12 17h.01" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" /><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></>,
    arrow: <path d="m9 18 6-6-6-6" />,
    price: <><path d="M12 2v20M17 6.5c-1-1-2.5-1.5-4.4-1.5-2.3 0-4.1 1.1-4.1 3 0 4.5 9 2.2 9 7 0 2-1.8 3.5-4.5 3.5-2 0-3.8-.7-5-2" /></>,
    risk: <><path d="M12 3 5 6v5c0 4.4 2.9 8.5 7 10 4.1-1.5 7-5.6 7-10V6l-7-3Z" /><path d="M12 8v5M12 16h.01" /></>,
  };

  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

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

function Brand() {
  return (
    <div className="brand-lockup" aria-label="Should I Buy This?">
      <span className="brand-mark"><Icon name="shield" size={19} /></span>
      <span>Should I Buy This?</span>
    </div>
  );
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

  const verdictTone = scores && scores.overall >= 70 ? 'success' : scores && scores.overall >= 55 ? 'warning' : 'danger';

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
        <header className="site-header">
          <Brand />
          <span className="header-badge"><Icon name="check" size={15} /> Independent purchase check</span>
        </header>

        <section className="hero" aria-labelledby="home-heading">
          <div className="eyebrow"><Icon name="spark" size={16} /> BEFORE YOU CHECK OUT</div>
          <h1 id="home-heading">A clearer answer before you spend.</h1>
          <p>Compare total price, shipping, arrival time, fit, and purchase risk without relying on a retailer's sales pitch.</p>
          <div className="trust-strip" aria-label="How the app protects your decision">
            <div><Icon name="check" /><span><b>No guessed prices</b><small>Missing data stays missing.</small></span></div>
            <div><Icon name="risk" /><span><b>Risk shown plainly</b><small>Warnings cannot hide in an average.</small></span></div>
            <div><Icon name="scale" /><span><b>Evidence over urgency</b><small>The app does not earn from the sale.</small></span></div>
          </div>
        </section>

        <section className="card profile-card" aria-labelledby="profile-heading">
          <div className="section-heading">
            <div className="section-icon"><Icon name="shield" /></div>
            <div><span className="kicker">Your buying context</span><h2 id="profile-heading">Set the basics for this check</h2></div>
          </div>
          <div className="grid profile-grid">
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
          </div>
        </section>

        <section className="card intake-card" aria-labelledby="intake-heading">
          <div className="section-heading compact-heading">
            <div className="section-icon"><Icon name="search" /></div>
            <div><span className="kicker">Start a purchase check</span><h2 id="intake-heading">What are you considering?</h2></div>
          </div>

          <nav className="input-tabs" aria-label="Product input method">
            {([
              ['link', 'Product link', 'link'],
              ['search', 'Search by name', 'search'],
              ['screenshot', 'Screenshot', 'image'],
            ] as const).map(([item, label, icon]) => (
              <button key={item} type="button" aria-pressed={mode === item} className={mode === item ? 'active' : ''} onClick={() => { setMode(item); setError(null); }}>
                <Icon name={icon} size={18} /> {label}
              </button>
            ))}
          </nav>

          {mode !== 'link' && (
            <div className="notice info" role="status">
              <span className="notice-icon"><Icon name="clock" /></span>
              <span><b>{mode === 'search' ? 'Search by name is coming next.' : 'Screenshot reading is coming next.'}</b><small>For now, paste a direct product page link or use the sample assessment.</small></span>
            </div>
          )}

          <textarea
            value={input}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value)}
            placeholder={mode === 'link' ? 'Paste a full product page link' : 'This input method is not connected yet'}
            disabled={mode !== 'link' || loading}
            aria-label="Product information"
          />

          <div className="action-stack">
            <button className="primary" type="button" disabled={mode !== 'link' || !input.trim() || loading} onClick={() => analyze(false)}>
              {loading ? <><span className="spinner compact" /> Checking the product…</> : <><Icon name="shield" /> Check this purchase <Icon name="arrow" size={18} /></>}
            </button>
            <button className="secondary" type="button" disabled={loading} onClick={() => analyze(true)}><Icon name="spark" size={18} /> Try sample assessment</button>
          </div>

          {loading && <div className="loading" role="status" aria-live="polite"><span className="spinner" />Reading the product page and checking what can be verified…</div>}

          {error && (
            <div className="error-card" role="alert" aria-live="assertive">
              <span className="notice-icon"><Icon name="alert" /></span>
              <span><strong>{error.title}</strong><p>{error.message}</p>{error.detail && <small>{error.detail}</small>}{error.action && <b className="error-action">Next: {error.action}</b>}</span>
            </div>
          )}
        </section>
      </main>
    );
  }

  const best = result.offers.length ? [...result.offers].sort((a, b) => a.deliveredPrice - b.deliveredPrice)[0] : null;

  return (
    <main>
      <header className="site-header results-header">
        <button className="back-button" type="button" onClick={resetCheck}>← New check</button>
        <Brand />
      </header>

      <section className="title" aria-labelledby="result-heading">
        <div>
          <div className="eyebrow"><Icon name="scale" size={16} /> PURCHASE ASSESSMENT</div>
          <h1 id="result-heading">{result.product.title}</h1>
          <p>{result.product.category || 'Product comparison'}</p>
          <div className={`status-pill ${result.status === 'verified' ? 'success' : 'warning'}`}>
            <Icon name={result.status === 'verified' ? 'check' : 'alert'} size={16} />
            {result.status === 'verified' ? 'Verified sample result' : 'Partial verification'}
          </div>
        </div>
        <div className={`score ${verdictTone}`} aria-label={`Overall score ${scores?.overall} out of 100. ${scores?.verdict}.`}>
          <span className="score-label">Overall</span>
          <strong>{scores?.overall}</strong>
          <span>{scores?.verdict}</span>
        </div>
      </section>

      {result.status === 'partial' && <div className="notice warning"><span className="notice-icon"><Icon name="alert" /></span><span><b>Partial verification</b><small>Only information exposed by the submitted retailer was used. No missing price or shipping data was guessed.</small></span></div>}

      <nav className="tabs" aria-label="Assessment details">
        {([
          ['overall', 'Overall', 'scale'],
          ['compare', 'Compare', 'price'],
          ['fit', 'Fit', 'ruler'],
          ['risk', 'Risk', 'risk'],
        ] as const).map(([item, label, icon]) => (
          <button key={item} type="button" aria-pressed={tab === item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}><Icon name={icon} size={17} /> {label}</button>
        ))}
      </nav>

      {tab === 'overall' && (
        <section className="card" aria-labelledby="recommendation-heading">
          <div className="metrics">
            <article><span className="metric-icon info"><Icon name="price" /></span><span>Best option</span><b>{best?.store || 'Not enough data'}</b><small>{best ? `${money(best.deliveredPrice)} before unverified shipping` : 'No verified price found'}</small></article>
            <article><span className="metric-icon info"><Icon name="scale" /></span><span>Comparison</span><b>{scores?.compare}/100</b><small>{result.offers.length} verified offer{result.offers.length === 1 ? '' : 's'}</small></article>
            <article><span className={`metric-icon ${scores && scores.risk >= 75 ? 'success' : scores && scores.risk >= 50 ? 'warning' : 'danger'}`}><Icon name="risk" /></span><span>Risk protection</span><b>{scores?.risk}/100</b><small>Based on currently verified details</small></article>
          </div>
          <div className={`callout ${verdictTone}`}>
            <span className="callout-icon"><Icon name={verdictTone === 'success' ? 'check' : verdictTone === 'warning' ? 'clock' : 'alert'} size={24} /></span>
            <div><span className="kicker">Recommendation</span><h2 id="recommendation-heading">{scores?.verdict}</h2><p>{result.summary}</p></div>
          </div>
        </section>
      )}

      {tab === 'compare' && (
        <section className="card" aria-labelledby="compare-heading">
          <div className="section-heading compact-heading"><div className="section-icon"><Icon name="price" /></div><div><span className="kicker">Verified listings</span><h2 id="compare-heading">Price comparison</h2></div></div>
          {result.offers.length === 0 ? <div className="empty-state"><Icon name="search" /><span><b>No verified offers were returned.</b><small>The app will not invent comparison prices.</small></span></div> : result.offers.map((offer, index) => (
            <article className="offer" key={`${offer.store}-${offer.deliveredPrice}`}>
              <div className="offer-store"><span className="offer-rank">{index + 1}</span><span><b>{offer.store}</b><small className={`match ${offer.match === 'Exact' ? 'success' : 'warning'}`}><Icon name={offer.match === 'Exact' ? 'check' : 'alert'} size={14} /> {offer.match} match</small></span></div>
              <div><span className="data-label">Item</span><b>{money(offer.itemPrice)}</b></div>
              <div><span className="data-label">Shipping</span><b>{offer.shipping === 0 ? 'Free' : offer.shipping == null ? 'Not verified' : money(offer.shipping)}</b></div>
              <div><span className="data-label">Listed total</span><strong>{money(offer.deliveredPrice)}</strong></div>
              <div><span className="data-label">Arrival</span><b>{offer.delivery}</b></div>
            </article>
          ))}
        </section>
      )}

      {tab === 'fit' && (
        <section className="card" aria-labelledby="fit-heading">
          <div className="section-heading compact-heading"><div className="section-icon"><Icon name="ruler" /></div><div><span className="kicker">Space check</span><h2 id="fit-heading">Will it fit?</h2></div></div>
          <p className="supporting">Enter the maximum usable dimensions for the space.</p>
          <div className="grid fit-grid">
            <label>Maximum width<input type="number" min="1" value={space.width} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSpace({ ...space, width: Number(event.target.value) })} /></label>
            <label>Maximum depth<input type="number" min="1" value={space.depth} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSpace({ ...space, depth: Number(event.target.value) })} /></label>
          </div>
          <button className="primary fit-button" type="button" onClick={() => {
            const dimensions = result.product.dimensions;
            setFit(!dimensions ? 45 : dimensions.width > space.width || dimensions.depth > space.depth ? 18 : 92);
          }}><Icon name="ruler" /> Check fit</button>
          {fit != null && <div className={`fit-result ${fit < 40 ? 'danger' : fit < 70 ? 'warning' : 'success'}`}><span className="notice-icon"><Icon name={fit < 40 ? 'alert' : fit < 70 ? 'clock' : 'check'} /></span><span><b>{fit >= 80 ? 'Fits within the entered space.' : fit >= 40 ? 'Product dimensions were not fully verified.' : 'The item is larger than the entered space.'}</b><small>Fit score: {fit}/100</small></span></div>}
        </section>
      )}

      {tab === 'risk' && (
        <section className="card" aria-labelledby="risk-heading">
          <div className="section-heading compact-heading"><div className="section-icon"><Icon name="risk" /></div><div><span className="kicker">Purchase protection</span><h2 id="risk-heading">Risk review</h2></div></div>
          <div className="risk-list">
            {result.risks.map((risk, index) => <article className={`risk ${risk.level}`} key={`${risk.title}-${index}`}><span className="notice-icon"><Icon name={risk.level === 'low' ? 'check' : risk.level === 'medium' ? 'clock' : 'alert'} /></span><div><span className={`status-pill ${risk.level === 'low' ? 'success' : risk.level === 'medium' ? 'warning' : 'danger'}`}>{risk.level === 'low' ? 'Low risk' : risk.level === 'medium' ? 'Review needed' : 'High risk'}</span><b>{risk.title}</b><p>{risk.detail}</p></div></article>)}
          </div>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
