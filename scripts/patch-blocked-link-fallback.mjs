import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../worker/index.ts', import.meta.url);
let source = await readFile(file, 'utf8');

if (source.includes('function fallbackFromBlockedUrl')) {
  console.log('Blocked retailer link fallback already applied');
  process.exit(0);
}

const insertionPoint = 'async function intakeLink(env: Env, input: string, currency: string) {';
if (!source.includes(insertionPoint)) throw new Error('Blocked-link patch failed: intakeLink was not found');

const helper = `function fallbackFromBlockedUrl(url: URL, currency: string): ProductDraft | null {
  const segments = url.pathname.split('/').filter(Boolean).map((segment) => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  });
  const productIndex = segments.findIndex((segment) => segment.toLowerCase() === 'product');
  const rawSlug = productIndex >= 0 ? segments[productIndex + 1] : segments.find((segment) => /[a-z].*[-_].*[a-z]/i.test(segment));
  if (!rawSlug) return null;

  const readable = cleanText(rawSlug.replace(/[-_]+/g, ' '), 240);
  if (readable.length < 5) return null;
  const title = readable.replace(/\\b\\w/g, (letter) => letter.toUpperCase());
  const model = cleanText((readable.match(/\\b(?=[a-z0-9]{4,20}\\b)(?=[a-z0-9]*[a-z])(?=[a-z0-9]*\\d)[a-z0-9]+\\b/i) || [])[0] || '', 120).toUpperCase();
  const brand = cleanText(readable.split(' ')[0] || '', 100);
  const seller = storeName(url.toString());

  return finalizeProduct({
    title,
    brand,
    model,
    sku: '',
    variant: '',
    category: '',
    visiblePrice: null,
    currency,
    seller,
    condition: 'Unknown',
    sourceUrl: url.toString(),
    sourceName: seller,
    confidence: model ? 'medium' : 'low',
    evidence: [],
    warnings: ['The retailer blocked page reading, so the product identity was inferred from the link and must be confirmed.'],
  });
}

`;
source = source.replace(insertionPoint, helper + insertionPoint);

const oldBlock = `  const page = await fetchRetailerPage(url);
  if (page.error) return page.error;
  const html = page.html!;`;
const newBlock = `  const page = await fetchRetailerPage(url);
  if (page.error) {
    const fallback = fallbackFromBlockedUrl(url, currency);
    if (fallback) return json({ product: fallback, blockedSource: true });
    return page.error;
  }
  const html = page.html!;`;
if (!source.includes(oldBlock)) throw new Error('Blocked-link patch failed: page error handling was not found');
source = source.replace(oldBlock, newBlock);

await writeFile(file, source, 'utf8');
console.log('Applied blocked retailer URL fallback');
