type Env = { ASSETS: Fetcher; AI: any };

type ErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_INPUT'
  | 'RETAILER_BLOCKED'
  | 'PRICE_NOT_FOUND'
  | 'RETAILER_ERROR'
  | 'NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'
  | 'UNSUPPORTED_FILE'
  | 'IMAGE_TOO_LARGE'
  | 'AI_UNAVAILABLE';

type ProductDraft = {
  title: string;
  brand: string;
  model: string;
  sku: string;
  variant: string;
  category: string;
  visiblePrice: number | null;
  currency: string;
  seller: string;
  condition: string;
  sourceUrl: string;
  sourceName: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  warnings: string[];
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']);

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json;charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});

const fail = (code: ErrorCode, error: string, status: number, details?: string) =>
  json({ code, error, details }, status);

const cleanText = (value: unknown, max = 300) => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const pick = (html: string, expression: RegExp) => cleanText(html.match(expression)?.[1] || '');
const parsePrice = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
};

const storeName = (value: string) => {
  try {
    return new URL(value).hostname
      .replace(/^www\./, '')
      .split('.')[0]
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return 'Retailer';
  }
};

function isUnsafeHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost'
    || host.endsWith('.local')
    || host === '::1'
    || host === '0.0.0.0'
    || /^(127\.|10\.|169\.254\.|192\.168\.)/.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /^(fc|fd|fe80):/i.test(host);
}

function validateUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { error: fail('INVALID_URL', 'Paste the full product page address, including https://.', 400) };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { error: fail('INVALID_URL', 'Only public http and https product links are supported.', 400) };
  }
  if (isUnsafeHost(url.hostname)) {
    return { error: fail('INVALID_URL', 'Private, local, and internal network links are not supported.', 400) };
  }
  return { url };
}

function fallbackFromHtml(html: string, url: URL, currency = 'USD'): ProductDraft {
  const title = pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
    || pick(html, /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)/i)
    || pick(html, /<title[^>]*>([^<]+)/i)
    || 'Product';
  const price = parsePrice(
    pick(html, /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)/i)
    || pick(html, /"price"\s*:\s*"?([0-9,.]+)/i)
    || pick(html, /\$\s*([0-9,.]+)/),
  );
  const foundCurrency = pick(html, /"priceCurrency"\s*:\s*"([A-Z]{3})"/i) || currency;
  const brand = pick(html, /"brand"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i)
    || pick(html, /"brand"\s*:\s*"([^"]+)"/i);
  const model = pick(html, /"model"\s*:\s*"([^"]+)"/i)
    || pick(html, /"mpn"\s*:\s*"([^"]+)"/i);
  const sku = pick(html, /"sku"\s*:\s*"([^"]+)"/i)
    || pick(html, /"gtin(?:8|12|13|14)?"\s*:\s*"([^"]+)"/i);
  return finalizeProduct({
    title,
    brand,
    model,
    sku,
    variant: '',
    category: '',
    visiblePrice: price,
    currency: foundCurrency,
    seller: storeName(url.toString()),
    condition: pick(html, /"itemCondition"\s*:\s*"([^"]+)"/i).split('/').pop() || 'Unknown',
    sourceUrl: url.toString(),
    sourceName: storeName(url.toString()),
    confidence: title !== 'Product' && (price != null || model || sku) ? 'high' : 'medium',
    evidence: [],
    warnings: [],
  });
}

function finalizeProduct(value: Partial<ProductDraft>): ProductDraft {
  const title = cleanText(value.title, 240);
  const brand = cleanText(value.brand, 100);
  const model = cleanText(value.model, 120);
  const sku = cleanText(value.sku, 100);
  const variant = cleanText(value.variant, 160);
  const category = cleanText(value.category, 120);
  const seller = cleanText(value.seller, 120);
  const sourceName = cleanText(value.sourceName, 120) || seller;
  const conditionRaw = cleanText(value.condition, 40).toLowerCase();
  const condition = conditionRaw.includes('refurb') ? 'Refurbished'
    : conditionRaw.includes('used') ? 'Used'
      : conditionRaw.includes('open') ? 'Open box'
        : conditionRaw.includes('new') ? 'New'
          : 'Unknown';
  const visiblePrice = parsePrice(value.visiblePrice);
  const currency = /^[A-Z]{3}$/.test(String(value.currency || '').toUpperCase())
    ? String(value.currency).toUpperCase()
    : 'USD';
  const evidence = [
    title && `Product title: ${title}`,
    brand && `Brand: ${brand}`,
    model && `Model: ${model}`,
    sku && `Identifier: ${sku}`,
    variant && `Variant: ${variant}`,
    visiblePrice != null && `Visible price: ${currency} ${visiblePrice.toFixed(2)}`,
    seller && `Seller or retailer: ${seller}`,
  ].filter(Boolean) as string[];
  const warnings = [
    !brand && 'Brand was not clearly identified.',
    !model && !sku && 'No model number or unique product identifier was found.',
    visiblePrice == null && 'No visible price was found.',
    !seller && 'Seller or retailer was not identified.',
    condition === 'Unknown' && 'Condition was not clearly stated.',
  ].filter(Boolean) as string[];
  const confidence: ProductDraft['confidence'] = value.confidence
    || (title && (model || sku) && evidence.length >= 4 ? 'high' : title && evidence.length >= 2 ? 'medium' : 'low');
  return {
    title,
    brand,
    model,
    sku,
    variant,
    category,
    visiblePrice,
    currency,
    seller,
    condition,
    sourceUrl: cleanText(value.sourceUrl, 1000),
    sourceName,
    confidence,
    evidence,
    warnings,
  };
}

const productSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    brand: { type: 'string' },
    model: { type: 'string' },
    sku: { type: 'string' },
    variant: { type: 'string' },
    category: { type: 'string' },
    visiblePrice: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    currency: { type: 'string' },
    seller: { type: 'string' },
    condition: { type: 'string' },
  },
  required: ['title', 'brand', 'model', 'sku', 'variant', 'category', 'visiblePrice', 'currency', 'seller', 'condition'],
};

function unwrapAI(value: any) {
  const candidate = value?.response ?? value?.result ?? value?.choices?.[0]?.message?.content ?? value;
  if (candidate && typeof candidate === 'object') return candidate;
  if (typeof candidate !== 'string') return {};
  const trimmed = candidate.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(trimmed); } catch { return {}; }
}

async function structureProduct(env: Env, sourceText: string, context: string, fallback: ProductDraft) {
  const text = sourceText.slice(0, 40_000);
  if (!text.trim()) return fallback;
  try {
    const response = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
      messages: [
        {
          role: 'system',
          content: 'Extract a single retail product identity from supplied evidence. Never invent missing values. Use an empty string or null when evidence is absent. Keep title concise but specific. Variant means size, color, capacity, pack count, or configuration. Seller means the retailer or marketplace seller, not the manufacturer.',
        },
        { role: 'user', content: `${context}\n\nPRODUCT EVIDENCE:\n${text}` },
      ],
      response_format: { type: 'json_schema', json_schema: productSchema },
      temperature: 0.1,
      max_completion_tokens: 700,
    });
    const extracted = unwrapAI(response);
    return finalizeProduct({
      ...fallback,
      ...extracted,
      sourceUrl: fallback.sourceUrl,
      sourceName: fallback.sourceName,
      confidence: fallback.confidence,
    });
  } catch {
    return finalizeProduct({
      ...fallback,
      confidence: fallback.title && fallback.title !== 'Product' ? 'medium' : 'low',
      warnings: [...fallback.warnings, 'Automatic detail extraction was limited; review every field.'],
    });
  }
}

async function fetchRetailerPage(url: URL) {
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ShouldIBuyThis/1.0; +https://should-i-buy-this.workers.dev)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      cf: { cacheTtl: 0 },
    });
  } catch {
    return { error: fail('RETAILER_ERROR', 'The retailer page could not be reached right now.', 502) };
  }
  if ([401, 403, 429].includes(response.status)) {
    return { error: fail('RETAILER_BLOCKED', 'This retailer blocked the automated product check.', 403, `The retailer returned HTTP ${response.status}.`) };
  }
  if ([404, 410].includes(response.status)) {
    return { error: fail('NOT_FOUND', 'That product page is no longer available.', 404) };
  }
  if (!response.ok) {
    return { error: fail('RETAILER_ERROR', 'The retailer could not complete the request.', 502, `The retailer returned HTTP ${response.status}.`) };
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return { error: fail('RETAILER_ERROR', 'The submitted link did not return a readable product page.', 422) };
  }
  return { html: (await response.text()).slice(0, 1_500_000) };
}

async function intakeLink(env: Env, input: string, currency: string) {
  const validated = validateUrl(input);
  if (validated.error) return validated.error;
  const url = validated.url!;
  const page = await fetchRetailerPage(url);
  if (page.error) return page.error;
  const html = page.html!;
  const fallback = fallbackFromHtml(html, url, currency);
  let text = html.slice(0, 40_000);
  try {
    const converted: any = await env.AI.toMarkdown(
      { name: 'product-page.html', blob: new Blob([html], { type: 'text/html' }) },
      { conversionOptions: { output: { format: 'text' }, html: { hostname: url.hostname } } },
    );
    if (converted?.format !== 'error' && converted?.data) text = converted.data;
  } catch {
    // Regex and metadata fallback still provides a reviewable draft.
  }
  const product = await structureProduct(env, text, `The evidence came from this retailer URL: ${url.toString()}`, fallback);
  if (!product.title || product.title === 'Product') {
    return fail('PRODUCT_NOT_FOUND', 'The page was readable, but a specific product could not be identified.', 422);
  }
  return json({ product });
}

async function intakeSearch(env: Env, input: string, currency: string) {
  const query = cleanText(input, 1000);
  if (query.length < 3) return fail('PRODUCT_NOT_FOUND', 'Enter a product name, brand, model number, or identifying details.', 400);
  const fallback = finalizeProduct({
    title: query,
    brand: '',
    model: '',
    sku: '',
    variant: '',
    category: '',
    visiblePrice: null,
    currency,
    seller: '',
    condition: 'Unknown',
    sourceUrl: '',
    sourceName: 'Name/model entry',
    confidence: 'medium',
  });
  const product = await structureProduct(env, query, 'The user typed a product name or model description. Extract only details present in their text.', fallback);
  product.warnings = Array.from(new Set([...product.warnings, 'No live retailer listing has been verified yet.']));
  return json({ product });
}

async function intakeScreenshot(env: Env, file: File, currency: string) {
  if (!IMAGE_TYPES.has(file.type)) {
    return fail('UNSUPPORTED_FILE', 'Choose a PNG, JPG, WebP, GIF, or BMP product screenshot.', 415);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return fail('IMAGE_TOO_LARGE', 'Choose a screenshot smaller than 8 MB.', 413);
  }
  let converted: any;
  try {
    converted = await env.AI.toMarkdown(
      { name: cleanText(file.name, 160) || 'product-screenshot.png', blob: file },
      { conversionOptions: { output: { format: 'text' }, image: { descriptionLanguage: 'en' } } },
    );
  } catch {
    return fail('AI_UNAVAILABLE', 'The screenshot could not be read right now.', 503);
  }
  if (converted?.format === 'error' || !converted?.data) {
    return fail('PRODUCT_NOT_FOUND', 'The screenshot did not contain enough readable product information.', 422);
  }
  const fallback = finalizeProduct({
    title: '',
    brand: '',
    model: '',
    sku: '',
    variant: '',
    category: '',
    visiblePrice: null,
    currency,
    seller: '',
    condition: 'Unknown',
    sourceUrl: '',
    sourceName: 'Uploaded screenshot',
    confidence: 'medium',
  });
  const product = await structureProduct(env, converted.data, 'The evidence was extracted from a shopping screenshot. Read visible product text, price, seller, condition, and variant. Do not infer details that are not visible.', fallback);
  product.warnings = Array.from(new Set([...product.warnings, 'Screenshot details should be checked against the live listing before purchase.']));
  if (!product.title) return fail('PRODUCT_NOT_FOUND', 'The screenshot did not show a clear product title or model.', 422);
  return json({ product });
}

async function intake(request: Request, env: Env) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const mode = String(form.get('mode') || 'screenshot');
    const file = form.get('file');
    const currency = cleanText(form.get('currency') || 'USD', 3).toUpperCase();
    if (mode !== 'screenshot') return fail('UNSUPPORTED_INPUT', 'Multipart intake is only supported for screenshots.', 422);
    if (!(file instanceof File) || file.size === 0) return fail('PRODUCT_NOT_FOUND', 'Choose a product screenshot first.', 400);
    return intakeScreenshot(env, file, currency);
  }
  const body: any = await request.json();
  const mode = String(body?.mode || 'link');
  const input = String(body?.input || '').trim();
  const currency = cleanText(body?.currency || 'USD', 3).toUpperCase();
  if (mode === 'link') return intakeLink(env, input, currency);
  if (mode === 'search') return intakeSearch(env, input, currency);
  return fail('UNSUPPORTED_INPUT', 'Use a product link, product name/model, or supported screenshot.', 422);
}

async function analyze(body: any) {
  const product = finalizeProduct(body?.product || {});
  if (!product.title) return fail('PRODUCT_NOT_FOUND', 'Confirm a product title before continuing.', 400);
  const source = product.sourceUrl || product.sourceName || product.seller || 'Submitted product details';
  const offers = product.visiblePrice == null ? [] : [{
    store: product.seller || product.sourceName || 'Submitted source',
    itemPrice: product.visiblePrice,
    shipping: null,
    deliveredPrice: product.visiblePrice,
    delivery: 'Confirm at checkout',
    match: product.sourceUrl ? 'Source listing' : 'Submitted evidence',
  }];
  const risks = [
    { level: 'low', title: 'Product identity confirmed', detail: [product.brand, product.model, product.sku].filter(Boolean).join(' · ') || 'The product title was reviewed and confirmed.' },
    product.visiblePrice == null
      ? { level: 'medium', title: 'Price not verified', detail: 'No visible price was provided or extracted, and the app did not guess one.' }
      : { level: 'medium', title: 'Checkout total not verified', detail: 'Taxes, shipping, discounts, memberships, and delivery timing still need checkout confirmation.' },
    { level: 'medium', title: 'Cross-store research not completed', detail: 'Phase 3 confirms the product identity. Alternate retailers and true delivered-price comparison are completed in Phase 4.' },
  ];
  return json({
    status: 'intake',
    decisionReady: false,
    source,
    intake: product,
    product: {
      title: product.title,
      brand: product.brand,
      model: product.model,
      sku: product.sku,
      variant: product.variant,
      category: product.category || 'Product intake',
      seller: product.seller,
      condition: product.condition,
    },
    offers,
    risks,
    summary: 'The product identity is saved and ready for retailer comparison. No buy recommendation has been made yet because cross-store price, shipping, seller, return, and availability research is not complete.',
  });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, service: 'should-i-buy-this', phase: 3, intake: ['link', 'search', 'screenshot'] });
    if (url.pathname === '/api/intake' && request.method === 'POST') {
      try { return await intake(request, env); }
      catch { return fail('PRODUCT_NOT_FOUND', 'The product information could not be read. Check the input and try again.', 400); }
    }
    if (url.pathname === '/api/analyze' && request.method === 'POST') {
      try { return await analyze(await request.json()); }
      catch { return fail('PRODUCT_NOT_FOUND', 'The confirmed product details could not be read.', 400); }
    }
    if (url.pathname.startsWith('/api/')) return fail('NOT_FOUND', 'That API route does not exist.', 404);
    return env.ASSETS.fetch(request);
  },
};
