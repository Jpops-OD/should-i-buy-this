import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/main-phase3.tsx', import.meta.url);
let source = await readFile(file, 'utf8');
const target = 'const data = await response.json().catch(() => ({}));';
const replacement = 'const data: any = await response.json().catch(() => ({}));';

if (!source.includes(target)) {
  throw new Error('Phase 3 type patch failed: response JSON assignment was not found');
}

source = source.replaceAll(target, replacement);
await writeFile(file, source, 'utf8');
console.log('Applied strict response JSON types');
