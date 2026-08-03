export type ResearchEnv = {};

type ProductDraft = {
  title: string; brand: string; model: string; sku: string; variant: string; category: string;
  visiblePrice: number | null; currency: string; seller: string; condition: string;
  sourceUrl: string; sourceName: string; confidence: 'high' | 'medium' | 'low';
  evidence: string[]; warnings: string[];
};

type ResearchRequest = {
  product?: ProductDraft;
  zip?: string;
  priority?: 'balance' | 'price' | 'speed';
  currency?: string;
  memberships?: string[];
};

type PageProduct = {
  title: string; brand: string; model: string; sku: string; variant: string;
  price: number | null; currency: string; seller: string; condition: string;
  availability: string; shipping: number | null; delivery: string;
};

type Offer = {
  store: string; itemPrice: number; shipping: number | null; deliveredPrice: number;
  delivery: string; match: 'Exact' | 'Likely'; url: string; seller: string;
  condition: string; availability: string; priceVerified: boolean;
  shippingVerified: boolean; checkedAt: string; matchReason: string;
};

type RetailerAdapter = {
  name: string;
  host: string;
  searchUrl: (query: string) => string;
  productPath: RegExp;
};

const RETAILERS: RetailerAdapter[] = [
  { name: 'Walmart', host: 'walmart.com', searchUrl: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`, productPath: /^\/ip\//i },
  { name: 'Best Buy', host: 'bestbuy.com', searchUrl: (q) => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}`, productPath: /\/product\//i },
  { name: "Kohl's", host: 'kohls.com', searchUrl: (q) => `https://www.kohls.com/search.jsp?submit-search=web-regular&search=${encodeURIComponent(q)}`, productPath: /\/product\/prd-/i },
  { name: 'Staples', host: 'staples.com', searchUrl: (q) => `https://www.staples.com/${encodeURIComponent(q)}/directory_${encodeURIComponent(q)}`, productPath: /\/product_/i },
  { name: 'Target', host: 'target.com', searchUrl: (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`, productPath: /\/p\//i },
  { name: 'Amazon', host: 'amazon.com', searchUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`, productPath: /\/dp\//i },
  { name: 'Home Depot', host: 'homedepot.com', searchUrl: (q) => `https://www.homedepot.com/s/${encodeURIComponent(q)}`, productPath: /\/p\//i },
  { name: "Lowe's", host: 'lowes.com', searchUrl: (q) => `https://www.lowes.com/search?searchTerm=${encodeURIComponent(q)}`, productPath: /\/pd\//i },
  { name: 'Macy’s', host: 'macys.com', searchUrl: (q) => `https://www.macys.com/shop/featured/${encodeURIComponent(q)}`, productPath: /\/shop\/product\//i },
  { name: 'Wayfair', host: 'wayfair.com', searchUrl: (q) => `https://www.wayfair.com/keyword.php?keyword=${encodeURIComponent(q)}`, productPath: /\.html/i },
];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json;charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});

const clean = (value: unknown, max = 500) => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const normalize = (value: unknown) => clean(value, 500)
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const parsePrice = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
};

const hostname = (value: string) => {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
};

const storeName = (value: string) => {
  const host = hostname(value);
  const configured = RETAILERS.find((retailer) => host === retailer.host || host.endsWith(`.${retailer.host}`));
  if (configured) return configured.name;
  const label = host.split('.')[0] || 'Retailer';
  return label.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

function validPublicUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
    return true;
  } catch { return false; }
}

function tokenSet(value: string) {
  return new Set(normalize(value).split(' ').filter((token) => token.length > 1));
}

function similarity(left: string, right: string) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / new Set([...a, ...b]).size;
}

function conditionFamily(value: string) {
  const text = normalize(value);
  if (text.includes('refurb')) return 'refurbished';
  if (text.includes('open box')) return 'open box';
  if (text.includes('used') || text.includes('pre owned')) return 'used';
  if (text.includes('new')) return 'new';
  return 'unknown';
}

function matchProduct(input: ProductDraft, page: PageProduct) {
  const inputIds = [input.sku, input.model].map(normalize).filter(Boolean);
  const pageIds = [page.sku, page.model].map(normalize).filter(Boolean);
  const exactIdentifier = inputIds.some((id) => pageIds.includes(id));
  const titleScore = similarity(`${input.brand} ${input.title} ${input.variant}`, `${page.brand} ${page.title} ${page.variant}`);
  const brandMatch = !input.brand || !page.brand || normalize(input.brand) === normalize(page.brand)
    || normalize(page.title).includes(normalize(input.brand));
  const inputCondition = conditionFamily(input.condition);
  const pageCondition = conditionFamily(page.condition);
  if (inputCondition !== 'unknown' && pageCondition !== 'unknown' && inputCondition !== pageCondition) {
    return { accepted: false, match: 'Likely' as const, reason: 'Condition does not match the confirmed product.' };
  }
  if (exactIdentifier) return { accepted: true, match: 'Exact' as const, reason: 'Model or product identifier matches exactly.' };
  if (brandMatch && titleScore >= 0.55) return { accepted: true, match: 'Likely' as const, reason: 'Brand and product-title details closely match.' };
  if (titleScore >= 0.72) return { accepted: true, match: 'Likely' as const, reason: 'Product-title details closely match.' };
  return { accepted: false, match: 'Likely' as const, reason: 'The listing could not be matched confidently.' };
}

function flattenJson(value: unknown): Record<string, any>[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(flattenJson);
  const object = value as Record<string, any>;
  const items = [object];
  if (Array.isArray(object['@graph'])) items.push(...object['@graph'].flatMap(flattenJson));
  return items;
}

function typeIncludes(value: unknown, expected: string) {
  const values = Array.isArray(value) ? value : [value];
  return values.some((item) => normalize(item) === normalize(expected));
}

function first(value: any): any {
  if (!value) return {};
  return Array.isArray(value) ? value.find(Boolean) || {} : value;
}

function stringValue(value: any): string {
  if (typeof value === 'string' || typeof value === 'number') return clean(value);
  if (value && typeof value === 'object') return clean(value.name || value.value || value['@id'] || '');
  return '';
}

function parseJsonLd(html: string): PageProduct | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    let parsed: unknown;
    try { parsed = JSON.parse(block[1].replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").trim()); }
    catch { continue; }
    const products = flattenJson(parsed).filter((item) => typeIncludes(item['@type'], 'Product'));
    for (const product of products) {
      const offer = first(product.offers);
      const shippingDetails = first(offer.shippingDetails);
      const shippingRate = shippingDetails?.shippingRate;
      return {
        title: clean(product.name, 260), brand: stringValue(product.brand),
        model: clean(product.model || product.mpn, 120),
        sku: clean(product.sku || product.gtin14 || product.gtin13 || product.gtin12 || product.gtin8 || product.gtin, 120),
        variant: clean(product.color || product.size || product.material, 160),
        price: parsePrice(offer.price ?? offer.lowPrice ?? offer.highPrice),
        currency: clean(offer.priceCurrency, 3).toUpperCase() || 'USD', seller: stringValue(offer.seller || product.seller),
        condition: stringValue(offer.itemCondition || product.itemCondition).split('/').pop() || 'Unknown',
        availability: stringValue(offer.availability).split('/').pop() || 'Unknown',
        shipping: parsePrice(shippingRate?.value ?? shippingRate),
        delivery: shippingDetails?.deliveryTime?.transitTime?.maxValue ? `Up to ${clean(shippingDetails.deliveryTime.transitTime.maxValue, 20)} days` : 'Confirm at checkout',
      };
    }
  }
  return null;
}

function pick(html: string, expression: RegExp) { return clean(html.match(expression)?.[1] || ''); }

function parsePage(html: string, url: string): PageProduct {
  const structured = parseJsonLd(html);
  return {
    title: structured?.title || pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || pick(html, /<title[^>]*>([^<]+)/i),
    brand: structured?.brand || pick(html, /"brand"\s*:\s*(?:\{[^}]*"name"\s*:\s*)?"([^"]+)"/i),
    model: structured?.model || pick(html, /"(?:model|mpn)"\s*:\s*"([^"]+)"/i),
    sku: structured?.sku || pick(html, /"(?:sku|gtin13|gtin12|gtin)"\s*:\s*"([^"]+)"/i), variant: structured?.variant || '',
    price: structured?.price ?? parsePrice(pick(html, /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)/i) || pick(html, /"price"\s*:\s*"?([0-9,.]+)/i)),
    currency: structured?.currency || pick(html, /"priceCurrency"\s*:\s*"([A-Z]{3})"/i) || 'USD',
    seller: structured?.seller || storeName(url), condition: structured?.condition || 'Unknown', availability: structured?.availability || 'Unknown',
    shipping: structured?.shipping ?? null, delivery: structured?.delivery || 'Confirm at checkout',
  };
}

async function fetchWithTimeout(url: string, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow', signal: controller.signal, cf: { cacheTtl: 0 },
    });
  } finally { clearTimeout(timer); }
}

function sourceOffer(product: ProductDraft, checkedAt: string): Offer | null {
  if (product.visiblePrice == null || !product.sourceUrl || !validPublicUrl(product.sourceUrl)) return null;
  const store = product.seller || product.sourceName || storeName(product.sourceUrl);
  return {
    store, itemPrice: product.visiblePrice, shipping: null, deliveredPrice: product.visiblePrice, delivery: 'Confirm at checkout',
    match: 'Exact', url: product.sourceUrl, seller: store, condition: product.condition || 'Unknown', availability: 'Confirm on listing',
    priceVerified: true, shippingVerified: false, checkedAt, matchReason: 'This product and visible price were confirmed during intake.',
  };
}

async function inspectUrl(url: string, product: ProductDraft, checkedAt: string) {
  const host = hostname(url);
  try {
    const response = await fetchWithTimeout(url);
    if ([401, 403, 429].includes(response.status)) return { blocked: host };
    if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return { failed: host };
    const page = parsePage((await response.text()).slice(0, 1_500_000), url);
    if (page.price == null || !page.title) return { failed: host };
    const matched = matchProduct(product, page);
    if (!matched.accepted) return { rejected: host };
    return { offer: {
      store: storeName(url), itemPrice: page.price, shipping: page.shipping, deliveredPrice: page.price + (page.shipping ?? 0),
      delivery: page.delivery, match: matched.match, url, seller: page.seller || storeName(url), condition: page.condition || 'Unknown',
      availability: page.availability || 'Unknown', priceVerified: true, shippingVerified: page.shipping != null, checkedAt, matchReason: matched.reason,
    } satisfies Offer };
  } catch { return { failed: host }; }
}

function absoluteRetailerUrl(href: string, adapter: RetailerAdapter) {
  try {
    const decoded = href.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\u002F/g, '/');
    const url = new URL(decoded, `https://www.${adapter.host}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!(host === adapter.host || host.endsWith(`.${adapter.host}`))) return '';
    if (!adapter.productPath.test(url.pathname)) return '';
    url.hash = '';
    ['utm_source','utm_medium','utm_campaign','ref','ref_','gad_source','gclid','cid','CID'].forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch { return ''; }
}

function extractProductUrls(html: string, adapter: RetailerAdapter) {
  const values = [...html.matchAll(/(?:href|url|canonicalUrl)[=:]\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    const url = absoluteRetailerUrl(value, adapter);
    if (!url || seen.has(url)) continue;
    seen.add(url); urls.push(url);
    if (urls.length >= 4) break;
  }
  return urls;
}

async function discoverRetailer(adapter: RetailerAdapter, query: string) {
  try {
    const response = await fetchWithTimeout(adapter.searchUrl(query), 7000);
    if ([401, 403, 429].includes(response.status)) return { adapter, urls: [] as string[], blocked: true };
    if (!response.ok) return { adapter, urls: [] as string[], failed: true };
    const html = (await response.text()).slice(0, 1_500_000);
    return { adapter, urls: extractProductUrls(html, adapter) };
  } catch { return { adapter, urls: [] as string[], failed: true }; }
}

function uniqueOffers(offers: Offer[]) {
  const seen = new Set<string>();
  return offers.filter((offer) => {
    const key = `${hostname(offer.url)}|${offer.itemPrice}|${normalize(offer.condition)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => a.deliveredPrice - b.deliveredPrice);
}

function searchQuery(product: ProductDraft) {
  const identifier = clean(product.sku || product.model, 120);
  return clean(identifier ? `${product.brand} ${identifier}` : `${product.brand} ${product.title} ${product.variant}`, 300);
}

export async function handleResearch(request: Request, _env: ResearchEnv, _ctx: ExecutionContext) {
  let body: ResearchRequest;
  try { body = await request.json(); }
  catch { return json({ code: 'INVALID_REQUEST', error: 'The research request could not be read.' }, 400); }
  const product = body.product;
  if (!product?.title?.trim()) return json({ code: 'PRODUCT_REQUIRED', error: 'Confirm a product before comparing listings.' }, 400);

  const checkedAt = new Date().toISOString();
  const query = searchQuery(product);
  const offers: Offer[] = [];
  const initial = sourceOffer(product, checkedAt);
  if (initial) offers.push(initial);

  const sourceHost = hostname(product.sourceUrl);
  const adapters = RETAILERS.filter((adapter) => !(sourceHost === adapter.host || sourceHost.endsWith(`.${adapter.host}`)));
  const discoveries = await Promise.all(adapters.map((adapter) => discoverRetailer(adapter, query)));
  const blockedStores = discoveries.filter((item) => item.blocked).map((item) => item.adapter.name);
  const failedStores = discoveries.filter((item) => item.failed).map((item) => item.adapter.name);
  const candidateUrls = [...new Set(discoveries.flatMap((item) => item.urls))].slice(0, 18);
  const inspections = await Promise.all(candidateUrls.map((url) => inspectUrl(url, product, checkedAt)));
  const rejectedStores: string[] = [];
  for (const item of inspections) {
    if ('offer' in item && item.offer) offers.push(item.offer);
    if ('blocked' in item && item.blocked) blockedStores.push(storeName(`https://${item.blocked}`));
    if ('failed' in item && item.failed) failedStores.push(storeName(`https://${item.failed}`));
    if ('rejected' in item && item.rejected) rejectedStores.push(storeName(`https://${item.rejected}`));
  }

  const verified = uniqueOffers(offers);
  const decisionReady = verified.length >= 2;
  return json({
    product: { title: product.title, brand: product.brand, model: product.model, sku: product.sku, variant: product.variant, category: product.category, seller: product.seller, condition: product.condition },
    offers: verified,
    risks: decisionReady
      ? [{ level: 'low', title: 'Multiple listings verified', detail: `${verified.length} comparable public listings were checked.` }]
      : [{ level: 'medium', title: 'Automatic search was limited', detail: 'The app did not verify at least two comparable retailer listings. Blocked or unreadable stores are listed separately.' }],
    summary: decisionReady
      ? `${verified.length} comparable retailer listings were found and verified automatically. Shipping that could not be read remains marked for checkout confirmation.`
      : 'The product is confirmed, but automatic retailer discovery did not produce two readable matching listings. No comparison price was invented.',
    status: decisionReady ? 'researched' : 'research-limited', source: product.sourceUrl, decisionReady, intake: product,
    research: {
      query, checkedAt, searchedCount: adapters.length, attemptedCount: candidateUrls.length,
      blockedStores: [...new Set(blockedStores)], failedStores: [...new Set(failedStores)], rejectedStores: [...new Set(rejectedStores)],
      supportedRetailers: RETAILERS.map((retailer) => retailer.name), setupRequired: false, providerError: '', noCost: true,
      discoveryMode: 'automatic-retailer-adapters',
    },
  });
}
