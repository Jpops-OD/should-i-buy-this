type Env = { ASSETS: Fetcher };

type ErrorCode = 'INVALID_URL' | 'UNSUPPORTED_INPUT' | 'RETAILER_BLOCKED' | 'PRICE_NOT_FOUND' | 'RETAILER_ERROR' | 'NOT_FOUND';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json;charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});

const fail = (code: ErrorCode, error: string, status: number, details?: string) => json({ code, error, details }, status);
const pick = (html: string, expression: RegExp) => html.match(expression)?.[1]?.trim() || '';
const parsePrice = (value: string) => {
  const parsed = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const storeName = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, '').split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return 'Retailer';
  }
};

function isUnsafeHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '::1' || /^(127\.|10\.|169\.254\.|192\.168\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

function validateUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { error: fail('INVALID_URL', 'Paste the full product page address, including https://.', 400) };
  }
  if (!['http:', 'https:'].includes(url.protocol)) return { error: fail('INVALID_URL', 'Only public http and https product links are supported.', 400) };
  if (isUnsafeHost(url.hostname)) return { error: fail('INVALID_URL', 'Private, local, and internal network links are not supported.', 400) };
  return { url };
}

async function analyze(body: any) {
  const mode = String(body?.mode || 'link');
  const input = String(body?.input || '').trim();

  if (mode !== 'link') {
    return fail('UNSUPPORTED_INPUT', 'Phase 0 currently supports direct public product links. Search and screenshot research are scheduled for a later phase.', 422);
  }
  if (!input) return fail('INVALID_URL', 'Paste a product page link before starting the check.', 400);

  const validated = validateUrl(input);
  if (validated.error) return validated.error;
  const url = validated.url!;

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
    return fail('RETAILER_ERROR', 'The retailer page could not be reached right now.', 502, 'The store may be unavailable or may be limiting automated requests.');
  }

  if (response.status === 401 || response.status === 403 || response.status === 429) {
    return fail('RETAILER_BLOCKED', 'This retailer blocked the automated product check.', 403, `The retailer returned HTTP ${response.status}. Try another public listing for the same product.`);
  }
  if (response.status === 404 || response.status === 410) {
    return fail('NOT_FOUND', 'That product page is no longer available.', 404);
  }
  if (!response.ok) {
    return fail('RETAILER_ERROR', 'The retailer could not complete the request.', 502, `The retailer returned HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return fail('RETAILER_ERROR', 'The submitted link did not return a readable product page.', 422);
  }

  const html = (await response.text()).slice(0, 1_500_000);
  const title = pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
    || pick(html, /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)/i)
    || pick(html, /<title[^>]*>([^<]+)/i)
    || 'Product';
  const listed = parsePrice(
    pick(html, /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)/i)
    || pick(html, /"price"\s*:\s*"?([0-9,.]+)/i)
    || pick(html, /\$\s*([0-9,.]+)/)
  );

  if (listed == null) {
    return fail('PRICE_NOT_FOUND', 'The product page was found, but the store did not expose a public price we could verify.', 422);
  }

  const source = storeName(url.toString());
  return json({
    status: 'partial',
    source: url.toString(),
    product: { title, category: 'Product comparison' },
    offers: [{
      store: source,
      itemPrice: listed,
      shipping: null,
      deliveredPrice: listed,
      delivery: 'Confirm at checkout',
      match: 'Exact source listing',
    }],
    risks: [
      { level: 'low', title: 'Original listing captured', detail: 'The submitted store and visible listed price were verified.' },
      { level: 'medium', title: 'Shipping is not verified', detail: 'Delivery cost and timing can depend on ZIP code, inventory, membership, and checkout state.' },
      { level: 'medium', title: 'No cross-store comparison yet', detail: 'Phase 0 verifies the submitted listing only. Additional retailer research is a later phase.' },
    ],
    summary: `${source} and its visible listed price were verified. Shipping, arrival, and alternate retailers still need confirmation.`,
  });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, service: 'should-i-buy-this', phase: 0 });
    if (url.pathname === '/api/analyze' && request.method === 'POST') {
      try {
        return analyze(await request.json());
      } catch {
        return fail('INVALID_URL', 'The request could not be read. Try the product link again.', 400);
      }
    }
    if (url.pathname.startsWith('/api/')) return fail('NOT_FOUND', 'That API route does not exist.', 404);
    return env.ASSETS.fetch(request);
  },
};
