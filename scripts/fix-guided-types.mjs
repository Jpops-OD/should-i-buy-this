import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/main-phase3.tsx', import.meta.url);
let source = await readFile(file, 'utf8');
const oldType = "function GuidedRetailerVerification({ product, profileId, currency }: { product: ProductDraft; profileId: string; currency: string }) {";
const newType = "function GuidedRetailerVerification({ product, profileId, currency }: { product: { title: string; brand?: string; model?: string; sku?: string }; profileId: string; currency: string }) {";
if (source.includes(oldType)) source = source.replace(oldType, newType);
else if (!source.includes(newType)) throw new Error('Guided verification type fix failed: component signature missing');
await writeFile(file, source, 'utf8');
console.log('Aligned guided verification product type');
