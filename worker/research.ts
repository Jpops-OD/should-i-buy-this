export type ResearchEnv = { BRAVE_SEARCH_API_KEY?: string };

type ProductDraft = {
  title: string; brand: string; model: string; sku: string; variant: string; category: string;
  visiblePrice: number | null; currency: string; seller: string; condition: string;
  sourceUrl: string; sourceName: string; confidence: 'high' | 'medium' | 'low';
  evidence: string[]; warnings: string[];
};

type ResearchRequest = {
  product?: ProductDraft; zip?: string; priority?: 'balance' | 'price' | 'speed';
  currency?: string; memberships?: string[];
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

type SearchCandidate = { title: string; url: string; host: string };

const RETAILER_HOSTS = [
  'amazon.com','apple.com','bestbuy.com','bjs.com','costco.com','crateandbarrel.com',
  'dell.com','ebay.com','homedepot.com','ikea.com','kitchenaid.com','kohls.com',
  'lenovo.com','lowes.com','macys.com','newegg.com','officedepot.com','qvc.com',
  'samsclub.com','staples.com','target.com','walmart.com','wayfair.com','williams-sonoma.com',
];

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json;charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
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

const supportedRetailer = (host: string) => RETAILER_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));

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
      const availability = stringValue(offer.availability).split('/').pop() || 'Unknown';
      const condition = stringValue(offer.itemCondition || product.itemCondition).split('/').pop() || 'Unknown';
      const delivery = shippingDetails?.deliveryTime?.transitTime?.maxValue
        ? `Up to ${clean(shippingDetails.deliveryTime.transitTime.maxValue, 20)} days`
        : 'Confirm at checkout';
      return {
        title: clean(product.name, 260),
        brand: stringValue(product.brand),
        model: clean(product.model || product.mpn, 120),
        sku: clean(product.sku || product.gtin14 || product.gtin13 || product.gtin12 || product.gtin8 || product.gtin, 120),
        variant: clean(product.color || product.size || product.material, 160),
        price: parsePrice(offer.price ?? offer.lowPrice ?? offer.highPrice),
        currency: clean(offer.priceCurrency, 3).toUpperCase() || 'USD',
        seller: stringValue(offer.seller || product.seller),
        condition,
        availability,
        shipping: parsePrice(shippingRate?.value ?? shippingRate),
        delivery,
      };
    }
  }
  return null;
}

function pick(html: string, expression: RegExp) {
  return clean(html.match(expression)?.[1] || '');
}

function parsePage(html: string, url: string, fallbackTitle = ''): PageProduct {
  const structured = parseJsonLd(html);
  const title = structured?.title
    || pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
    || pick(html, /<title[^>]*>([^<]+)/i)
    || fallbackTitle;
  return {
    title,
    brand: structured?.brand || pick(html, /"brand"\s*:\s*(?:\{[^}]*"name"\s*:\s*)?"([^"]+)"/i),
    model: structured?.model || pick(html, /"(?:model|mpn)"\s*:\s*"([^"]+)"/i),
    sku: structured?.sku || pick(html, /"(?:sku|gtin13|gtin12|gtin)"\s*:\s*"([^"]+)"/i),
    variant: structured?.variant || '',
    price: structured?.price ?? parsePrice(
      pick(html, /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)/i)
      || pick(html, /"price"\s*:\s*"?([0-9,.]+)/i),
    ),
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
        'user-agent': 'Mozilla/5.0 (compatible; ShouldIBuyThis/1.0; +https://should-i-buy-this.workers.dev)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
      cf: { cacheTtl: 0 },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function searchWeb(product: ProductDraft, env: ResearchEnv) {
  const identifier = clean(product.sku || product.model, 120);
  const descriptive = clean([product.brand, product.title, product.variant].filter(Boolean).join(' '), 300);
  const query = identifier ? `"${identifier}" ${product.brand || ''} buy price` : `${descriptive} buy price`;
  if (!env.BRAVE_SEARCH_API_KEY) return { candidates: [] as SearchCandidate[], query, error: 'BRAVE_SEARCH_API_KEY is not configured.' };

  const endpoint = new URL('https://api.search.brave.com/res/v1/web/search');
  endpoint.searchParams.set('q', query.slice(0, 400));
  endpoint.searchParams.set('country', 'US');
  endpoint.searchParams.set('search_lang', 'en');
  endpoint.searchParams.set('ui_lang', 'en-US');
  endpoint.searchParams.set('count', '20');
  endpoint.searchParams.set('safesearch', 'strict');
  const response = await fetch(endpoint.toString(), {
    headers: { accept: 'application/json', 'accept-encoding': 'gzip', 'x-subscription-token': env.BRAVE_SEARCH_API_KEY },
  });
  if (!response.ok) return { candidates: [] as SearchCandidate[], query, error: `Search provider returned HTTP ${response.status}.` };
  const data: any = await response.json();
  const results = Array.isArray(data?.web?.results) ? data.web.results : [];
  const seen = new Set<string>();
  const candidates: SearchCandidate[] = [];
  for (const result of results) {
    const url = clean(result?.url, 1200);
    const host = hostname(url);
    if (!url || !supportedRetailer(host) || seen.has(url)) continue;
    seen.add(url);
    candidates.push({ title: clean(result?.title, 260), url, host });
    if (candidates.length >= 8) break;
  }
  return { candidates, query, error: '' };
}

function sourceOffer(product: ProductDraft, checkedAt: string): Offer | null {
  if (product.visiblePrice == null) return null;
  const store = product.seller || product.sourceName || (product.sourceUrl ? storeName(product.sourceUrl) : 'Submitted source');
  return {
    store, itemPrice: product.visiblePrice, shipping: null, deliveredPrice: product.visiblePrice,
    delivery: 'Confirm at checkout', match: 'Exact', url: product.sourceUrl, seller: store,
    condition: product.condition || 'Unknown', availability: 'Confirm on listing', priceVerified: true,
    shippingVerified: false, checkedAt, matchReason: 'This product and visible price were confirmed during intake.',
  };
}

async function inspectCandidate(candidate: SearchCandidate, product: ProductDraft, checkedAt: string) {
  try {
    const response = await fetchWithTimeout(candidate.url);
    if ([401, 403, 429].includes(response.status)) return { blocked: candidate.host };
    if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return { failed: candidate.host };
    const page = parsePage((await response.text()).slice(0, 1_500_000), candidate.url, candidate.title);
    if (page.price == null || !page.title) return { failed: candidate.host };
    const matched = matchProduct(product, page);
    if (!matched.accepted) return { rejected: candidate.host };
    const shipping = page.shipping;
    const offer: Offer = {
      store: storeName(candidate.url), itemPrice: page.price, shipping,
      deliveredPrice: page.price + (shipping ?? 0), delivery: page.delivery,
      match: matched.match, url: candidate.url, seller: page.seller || storeName(candidate.url),
      condition: page.condition || 'Unknown', availability: page.availability || 'Unknown',
      priceVerified: true, shippingVerified: shipping != null, checkedAt, matchReason: matched.reason,
    };
    return { offer };
  } catch {
    return { failed: candidate.host };
  }
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

async function digest(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function handleResearch(request: Request, env: ResearchEnv, ctx: ExecutionContext) {
  let body: ResearchRequest;
  try { body = await request.json(); }
  catch { return json({ code: 'INVALID_RESEARCH', error: 'The confirmed product could not be read.' }, 400); }
  const product = body.product;
  if (!product?.title?.trim()) return json({ code: 'INVALID_RESEARCH', error: 'Confirm the product title before researching retailers.' }, 400);

  const cacheHash = await digest(JSON.stringify({
    title: normalize(product.title), brand: normalize(product.brand), model: normalize(product.model),
    sku: normalize(product.sku), variant: normalize(product.variant), condition: conditionFamily(product.condition),
    zip: clean(body.zip, 16), currency: clean(body.currency || product.currency, 3),
  }));
  const cacheKey = new Request(`https://research-cache.should-i-buy-this/${cacheHash}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return new Response(await cached.text(), {
    status: cached.status,
    headers: { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store', 'x-research-cache': 'HIT' },
  });

  const checkedAt = new Date().toISOString();
  const submitted = sourceOffer(product, checkedAt);
  const searched = await searchWeb(product, env);
  const candidates = [...searched.candidates];
  const sourceHost = hostname(product.sourceUrl);
  if (product.sourceUrl && supportedRetailer(sourceHost) && !candidates.some((item) => item.url === product.sourceUrl)) {
    candidates.unshift({ title: product.title, url: product.sourceUrl, host: sourceHost });
  }

  const inspected = await Promise.all(candidates.slice(0, 8).map((candidate) => inspectCandidate(candidate, product, checkedAt)));
  const discovered = inspected.flatMap((item) => item.offer ? [item.offer] : []);
  const offers = uniqueOffers([...(submitted ? [submitted] : []), ...discovered]);
  const blockedStores = Array.from(new Set(inspected.flatMap((item) => item.blocked ? [item.blocked] : [])));
  const failedStores = Array.from(new Set(inspected.flatMap((item) => item.failed ? [item.failed] : [])));
  const comparableOffers = offers.filter((offer) => offer.match === 'Exact' || offer.match === 'Likely');
  const decisionReady = comparableOffers.length >= 2;
  const best = comparableOffers[0];
  const exactCount = comparableOffers.filter((offer) => offer.match === 'Exact').length;
  const unverifiedShipping = comparableOffers.filter((offer) => !offer.shippingVerified).length;

  const risks: Array<{ level: 'low' | 'medium' | 'high'; title: string; detail: string }> = [];
  if (exactCount >= 2) risks.push({ level: 'low', title: 'Multiple exact matches found', detail: `${exactCount} listings matched the confirmed model or product identifier.` });
  else if (comparableOffers.length >= 2) risks.push({ level: 'medium', title: 'Some matches are based on listing details', detail: 'Review the model, variant, and condition before purchasing.' });
  if (unverifiedShipping > 0) risks.push({ level: 'medium', title: 'Some delivered totals are incomplete', detail: `${unverifiedShipping} listing${unverifiedShipping === 1 ? '' : 's'} did not publish a verifiable shipping charge. Those rows show listed price, not a guaranteed checkout total.` });
  risks.push({ level: 'medium', title: 'Returns and seller terms need checkout confirmation', detail: 'Return windows, restocking fees, warranties, memberships, taxes, and marketplace seller terms can change by location and checkout state.' });
  if (!decisionReady) risks.push({ level: 'medium', title: 'Not enough comparable listings', detail: 'The app will not create a buy recommendation from fewer than two comparable public listings.' });

  const setupRequired = !env.BRAVE_SEARCH_API_KEY;
  const summary = decisionReady && best
    ? `${best.store} has the lowest ${best.shippingVerified ? 'verified delivered total' : 'verified listed price'} among ${comparableOffers.length} comparable listings. Review any unverified shipping and checkout terms before buying.`
    : setupRequired
      ? 'The product is confirmed, but the retailer-search connection is not configured yet. No recommendation was created.'
      : `The search found ${comparableOffers.length} comparable listing${comparableOffers.length === 1 ? '' : 's'}. That is not enough for a confident purchase recommendation.`;

  const result = {
    status: decisionReady ? 'researched' : 'research-limited',
    decisionReady,
    source: product.sourceUrl || product.sourceName || product.seller || 'Confirmed product',
    intake: product,
    product: {
      title: product.title, brand: product.brand, model: product.model, sku: product.sku,
      variant: product.variant, category: product.category || 'Product comparison',
      seller: product.seller, condition: product.condition,
    },
    offers: comparableOffers,
    risks,
    summary,
    research: {
      query: searched.query, checkedAt, searchedCount: searched.candidates.length,
      attemptedCount: candidates.length, blockedStores, failedStores,
      supportedRetailers: RETAILER_HOSTS, setupRequired, providerError: searched.error || '',
    },
  };

  const cacheResponse = new Response(JSON.stringify(result), {
    headers: { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'public, max-age=900' },
  });
  ctx.waitUntil(caches.default.put(cacheKey, cacheResponse.clone()));
  return json(result, 200, { 'x-research-cache': 'MISS' });
}
