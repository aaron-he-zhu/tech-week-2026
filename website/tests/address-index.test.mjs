import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../public/assets/community.js', import.meta.url), 'utf8');
const id = '11111111-1111-4111-8111-111111111111';
function indexFixture(request) {
  const notices = [];
  const window = { Wishlist: { request }, dispatchEvent: (event) => notices.push(event.type) };
  vm.runInNewContext(source, { window, document: { getElementById: () => null }, Event, Date });
  return { api: window.Community, notices };
}
test('address index coalesces reads, uses public credentials and retains last results on failure', async () => {
  let finish,
    calls = 0;
  const fixture = indexFixture((path, options) => {
    calls++;
    assert.equal(path, '/v1/community/address-events');
    assert.equal(options.credential, '');
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const first = fixture.api.refreshAddressIndex();
  assert.equal(fixture.api.addressIndex.loading, true);
  assert.equal(fixture.api.refreshAddressIndex(), first);
  finish({ events: { [id]: 2 } });
  await first;
  await fixture.api.refreshAddressIndex();
  assert.equal(calls, 1);
  const invalid = fixture.api.refreshAddressIndex(true);
  finish({ events: { [id]: -1 } });
  await invalid;
  assert.equal(fixture.api.addressIndex.error, true);
  assert.equal(fixture.api.addressIndex.loading, false);
  assert.equal(fixture.api.addressIndex.counts[id], 2);
  const withdrawn = fixture.api.refreshAddressIndex(true);
  finish({ events: {} });
  await withdrawn;
  assert.equal(fixture.api.addressIndex.error, false);
  assert.equal(Object.keys(fixture.api.addressIndex.counts).length, 0);
});
test('first address lookup failure stays unknown instead of becoming an empty successful result', async () => {
  const { api } = indexFixture(async () => {
    throw new Error('offline');
  });
  await api.refreshAddressIndex();
  assert.equal(api.addressIndex.counts, null);
  assert.equal(api.addressIndex.error, true);
  assert.equal(api.addressIndex.loading, false);
});
