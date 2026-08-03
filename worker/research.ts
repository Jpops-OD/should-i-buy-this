export type ResearchEnv = {};

type ProductDraft = {
  title: string; brand: string; model: string; sku: string; variant: string; category: string;
  visiblePrice: number | null; currency: string; seller: string; condition: string;
  sourceUrl: string; sourceName: string; confidence: 'high' | 'medium' | 'low';
  evidence: string[]; warnings: string[];
};

type ResearchRequest = {
  product?: ProductDraft;
  listingUrls?: string[];
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
  const label = hostname(value).split('.')[0] || 'Retailer';
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
        title: clean(product.name, 260),
        brand: stringValue(product.brand),
        model: clean(product.model || product.mpn, 120),
        sku: clean(product.sku || product.gtin14 || product.gtin13 || product.gtin12 || product.gtin8 || product.gtin, 120),
        variant: clean(product.color || product.size || product.material, 160),
        price: parsePrice(offer.price ?? offer.lowPrice ?? offer.highPrice),
        currency: clean(offer.priceCurrency, 3).toUpperCase() || 'USD',
        seller: stringValue(offer.seller || product.seller),
        condition: stringValue(offer.itemCondition || product.itemCondition).split('/').pop() || 'Unknown',
        availability: stringValue(offer.availability).split('/').pop() || 'Unknown',
        shipping: parsePrice(shippingRate?.value ?? shippingRate),
        delivery: shippingDetails?.deliveryTime?.transitTime?.maxValue
          ? `Up to ${clean(shippingDetails.deliveryTime.transitTime.maxValue, 20)} days`
          : 'Confirm at checkout',
      };
    }
  }
  return null;
}

function pick(html: string, expression: RegExp) {
  return clean(html.match(expression)?.[1] || '');
}

function parsePage(html: string, url: string): PageProduct {
  const structured = parseJsonLd(html);
  return {
    title: structured?.title || pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || pick(html, /<title[^>]*>([^<]+)/i),
    brand: structured?.brand || pick(html, /"brand"\s*:\s*(?:\{[^}]*"name"\s*:\s*)?"([^"]+)"/i),
    model: structured?.model || pick(html, /"(?:model|mpn)"\s*:\s*"([^"]+)"/i),
    sku: structured?.sku || pick(html, /"(?:sku|gtin13|gtin12|gtin)"\s*:\s*"([^"]+)"/i),
    variant: structured?.variant || '',
    price: structured?.price ?? parsePrice(pick(html, /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)/i) || pick(html, /"price"\s*:\s*"?([0-9,.]+)/i)),
    currency: structured?.currency || pick(html, /"priceCurrency"\s*:\s*"([A-Z]{3})"/i) || 'USD',
    seller: structured?.seller || storeName(url),
    condition: structured?.condition || 'Unknown',
    availability: structured?.availability || 'Unknown',
    shipping: structured?.shipping ?? null,
    delivery: structured?.delivery || 'Confirm at checkout',
  };
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ShouldIBuyThis/1.0)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
      cf: { cacheTtl: 0 },
    });
  } finally { clearTimeout(timer); }
}

function sourceOffer(product: ProductDraft, checkedAt: string): Offer | null {
  if (product.visiblePrice == null || !product.sourceUrl || !validPublicUrl(product.sourceUrl)) return null;
  const store = product.seller || product.sourceName || storeName(product.sourceUrl);
  return {
    store, itemPrice: product.visiblePrice, shipping: null, deliveredPrice: product.visiblePrice,
    delivery: 'Confirm at checkout', match: 'Exact', url: product.sourceUrl, seller: store,
    condition: product.condition || 'Unknown', availability: 'Confirm on listing', priceVerified: true,
    shippingVerified: false, checkedAt, matchReason: 'This product and visible price were confirmed during intake.',
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
      store: storeName(url), itemPrice: page.price, shipping: page.shipping,
      deliveredPrice: page.price + (page.shipping ?? 0), delivery: page.delivery,
      match: matched.match, url, seller: page.seller || storeName(url),
      condition: page.condition || 'Unknown', availability: page.availability || 'Unknown',
      priceVerified: true, shippingVerified: page.shipping != null, checkedAt, matchReason: matched.reason,
    } satisfies Offer };
  } catch { return { failed: host }; }
}

function uniqueOffers(offers: Offer[]) {
  const seen = new Set<string>();
  return offers.filter((offer) => {
    const key = `${hostname(offer.url)}|${offer.itemPrice}|${normalize(offer.condition)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
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
  const submitted = Array.isArray(body.listingUrls) ? body.listingUrls : [];
  const urls = [...new Set([product.sourceUrl, ...submitted].map((value) => clean(value, 1500)).filter((value) => value && validPublicUrl(value)))].slice(0, 10);
  const offers: Offer[] = [];
  const initial = sourceOffer(product, checkedAt);
  if (initial) offers.push(initial);

  const inspections = await Promise.all(urls.filter((url) => url !== product.sourceUrl || !initial).map((url) => inspectUrl(url, product, checkedAt)));
  const blockedStores: string[] = [];
  const failedStores: string[] = [];
  const rejectedStores: string[] = [];
  for (const item of inspections) {
    if ('offer' in item && item.offer) offers.push(item.offer);
    if ('blocked' in item && item.blocked) blockedStores.push(item.blocked);
    if ('failed' in item && item.failed) failedStores.push(item.failed);
    if ('rejected' in item && item.rejected) rejectedStores.push(item.rejected);
  }

  const verified = uniqueOffers(offers);
  const decisionReady = verified.length >= 2;
  const query = searchQuery(product);
  const searchLinks = {
    google: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`,
    bing: `https://www.bing.com/shop?q=${encodeURIComponent(query)}`,
    walmart: `https://www.walmart.com/search?q=${encodeURIComponent(query)}`,
    target: `https://www.target.com/s?searchTerm=${encodeURIComponent(query)}`,
    bestBuy: `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(query)}`,
    amazon: `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
  };

  return json({
    product: { title: product.title, brand: product.brand, model: product.model, sku: product.sku, variant: product.variant, category: product.category, seller: product.seller, condition: product.condition },
    offers: verified,
    risks: decisionReady
      ? [{ level: 'low', title: 'Multiple listings verified', detail: `${verified.length} comparable public listings were checked.` }]
      : [{ level: 'medium', title: 'More listings are needed', detail: 'Add at least one more retailer product link before the app creates a recommendation.' }],
    summary: decisionReady
      ? `${verified.length} comparable retailer listings were verified. Shipping that could not be read remains marked for checkout confirmation.`
      : 'The product is confirmed. Use the free search links below, paste retailer product links, and the app will verify them without a paid search service.',
    status: decisionReady ? 'researched' : 'research-limited',
    source: product.sourceUrl,
    decisionReady,
    intake: product,
    research: {
      query, checkedAt, searchedCount: urls.length, attemptedCount: inspections.length,
      blockedStores: [...new Set(blockedStores)], failedStores: [...new Set(failedStores)], rejectedStores: [...new Set(rejectedStores)],
      supportedRetailers: [], setupRequired: false, providerError: '', noCost: true, searchLinks,
    },
  });
}
