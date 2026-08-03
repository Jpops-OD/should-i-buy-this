import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/main-phase3.tsx', import.meta.url);
let source = await readFile(file, 'utf8');

if (!source.includes("import './phase5.css';")) throw new Error('Automatic discovery patch failed: Phase 5 stylesheet import missing');
source = source.replace("import './phase5.css';", "import './phase5.css';\nimport './auto-discovery.css';");

source = source
  .replaceAll('The product is fully identified. Use the free search links below, paste matching retailer product links, and the app will verify them before creating a score.', 'The product is fully identified. The app automatically searched supported retailer catalogs and verified any readable exact or likely matches.')
  .replaceAll('More retailer links are needed', 'Not enough verified retailer listings')
  .replaceAll('Nothing is missing from your product information. The app needs at least two verified listings and will not invent prices or use a paid search API.', 'Nothing is missing from your product information. The automatic search did not verify at least two matching listings, so the app stopped without inventing a comparison.')
  .replaceAll('Paste exact retailer product pages below. Search-result pages are ignored because they do not represent a single verifiable offer.', 'The app searches supported retailers automatically using the confirmed model, SKU, brand, title, and variant. Only verified matching product pages are included.')
  .replaceAll('Review details and retry', 'Review details and search again');

if (/paste matching retailer|Retailer product links|Verify and compare links|Find and add matching listings/i.test(source)) {
  console.log('Manual comparison controls remain in markup but are hidden by auto-discovery.css.');
}

await writeFile(file, source, 'utf8');
console.log('Applied automatic retailer-discovery interface');
