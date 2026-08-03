type VisualSearchEnv = {
  GOOGLE_CLOUD_VISION_API_KEY?: string;
};

type VisualMatch = {
  title: string;
  url: string;
  imageUrl: string;
  source: string;
  matchType: 'Exact image match' | 'Partial image match' | 'Related page';
  score: number;
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

const cleanText = (value: unknown, max = 300) => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const sourceFromUrl = (value: string) => {
  try {
    const host = new URL(value).hostname.replace(/^www\./, '');
    return host.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return 'Website';
  }
};

const domainFromUrl = (value: string) => {
  try { return new URL(value).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const retailerWeight = (url: string) => {
  const domain = domainFromUrl(url);
  const retailerTerms = [
    'amazon.', 'walmart.', 'target.', 'bestbuy.', 'costco.', 'samsclub.', 'wayfair.',
    'homedepot.', 'lowes.', 'macys.', 'kohls.', 'ebay.', 'etsy.', 'aliexpress.',
    'temu.', 'ikea.', 'mattel.', 'lego.', 'sephora.', 'ulta.', 'chewy.', 'petco.',
  ];
  return retailerTerms.some((term) => domain.includes(term)) ? 0.2 : 0;
};

const excludedDomain = (url: string) => {
  const domain = domainFromUrl(url);
  return [
    'google.com', 'googleusercontent.com', 'gstatic.com', 'youtube.com', 'youtu.be',
    'facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com',
  ].some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
};

export async function handleVisualSearch(request: Request, env: VisualSearchEnv) {
  if (!env.GOOGLE_CLOUD_VISION_API_KEY) {
    return json({
      code: 'VISUAL_SEARCH_UNAVAILABLE',
      error: 'Online image matching is not connected yet.',
      details: 'Add the GOOGLE_CLOUD_VISION_API_KEY secret to this Cloudflare Worker to activate Google Web Detection.',
    }, 503);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ code: 'PRODUCT_NOT_FOUND', error: 'The uploaded image could not be read.' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return json({ code: 'PRODUCT_NOT_FOUND', error: 'Choose a product image first.' }, 400);
  }
  if (!IMAGE_TYPES.has(file.type)) {
    return json({ code: 'UNSUPPORTED_FILE', error: 'Choose a PNG, JPG, WebP, GIF, or BMP product image.' }, 415);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return json({ code: 'IMAGE_TOO_LARGE', error: 'Choose an image smaller than 8 MB.' }, 413);
  }

  const imageContent = arrayBufferToBase64(await file.arrayBuffer());
  const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(env.GOOGLE_CLOUD_VISION_API_KEY)}`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json;charset=utf-8' },
      body: JSON.stringify({
        requests: [{
          image: { content: imageContent },
          features: [
            { type: 'WEB_DETECTION', maxResults: 20 },
            { type: 'TEXT_DETECTION', maxResults: 10 },
          ],
        }],
      }),
    });
  } catch {
    return json({
      code: 'VISUAL_SEARCH_FAILED',
      error: 'The online image search could not be reached right now.',
    }, 502);
  }

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || payload?.responses?.[0]?.error) {
    const message = cleanText(payload?.error?.message || payload?.responses?.[0]?.error?.message, 300);
    return json({
      code: response.status === 401 || response.status === 403 ? 'VISUAL_SEARCH_UNAVAILABLE' : 'VISUAL_SEARCH_FAILED',
      error: response.status === 401 || response.status === 403
        ? 'Google visual search is not fully configured yet.'
        : 'Google visual search could not complete this image check.',
      details: message || 'Check that the Vision API is enabled and the API key is valid.',
    }, response.status === 401 || response.status === 403 ? 503 : 502);
  }

  const annotation = payload?.responses?.[0] || {};
  const web = annotation.webDetection || {};
  const labels = (web.bestGuessLabels || []).map((item: any) => cleanText(item.label, 160)).filter(Boolean);
  const entities = (web.webEntities || [])
    .filter((item: any) => item?.description)
    .sort((a: any, b: any) => Number(b.score || 0) - Number(a.score || 0))
    .map((item: any) => cleanText(item.description, 160));
  const textDescription = cleanText(annotation?.fullTextAnnotation?.text || annotation?.textAnnotations?.[0]?.description, 500);
  const suggestedQuery = labels[0]
    || entities.slice(0, 4).join(' ')
    || textDescription.split('\n').slice(0, 3).join(' ');

  const seen = new Set<string>();
  const candidates: VisualMatch[] = (web.pagesWithMatchingImages || [])
    .map((page: any, index: number) => {
      const url = cleanText(page.url, 1200);
      if (!url || seen.has(url) || excludedDomain(url)) return null;
      seen.add(url);
      const exactImages = Array.isArray(page.fullMatchingImages) ? page.fullMatchingImages : [];
      const partialImages = Array.isArray(page.partialMatchingImages) ? page.partialMatchingImages : [];
      const matchType: VisualMatch['matchType'] = exactImages.length
        ? 'Exact image match'
        : partialImages.length
          ? 'Partial image match'
          : 'Related page';
      const baseScore = matchType === 'Exact image match' ? 0.95 : matchType === 'Partial image match' ? 0.78 : 0.58;
      const title = cleanText(page.pageTitle, 240) || labels[0] || entities[0] || sourceFromUrl(url);
      const imageUrl = cleanText(exactImages[0]?.url || partialImages[0]?.url, 1600);
      return {
        title,
        url,
        imageUrl,
        source: sourceFromUrl(url),
        matchType,
        score: Math.min(0.99, Math.max(0.4, baseScore + retailerWeight(url) - index * 0.012)),
      } as VisualMatch;
    })
    .filter(Boolean)
    .sort((a: VisualMatch, b: VisualMatch) => b.score - a.score)
    .slice(0, 12);

  return json({
    candidates,
    suggestedQuery,
    labels: Array.from(new Set([...labels, ...entities])).slice(0, 10),
    textDescription,
    provider: 'Google Cloud Vision Web Detection',
    imageStored: false,
  });
}
