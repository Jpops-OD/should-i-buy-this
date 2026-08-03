import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/main-phase3.tsx', import.meta.url);
let source = await readFile(file, 'utf8');

function replaceOnce(find, replacement, label) {
  if (!source.includes(find)) throw new Error(`Phase 5 patch failed: ${label}`);
  source = source.replace(find, replacement);
}

const lines = (...items) => items.join('\n');

replaceOnce(
  "import './no-cost.css';",
  "import './no-cost.css';\nimport './phase5.css';",
  'no-cost stylesheet import was not found',
);

replaceOnce(
  lines(
    '  evidence: string[];',
    '  warnings: string[];',
    '};',
  ),
  lines(
    '  evidence: string[];',
    '  warnings: string[];',
    '  dimensions?: { width: number; depth: number; height?: number };',
    '  minimumClearance?: number;',
    '  compatibilityNotes?: string;',
    '};',
  ),
  'ProductDraft type was not found',
);

replaceOnce(
  "  const [listingUrlsInput, setListingUrlsInput] = useState('');",
  lines(
    "  const [listingUrlsInput, setListingUrlsInput] = useState('');",
    "  const [productWidth, setProductWidth] = useState('');",
    "  const [productDepth, setProductDepth] = useState('');",
    "  const [productHeight, setProductHeight] = useState('');",
    "  const [minimumClearance, setMinimumClearance] = useState('0');",
    "  const [compatibilityNotes, setCompatibilityNotes] = useState('');",
    "  const [fitMessage, setFitMessage] = useState('');",
  ),
  'Phase 5 state insertion point was not found',
);

replaceOnce(
  '<label>Condition<select value={intakeDraft.condition} onChange={(event) => updateIntake({ condition: event.target.value })}><option value="New">New</option><option value="Used">Used</option><option value="Refurbished">Refurbished</option><option value="Open box">Open box</option><option value="Unknown">Unknown</option></select></label>',
  lines(
    '<label>Condition<select value={intakeDraft.condition} onChange={(event) => updateIntake({ condition: event.target.value })}><option value="New">New</option><option value="Used">Used</option><option value="Refurbished">Refurbished</option><option value="Open box">Open box</option><option value="Unknown">Unknown</option></select></label>',
    '<fieldset className="dimension-fields wide-field">',
    '  <legend>Product dimensions in inches <span>Optional now; required for a fit result</span></legend>',
    '  <label>Width<input type="number" min="0" step="0.1" value={productWidth} onChange={(event) => { setProductWidth(event.target.value); const width = Number(event.target.value); updateIntake({ dimensions: width > 0 && Number(productDepth) > 0 ? { width, depth: Number(productDepth), height: Number(productHeight) || undefined } : undefined }); }} /></label>',
    '  <label>Depth<input type="number" min="0" step="0.1" value={productDepth} onChange={(event) => { setProductDepth(event.target.value); const depth = Number(event.target.value); updateIntake({ dimensions: Number(productWidth) > 0 && depth > 0 ? { width: Number(productWidth), depth, height: Number(productHeight) || undefined } : undefined }); }} /></label>',
    '  <label>Height<input type="number" min="0" step="0.1" value={productHeight} onChange={(event) => { setProductHeight(event.target.value); const height = Number(event.target.value); updateIntake({ dimensions: Number(productWidth) > 0 && Number(productDepth) > 0 ? { width: Number(productWidth), depth: Number(productDepth), height: height || undefined } : undefined }); }} /></label>',
    '  <label>Extra clearance<input type="number" min="0" step="0.1" value={minimumClearance} onChange={(event) => { setMinimumClearance(event.target.value); updateIntake({ minimumClearance: Number(event.target.value) || 0 }); }} /></label>',
    '</fieldset>',
    '<label className="wide-field">Compatibility notes<textarea value={compatibilityNotes} onChange={(event) => { setCompatibilityNotes(event.target.value); updateIntake({ compatibilityNotes: event.target.value }); }} placeholder="Example: Needs a grounded outlet, must fit under upper cabinets, cannot exceed a 15-amp circuit…" /></label>',
  ),
  'Product confirmation condition field was not found',
);

replaceOnce(
  '<div><span className="kicker">Verified listings</span><h2>Price comparison</h2></div>',
  '<div><span className="kicker">Verified listings</span><h2>Price comparison</h2><p>Paste exact retailer product pages below. Search-result pages are ignored because they do not represent a single verifiable offer.</p></div>',
  'Compare heading was not found',
);

replaceOnce(
  '          {result.offers.length === 0',
  lines(
    '          <div className="compare-link-entry">',
    '            <label>Retailer product links<textarea value={listingUrlsInput} onChange={(event) => setListingUrlsInput(event.target.value)} placeholder="Paste one exact product-page URL per line" /></label>',
    '            <button className="primary" type="button" disabled={loading || !listingUrlsInput.trim()} onClick={() => analyze(false)}>{loading ? <><span className="spinner compact" /> Verifying links…</> : <><Icon name="check" /> Verify and compare links</>}</button>',
    '            <small>Use direct product pages from stores such as Kohl’s, Staples, Best Buy, or Walmart. Do not paste a Google search-results URL.</small>',
    '          </div>',
    '          {result.offers.length === 0',
  ),
  'Compare offer list insertion point was not found',
);

replaceOnce(
  lines(
    '            <button className="primary fit-button" type="button" onClick={() => {',
    '              const dimensions = result.product.dimensions;',
    '              setFit(!dimensions ? 45 : dimensions.width > space.width || dimensions.depth > space.depth ? 18 : 92);',
    '            }}>',
    '              <Icon name="ruler" /> Check fit',
    '            </button>',
  ),
  lines(
    '            <button className="primary fit-button" type="button" onClick={() => {',
    '              const dimensions = result.intake?.dimensions;',
    '              const clearance = result.intake?.minimumClearance || 0;',
    '              if (!dimensions?.width || !dimensions?.depth) {',
    "                setFit(null); setFitMessage('Enter the product width and depth on the product-details screen before checking fit.'); return;",
    '              }',
    '              const requiredWidth = dimensions.width + clearance * 2;',
    '              const requiredDepth = dimensions.depth + clearance * 2;',
    '              const spaceFits = requiredWidth <= space.width && requiredDepth <= space.depth;',
    '              const doorwayFits = !space.doorway || Math.min(dimensions.width, dimensions.depth) <= space.doorway;',
    '              const next = spaceFits && doorwayFits ? 100 : spaceFits ? 55 : 10;',
    '              setFit(next);',
    '              setFitMessage(!spaceFits ? `Needs at least ${requiredWidth} × ${requiredDepth} inches including clearance.` : !doorwayFits ? `The narrowest product side is ${Math.min(dimensions.width, dimensions.depth)} inches, wider than the entered doorway.` : `Fits with ${Math.max(0, space.width - requiredWidth)} inches of width and ${Math.max(0, space.depth - requiredDepth)} inches of depth remaining.`);',
    '            }}>',
    '              <Icon name="ruler" /> Check fit',
    '            </button>',
  ),
  'Placeholder fit calculation was not found',
);

replaceOnce(
  '<span><b>{fit >= 80 ? \'Fits within the entered space.\' : fit >= 40 ? \'Product dimensions were not fully verified.\' : \'The item is larger than the entered space.\'}</b><small>Fit score: {fit}/100</small></span>',
  '<span><b>{fit >= 80 ? \'Fits within the entered space.\' : fit >= 40 ? \'It fits in the space but may not pass through the doorway.\' : \'The item is larger than the entered space.\'}</b><small>{fitMessage} Fit score: {fit}/100</small></span>',
  'Fit result copy was not found',
);

replaceOnce(
  '          {fit != null && (',
  lines(
    '          {fit == null && fitMessage && <div className="fit-result warning"><span className="notice-icon"><Icon name="alert" /></span><span><b>Product dimensions are required.</b><small>{fitMessage}</small></span></div>}',
    '          {result.intake?.compatibilityNotes && <div className="compatibility-note"><b>Compatibility notes</b><p>{result.intake.compatibilityNotes}</p></div>}',
    '          {fit != null && (',
  ),
  'Fit result insertion point was not found',
);

await writeFile(file, source, 'utf8');
console.log('Applied Phase 5 fit and comparison improvements');
