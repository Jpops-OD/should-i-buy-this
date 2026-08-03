import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/main-phase3.tsx', import.meta.url);
let source = await readFile(file, 'utf8');

function replaceOnce(find, replacement, label) {
  if (!source.includes(find)) {
    throw new Error(`Automatic visual-search patch failed: ${label}`);
  }
  source = source.replace(find, replacement);
}

const lines = (...items) => items.join('\n');

replaceOnce(
  lines(
    '    } catch (caught: any) {',
    '      const normalized = caught?.status',
    '        ? normalizeError(caught.status, caught.payload)',
    '        : normalizeError(503, {});',
    '      setError({ ...normalized, code: caught?.payload?.code });',
    '    } finally {',
    '      setLoading(false);',
    '    }',
    '  }',
  ),
  lines(
    '    } catch (caught: any) {',
    "      if (mode === 'screenshot' && screenshotFile && caught?.payload?.code === 'PRODUCT_NOT_FOUND') {",
    '        await searchScreenshotOnline();',
    '      } else {',
    '        const normalized = caught?.status',
    '          ? normalizeError(caught.status, caught.payload)',
    '          : normalizeError(503, {});',
    '        setError({ ...normalized, code: caught?.payload?.code });',
    '      }',
    '    } finally {',
    '      setLoading(false);',
    '    }',
    '  }',
  ),
  'screenshot identification catch block was not found',
);

replaceOnce(
  ": <><Icon name=\"search\" /> Identify this product <Icon name=\"arrow\" size={18} /></>}",
  ": <><Icon name=\"search\" /> {mode === 'screenshot' ? 'Find this product' : 'Identify this product'} <Icon name=\"arrow\" size={18} /></>}",
  'primary identification label was not found',
);

replaceOnce(
  "{loading && <div className=\"loading\"><span className=\"spinner\" />{mode === 'screenshot' ? 'Reading the screenshot and extracting product details…' : mode === 'search' ? 'Organizing the product name and model details…' : 'Reading the product page and extracting what can be verified…'}</div>}",
  "{loading && <div className=\"loading\"><span className=\"spinner\" />{mode === 'screenshot' ? 'Reading the image and searching online if text alone is not enough…' : mode === 'search' ? 'Organizing the product name and model details…' : 'Reading the product page and extracting what can be verified…'}</div>}",
  'screenshot loading message was not found',
);

replaceOnce(
  lines(
    "              {mode === 'screenshot' && screenshotFile && (",
    '                <button className="secondary visual-search-button" type="button" disabled={loading || visualSearchLoading} onClick={searchScreenshotOnline}>',
    '                  {visualSearchLoading ? <><span className="spinner" /> Searching the web…</> : <><Icon name="search" size={18} /> Search image online</>}',
    '                </button>',
    '              )}',
  ),
  '',
  'redundant standalone visual-search button was not found',
);

await writeFile(file, source, 'utf8');
console.log('Enabled automatic visual-search fallback for screenshots');
