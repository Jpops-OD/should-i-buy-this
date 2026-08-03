import { readFile, writeFile } from 'node:fs/promises';

const workerFile = new URL('../worker/research.ts', import.meta.url);
let worker = await readFile(workerFile, 'utf8');

function replaceOnce(find, replacement, label) {
  if (!worker.includes(find)) throw new Error(`Layered discovery patch failed: ${label}`);
  worker = worker.replace(find, replacement);
}

const oldDiscover = `async function discoverRetailer(adapter: RetailerAdapter, query: string) {
  try {
    const response = await fetchWithTimeout(adapter.searchUrl(query), 7000);
    if ([401, 403, 429].includes(response.status)) return { adapter, urls: [] as string[], blocked: true };
    if (!response.ok) return { adapter, urls: [] as string[], failed: true };
    const html = (await response.text()).slice(0, 1_500_000);
    return { adapter, urls: extractProductUrls(html, adapter) };
  } catch { return { adapter, urls: [] as string[], failed: true }; }
}`;

const newDiscover = `async function discoverRetailer(adapter: RetailerAdapter, query: string) {
  try {
    const response = await fetchWithTimeout(adapter.searchUrl(query), 7000);
    if ([401, 403, 429].includes(response.status)) return { adapter, urls: [] as string[], blocked: true, source: 'retailer-catalog' };
    if (!response.ok) return { adapter, urls: [] as string[], failed: true, source: 'retailer-catalog' };
    const html = (await response.text()).slice(0, 1_500_000);
    return { adapter, urls: extractProductUrls(html, adapter), source: 'retailer-catalog' };
  } catch { return { adapter, urls: [] as string[], failed: true, source: 'retailer-catalog' }; }
}

function extractWebResultUrls(text: string, adapter: RetailerAdapter) {
  const values = [...text.matchAll(/<link>(https?:\\/\\/[^<]+)<\\/link>/gi), ...text.matchAll(/href=["'](https?:\\/\\/[^"']+)["']/gi)]
    .map((match) => match[1].replace(/&amp;/g, '&'));
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const url = absoluteRetailerUrl(value, adapter);
    if (!url || seen.has(url)) continue;
    seen.add(url); urls.push(url);
    if (urls.length >= 5) break;
  }
  return urls;
}

async function discoverViaPublicWeb(adapter: RetailerAdapter, query: string) {
  const search = 'https://www.bing.com/search?format=rss&q=' + encodeURIComponent('site:' + adapter.host + ' ' + query);
  try {
    const response = await fetchWithTimeout(search, 7000);
    if ([401, 403, 429].includes(response.status)) return { adapter, urls: [] as string[], blocked: true, source: 'public-web' };
    if (!response.ok) return { adapter, urls: [] as string[], failed: true, source: 'public-web' };
    const text = (await response.text()).slice(0, 1_500_000);
    return { adapter, urls: extractWebResultUrls(text, adapter), source: 'public-web' };
  } catch { return { adapter, urls: [] as string[], failed: true, source: 'public-web' }; }
}

async function discoverLayered(adapter: RetailerAdapter, queries: string[]) {
  const attempts: any[] = [];
  const collected: string[] = [];
  const seen = new Set<string>();
  for (const query of queries.slice(0, 2)) {
    const catalog = await discoverRetailer(adapter, query);
    attempts.push(catalog);
    for (const url of catalog.urls) if (!seen.has(url)) { seen.add(url); collected.push(url); }
    if (!catalog.urls.length) {
      const web = await discoverViaPublicWeb(adapter, query);
      attempts.push(web);
      for (const url of web.urls) if (!seen.has(url)) { seen.add(url); collected.push(url); }
    }
    if (collected.length >= 4) break;
  }
  return {
    adapter, urls: collected.slice(0, 4), attempts,
    blocked: collected.length === 0 && attempts.length > 0 && attempts.every((item) => item.blocked),
    failed: collected.length === 0 && attempts.some((item) => item.failed),
  };
}`;

replaceOnce(oldDiscover, newDiscover, 'discovery functions');

replaceOnce(
`  const discoveries = await Promise.all(adapters.flatMap((adapter) => queries.map((item) => discoverRetailer(adapter, item))));
  const blockedStores = discoveries.filter((item) => item.blocked).map((item) => item.adapter.name);
  const failedStores = discoveries.filter((item) => item.failed).map((item) => item.adapter.name);
  const candidateUrls = [...new Set(discoveries.flatMap((item) => item.urls))].slice(0, 18);`,
`  const discoveries = await Promise.all(adapters.map((adapter) => discoverLayered(adapter, queries)));
  const blockedStores = discoveries.filter((item) => item.blocked).map((item) => item.adapter.name);
  const failedStores = discoveries.filter((item) => item.failed && !item.urls.length).map((item) => item.adapter.name);
  const candidateUrls = [...new Set(discoveries.flatMap((item) => item.urls))].slice(0, 24);`,
'layered execution',
);

replaceOnce(
`      query, queries, checkedAt, searchedCount: adapters.length, catalogRequests: discoveries.length, attemptedCount: candidateUrls.length,`,
`      query, queries, checkedAt, searchedCount: adapters.length,
      catalogRequests: discoveries.reduce((count, item) => count + item.attempts.filter((attempt: any) => attempt.source === 'retailer-catalog').length, 0),
      publicWebRequests: discoveries.reduce((count, item) => count + item.attempts.filter((attempt: any) => attempt.source === 'public-web').length, 0),
      attemptedCount: candidateUrls.length,`,
'reporting',
);

await writeFile(workerFile, worker, 'utf8');
console.log('Applied layered retailer and public-web discovery');
