import { mkdir, readFile, writeFile } from 'node:fs/promises';

const parts = [0, 1, 2, 3].map((index) => new URL(`../src/phase3-parts/part${index}.txt`, import.meta.url));
const contents = await Promise.all(parts.map((part) => readFile(part, 'utf8')));
await mkdir(new URL('../src/', import.meta.url), { recursive: true });
await writeFile(new URL('../src/main-phase3.tsx', import.meta.url), contents.join(''), 'utf8');
console.log('Assembled src/main-phase3.tsx');
