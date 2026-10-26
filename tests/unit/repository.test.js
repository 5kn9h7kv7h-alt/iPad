import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryBackend, createRepository, openBackend } from '../../public/js/storage/repository.js';
import * as M from '../../public/js/core/model.js';
import * as R from '../../public/js/core/receipt.js';

const task = (id, title = id) => M.createTask({ projectId: 'university', title }, new Date(), id).task;

test('保存・取得・削除', async () => {
  const repo = createRepository(createMemoryBackend());
  await repo.putTask(task('a'));
  await repo.putTasks([task('b'), task('c')]);
  await repo.putRequest(M.createRequest({ projectId: 'sim-game', body: 'x' }, new Date(), 'r1').request);
  let all = await repo.loadAll();
  assert.equal(all.tasks.length, 3);
  assert.equal(all.requests.length, 1);
  await repo.deleteTask('b');
  await repo.deleteRequest('r1');
  all = await repo.loadAll();
  assert.deepEqual(all.tasks.map((t) => t.id).sort(), ['a', 'c']);
  assert.equal(all.requests.length, 0);
});

test('同じIDのputは上書き（追加ではない）', async () => {
  const repo = createRepository(createMemoryBackend());
  await repo.putTask(task('a', '旧'));
  await repo.putTask(task('a', '新'));
  const { tasks } = await repo.loadAll();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, '新');
});

test('replaceAll / putMany / clearAll', async () => {
  const repo = createRepository(createMemoryBackend());
  await repo.putTask(task('old'));
  await repo.replaceAll({ tasks: [task('n1'), task('n2')], requests: [] });
  assert.deepEqual((await repo.loadAll()).tasks.map((t) => t.id).sort(), ['n1', 'n2']);
  await repo.putMany({ tasks: [task('n3')], requests: [] });
  assert.equal((await repo.loadAll()).tasks.length, 3);
  await repo.clearAll();
  assert.deepEqual(await repo.loadAll(), { tasks: [], requests: [], receipts: [], rules: [] });
});

test('取得したデータを書き換えても保存内容は変わらない', async () => {
  const repo = createRepository(createMemoryBackend());
  await repo.putTask(task('a', '元'));
  (await repo.loadAll()).tasks[0].title = '改ざん';
  assert.equal((await repo.loadAll()).tasks[0].title, '元');
});

test('IndexedDBが無い環境ではメモリ保存に切り替わる', async () => {
  const b = await openBackend('x');
  assert.equal(b.kind, 'memory');
  assert.equal(b.persistent, false);
});

test('レシートと分類ルールの保存・削除・全消去', async () => {
  const repo = createRepository(createMemoryBackend());
  const r = R.createReceipt({ date: '2026-10-24', items: [{ name: '牛乳', amount: 198, category: '食費' }] }, new Date(), 'rcp-1').receipt;
  await repo.putReceipt(r);
  await repo.putRules([R.makeRule('牛乳', '食費'), R.makeRule('卵', '食費')]);
  let all = await repo.loadAll();
  assert.equal(all.receipts.length, 1);
  assert.equal(all.rules.length, 2);
  await repo.deleteReceipt('rcp-1');
  await repo.clearRules();
  all = await repo.loadAll();
  assert.deepEqual([all.receipts.length, all.rules.length], [0, 0]);
  await repo.putReceipt(r);
  await repo.clearAll();
  assert.equal((await repo.loadAll()).receipts.length, 0);
});
