import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { collectMessages, compileJavaScript } from '../scripts/localize-js.mjs';

test('translation preserves quotes, newlines, backticks and literal template expressions', () => {
  const source = 'result = ["你好", `你好 ${name}`];';
  const translation = 'Hello "friend"\n`quoted` ${untrusted} \\ path';
  const { code, missing } = compileJavaScript(source, { 你好: translation });
  const context = { name: 'Ada', result: null };
  vm.runInNewContext(code, context);
  assert.deepEqual(Array.from(context.result), [translation, translation + ' Ada']);
  assert.deepEqual(missing, []);
});

test('only message literals are translated; comments, identifiers and escaped comparisons survive', () => {
  const source = '// 你好\nconst 你好 = "你好"; result = [你好, "\\u4f60\\u597d"];';
  const { code } = compileJavaScript(source, { 你好: 'Hello' });
  const context = { result: null };
  vm.runInNewContext(code, context);
  assert.deepEqual(Array.from(context.result), ['Hello', '你好']);
  assert.ok(code.includes('// 你好'));
  assert.ok(code.includes('const 你好'));
});

test('missing copy is reported and error extraction accepts either quote style', () => {
  assert.deepEqual(compileJavaScript('result = "漏译";', {}).missing, ['漏译']);
  assert.deepEqual(
    collectMessages('throw new Error("请重试"); const x = \'请重试\'; // 不收录注释'),
    ['请重试'],
  );
});
