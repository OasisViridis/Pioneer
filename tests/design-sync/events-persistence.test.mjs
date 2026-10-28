import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { hash } from '../../tools/design-delivery.mjs';
import { persistEventMaterial } from '../../tools/design-events.mjs';

test('replayed event preserves its first reviewed base and refuses conflicting or incomplete material', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pioneer-event-replay-'));
  const eventKey = 'a'.repeat(64);
  const snapshotText = '{"version":"fixed"}\n';
  const first = {
    state: 'awaiting-local-agent',
    eventKey,
    baseSha: 'b'.repeat(40),
    featureId: 'pilot',
    snapshotSha256: hash(snapshotText),
    snapshotText,
  };
  try {
    const saved = await persistEventMaterial(dir, first);
    const materialPath = path.join(dir, `${eventKey}.material.json`);
    const snapshotPath = path.join(dir, `${eventKey}.snapshot.json`);
    const original = await readFile(materialPath, 'utf8');
    for (let i = 0; i < 3; i++) {
      const replay = await persistEventMaterial(dir, {
        ...first,
        baseSha: 'c'.repeat(40),
      });
      assert.deepEqual(replay, saved);
      assert.equal(await readFile(materialPath, 'utf8'), original);
      assert.equal(await readFile(snapshotPath, 'utf8'), snapshotText);
    }
    await assert.rejects(
      persistEventMaterial(dir, { ...first, featureId: 'different' }),
      (error) => error.state === 'review-required',
    );
    await writeFile(snapshotPath, 'tampered');
    await assert.rejects(
      persistEventMaterial(dir, first),
      (error) => error.state === 'review-required',
    );
    assert.equal(await readFile(materialPath, 'utf8'), original);
    assert.equal(await readFile(snapshotPath, 'utf8'), 'tampered');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('partial writes and an existing writer lock require review without replacement', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pioneer-event-partial-'));
  const eventKey = 'd'.repeat(64);
  const snapshotText = '{"version":"fixed"}\n';
  const input = {
    state: 'awaiting-local-agent',
    eventKey,
    baseSha: 'b'.repeat(40),
    snapshotSha256: hash(snapshotText),
    snapshotText,
  };
  try {
    const snapshotPath = path.join(dir, `${eventKey}.snapshot.json`);
    await writeFile(snapshotPath, snapshotText);
    await assert.rejects(
      persistEventMaterial(dir, input),
      (error) => error.state === 'review-required',
    );
    assert.equal(await readFile(snapshotPath, 'utf8'), snapshotText);
    await mkdir(path.join(dir, `${eventKey}.lock`));
    await assert.rejects(
      persistEventMaterial(dir, input),
      (error) => error.state === 'review-required',
    );
    assert.equal(await readFile(snapshotPath, 'utf8'), snapshotText);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('concurrent replays cannot overwrite the first stored base', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pioneer-event-race-'));
  const eventKey = 'e'.repeat(64);
  const snapshotText = '{"version":"fixed"}\n';
  const input = {
    state: 'awaiting-local-agent',
    eventKey,
    baseSha: 'b'.repeat(40),
    snapshotSha256: hash(snapshotText),
    snapshotText,
  };
  try {
    const outcomes = await Promise.allSettled([
      persistEventMaterial(dir, input),
      persistEventMaterial(dir, { ...input, baseSha: 'c'.repeat(40) }),
    ]);
    assert.ok(outcomes.some((outcome) => outcome.status === 'fulfilled'));
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected')
        assert.equal(outcome.reason.state, 'review-required');
    }
    const stored = JSON.parse(
      await readFile(path.join(dir, `${eventKey}.material.json`), 'utf8'),
    );
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled')
        assert.deepEqual(outcome.value, stored);
    }
    assert.equal(
      await readFile(path.join(dir, `${eventKey}.snapshot.json`), 'utf8'),
      snapshotText,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
