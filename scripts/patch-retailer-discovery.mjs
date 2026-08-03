import { readFile, writeFile } from 'node:fs/promises';

const workerFile = new URL('../worker/research.ts', import.meta.url);
let worker = await readFile(workerFile, 'utf8');

function replaceOnce(find, replacement, label) {
  if (!worker.includes(find)) throw new Error(`Retailer discovery patch failed: ${label}`);
  worker = worker.replace(find, replacement);
}

replaceOnce(
`function searchQuery(product: ProductDraft) {
  const identifier = clean(product.sku || product.model, 120);
  return clean(identifier ? \`${'${product.brand} ${identifier}'}\` : \`${'${product.brand} ${product.title} ${product.variant}'}\`, 300);
}`,
`function globallyUsefulSku(value: string) {
  const digits = clean(value, 40).replace(/[^0-9]/g, '');
  return [8, 12, 13, 14].includes(digits.length) ? digits : '';
}

function modelFromTitle(title: string) {
  const tokens = clean(title, 300).match(/\\b(?=[A-Z0-9-]{4,20}\\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\\d)[A-Z0-9-]+\\b/gi) || [];
  return tokens.find((token) => !/^\\d+(?:QT|IN|LB|OZ)$/i.test(token)) || '';
}

function searchQueries(product: ProductDraft) {
  const model = clean(product.model, 120) || modelFromTitle(product.title);
  const globalSku = globallyUsefulSku(product.sku);
  const descriptive = clean([product.brand, product.title, product.variant].filter(Boolean).join(' '), 240);
  const values = [
    model ? clean(\`${'${product.brand} ${model}'}\`, 180) : '',
    globalSku ? clean(\`${'${product.brand} ${globalSku}'}\`, 180) : '',
    descriptive,
  ].filter(Boolean);
  return [...new Set(values)].slice(0, 3);
}`,
'search query function',
);

replaceOnce(
`  const query = searchQuery(product);`,
`  const queries = searchQueries(product);
  const query = queries[0] || clean([product.brand, product.title].filter(Boolean).join(' '), 240);`,
'primary query assignment',
);

replaceOnce(
`  const discoveries = await Promise.all(adapters.map((adapter) => discoverRetailer(adapter, query)));`,
`  const discoveries = await Promise.all(adapters.flatMap((adapter) => queries.map((item) => discoverRetailer(adapter, item))));`,
'retailer discovery request list',
);

replaceOnce(
`      query, checkedAt, searchedCount: adapters.length, attemptedCount: candidateUrls.length,`,
`      query, queries, checkedAt, searchedCount: adapters.length, catalogRequests: discoveries.length, attemptedCount: candidateUrls.length,`,
'research count payload',
);

await writeFile(workerFile, worker, 'utf8');
console.log('Applied improved retailer discovery queries and reporting');
