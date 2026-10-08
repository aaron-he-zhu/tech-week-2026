import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
const source = readFileSync(new URL('../dist/assets/locale.js', import.meta.url), 'utf8');
function localePage({
  lang = 'en',
  to = 'zh',
  route = '/events/',
  search = '',
  hash = '',
  restoreVisible = false,
} = {}) {
  const location = { search, hash };
  let click;
  const link = {
    href: 'https://example.test' + (to === 'zh' ? '/zh' : '') + route,
    dataset: { language: to },
    addEventListener: (event, handler) => {
      if (event === 'click') click = handler;
    },
  };
  const window = {};
  const document = {
    documentElement: { lang },
    querySelectorAll: () => [link],
    getElementById: () => ({ hidden: !restoreVisible }),
  };
  vm.runInNewContext(source, { window, document, location, URL, URLSearchParams });
  return { window, location, link, click };
}
test('language switch preserves filters and sharing fragment, including translated format values', () => {
  const page = localePage({
    search:
      '?city=sf&date=2026-10-05&format=Networking&sort=popular&q=Swedish&address=1&view=calendar',
    hash: '#view=local-test',
  });
  page.click();
  const url = new URL(page.link.href);
  assert.equal(url.pathname, '/zh/events/');
  assert.equal(url.hash, '#view=local-test');
  assert.equal(url.searchParams.get('address'), '1');
  assert.equal(url.searchParams.get('view'), 'calendar');
  assert.equal(url.searchParams.get('format'), '社交交流');
  assert.equal(url.searchParams.get('q'), 'Swedish');
  assert.equal(url.searchParams.get('city'), 'sf');
  assert.equal(url.searchParams.get('date'), '2026-10-05');
  assert.equal(url.searchParams.get('sort'), 'popular');
  const back = localePage({
    lang: 'zh-CN',
    to: 'en',
    route: '/',
    search: '?group=Agent+%E4%B8%8E%E7%B3%BB%E7%BB%9F&q=Agent',
  });
  back.click();
  assert.equal(new URL(back.link.href).searchParams.get('group'), 'Agents & systems');
});
test('switching during recovery retains the original fragment after the app consumes it', () => {
  const page = localePage({
    route: '/wishlist/',
    hash: '#restore=local-only-test',
    restoreVisible: true,
  });
  page.location.hash = '';
  page.click();
  assert.equal(new URL(page.link.href).hash, '#restore=local-only-test');
  assert.equal(page.window.TWLocale.path('/wishlist/'), '/wishlist/');
  const zh = localePage({ lang: 'zh-CN' });
  assert.equal(zh.window.TWLocale.path('/wishlist/'), '/zh/wishlist/');
  assert.equal(page.window.TWLocale.text('分享链接已失效'), 'This sharing link is no longer valid');
  assert.equal(page.window.TWLocale.text('访客自己写的内容'), '访客自己写的内容');
});
test('all source and compiled browser scripts remain valid JavaScript after translation', () => {
  for (const folder of ['../public/assets/', '../dist/assets/en/'])
    for (const name of readdirSync(new URL(folder, import.meta.url)).filter((n) =>
      n.endsWith('.js'),
    ))
      new vm.Script(readFileSync(new URL(folder + name, import.meta.url), 'utf8'), {
        filename: name,
      });
});
