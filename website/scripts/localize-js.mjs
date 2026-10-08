/** Compile translated text without rewriting JavaScript syntax or identifiers. */
import { parse } from 'acorn';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const cjk = /[\u3400-\u9fff]/;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') callback(node);
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) child.forEach((item) => visit(item, callback));
    else if (child && typeof child === 'object') visit(child, callback);
  }
}

function translator(catalog) {
  const keys = Object.keys(catalog).sort((a, b) => b.length - a.length || a.localeCompare(b));
  if (!keys.length) return (value) => value;
  const pattern = new RegExp(keys.map(escapeRegExp).join('|'), 'gu');
  return (value) => value.replace(pattern, (key) => catalog[key]);
}

export function compileJavaScript(source, catalog) {
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const translate = translator(catalog);
  const edits = [];
  const missing = new Set();
  visit(tree, (node) => {
    const literal = node.type === 'Literal' && typeof node.value === 'string';
    const template = node.type === 'TemplateElement';
    if (!literal && !template) return;
    const value = literal ? node.value : node.value.cooked;
    const raw = source.slice(node.start, node.end);
    // Explicit Unicode escapes represent language-independent data comparisons.
    if (!cjk.test(raw) && !['zh-CN', 'zh_CN', '、'].includes(value)) return;
    const translated =
      value === 'zh-CN'
        ? 'en-US'
        : value === 'zh_CN'
          ? 'en'
          : value === '、'
            ? ', '
            : translate(value);
    if (cjk.test(translated)) missing.add(value);
    const replacement = literal
      ? JSON.stringify(translated)
      : translated.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
    edits.push({ start: node.start, end: node.end, replacement });
  });
  let code = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    code = code.slice(0, edit.start) + edit.replacement + code.slice(edit.end);
  }
  // A bad catalog must fail the build, never ship a broken bundle.
  parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
  return { code, missing: [...missing].sort() };
}

export function collectMessages(source) {
  const messages = new Set();
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }), (node) => {
    if (node.type === 'Literal' && typeof node.value === 'string' && cjk.test(node.value)) {
      messages.add(node.value);
    }
  });
  return [...messages].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { catalog, browserSources, backendSources } = JSON.parse(readFileSync(0, 'utf8'));
  const files = Object.fromEntries(
    Object.entries(browserSources).map(([name, source]) => [
      name,
      compileJavaScript(source, catalog),
    ]),
  );
  const messages = [...new Set(Object.values(backendSources).flatMap(collectMessages))].sort();
  process.stdout.write(JSON.stringify({ files, messages }));
}
