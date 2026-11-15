import { expect, it, vi } from 'vitest';
import { createCatalogue } from '../src/catalogue';
import { createPreferences, selectionKey, type Selection } from '../src/preferences';

const camden = '940GZZLUCTN';
const colindale = '940GZZLUCND';
const selection = (stationId: string, platform: string): Selection =>
  ({ stationId, platform, direction: 'Southbound' });
const a = selection(camden, 'A');
const b = selection(camden, 'B');
const c = selection(colindale, 'A');
const d = selection(colindale, 'B');
const catalogue = createCatalogue({ version: 1, platforms: [a, b, c, d] });
const keys = (cards: readonly Selection[]) => cards.map(selectionKey);
const makeStorage = () => ({ getItem: vi.fn<() => Promise<string | null>>().mockResolvedValue(null), setItem: vi.fn().mockResolvedValue(undefined) });

it('atomically rejects duplicate and unreviewed saves and replaces only the confirmed slot', async () => {
  const owner = createPreferences(makeStorage(), catalogue, () => 0);
  await owner.load();
  expect(owner.get().cards).toEqual([]);
  expect(owner.save(a)).toBe('saved');
  expect(owner.save(a)).toBe('duplicate');
  expect(owner.save(b)).toBe('saved');
  expect(owner.save(c)).toBe('saved');
  expect(owner.save(d)).toBe('full');
  expect(owner.save(selection(camden, '99'))).toBe('invalid');
  expect(owner.replace(selectionKey(b), d)).toBe(true);
  expect(owner.replace(selectionKey(b), b)).toBe(false);
  expect(keys(owner.get().cards)).toEqual(keys([a, d, c]));
});

it('Undo keeps intervening edits, requires explicit replacement when full and expires at five seconds', async () => {
  let now = 100;
  const owner = createPreferences(makeStorage(), catalogue, () => now);
  await owner.load();
  [a, b, c].forEach(owner.save);
  owner.remove(selectionKey(b));
  owner.move(selectionKey(c), selectionKey(a));
  owner.setStyle(selectionKey(a), 'modern');
  owner.save(d);
  expect(owner.undo()).toBe('full');
  expect(keys(owner.get().cards)).toEqual(keys([c, a, d]));
  expect(owner.undo(selectionKey(d))).toBe('restored');
  expect(keys(owner.get().cards)).toEqual(keys([c, a, b]));
  expect(owner.get().cards[1].style).toBe('modern');
  owner.remove(selectionKey(b));
  now += 5000;
  expect(owner.undo()).toBe('expired');
  expect(keys(owner.get().cards)).toEqual(keys([c, a]));
});

it('restores salvageable records and distinct recents with saved overrides across global changes', async () => {
  const storage = makeStorage();
  storage.getItem.mockResolvedValue(JSON.stringify({ version: 1, cards: [a, a, { ...b, style: 'modern' }, { stationId: 'missing' }, c, d], mode: 'amber', recent: [camden, camden, 'missing', colindale] }));
  const owner = createPreferences(storage, catalogue, () => 0);
  await owner.load();
  expect(keys(owner.get().cards)).toEqual(keys([a, b, c]));
  expect(owner.get().recent).toEqual([camden, colindale]);
  owner.selectStation(colindale);
  owner.setMode('modern');
  owner.setMode('custom');
  await owner.flush();
  const restored = createPreferences({ ...storage, getItem: async () => storage.setItem.mock.lastCall![1] }, catalogue, () => 0);
  await restored.load();
  expect(restored.get()).toMatchObject({ mode: 'custom', recent: [colindale, camden] });
  expect(restored.get().cards[1].style).toBe('modern');
});

it('preserves unknown versions or unread preferences and continues in memory', async () => {
  for (const getItem of [async () => '{"version":2}', async () => { throw Error('denied'); }]) {
    const storage = { ...makeStorage(), getItem };
    const owner = createPreferences(storage, catalogue, () => 0);
    await owner.load();
    expect(owner.get().warning).toBeTruthy();
    expect(owner.save(a)).toBe('saved');
    await owner.flush();
    expect(storage.setItem).not.toHaveBeenCalled();
  }
});

it('serializes writes and surfaces failure until a later write succeeds', async () => {
  const storage = makeStorage();
  let reject!: (error: Error) => void;
  storage.setItem.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const owner = createPreferences(storage, catalogue, () => 0);
  await owner.load();
  owner.save(a);
  await Promise.resolve();
  owner.save(b);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  reject(Error('write failed'));
  await owner.flush();
  expect(JSON.parse(storage.setItem.mock.lastCall![1]).cards).toHaveLength(2);
  expect(owner.get().warning).toBeNull();
  storage.setItem.mockRejectedValueOnce(Error('denied'));
  owner.remove(selectionKey(a));
  await owner.flush();
  expect(owner.get().warning).toBeTruthy();
  expect(keys(owner.get().cards)).toEqual(keys([b]));
});

it('keeps an initiated Undo available while the user chooses a replacement, without evicting a new selection', async () => {
  let now = 100;
  const owner = createPreferences(makeStorage(), catalogue, () => now);
  await owner.load();
  [a, b, c].forEach(owner.save);
  owner.remove(selectionKey(b));
  owner.save(d);
  expect(owner.undo()).toBe('full');
  const intent = owner.get().removal!;
  now += 6000;
  owner.expireUndo();
  expect(owner.get().removal).toBe(intent);
  expect(owner.undo(selectionKey(d), intent)).toBe('restored');
  expect(keys(owner.get().cards)).toEqual(keys([a, c, b]));
  expect(owner.undo(selectionKey(c), intent)).toBe('expired');
});

it('defaults legacy and invalid interface themes to system while preserving existing preferences', async () => {
  for (const interfaceTheme of [undefined, null, 'system', 'invalid', 1]) {
    const storage = makeStorage();
    storage.getItem.mockResolvedValue(JSON.stringify({ version: 1, cards: [{ ...b, style: 'modern' }, a], mode: 'custom', recent: [colindale, camden], interfaceTheme }));
    const owner = createPreferences(storage, catalogue);
    await owner.load();
    expect(owner.get().interfaceTheme).toBeUndefined();
    expect(owner.get()).toMatchObject({ mode: 'custom', recent: [colindale, camden] });
    expect(keys(owner.get().cards)).toEqual(keys([b, a]));
    expect(owner.get().cards[0].style).toBe('modern');
  }
});

it('ignores interface choices before loading and serializes rapid choices with later card writes', async () => {
  const storage = makeStorage();
  const owner = createPreferences(storage, catalogue);
  owner.setInterfaceTheme('dark');
  expect(owner.get().interfaceTheme).toBeUndefined();
  expect(storage.setItem).not.toHaveBeenCalled();
  await owner.load();
  for (const choice of ['dark', 'light', 'dark', 'light'] as const) owner.setInterfaceTheme(choice);
  owner.save(a);
  owner.setStyle(selectionKey(a), 'modern');
  owner.selectStation(camden);
  await owner.flush();
  expect(storage.setItem.mock.calls.slice(0, 4).map(call => JSON.parse(call[1]).interfaceTheme)).toEqual(['dark', 'light', 'dark', 'light']);
  const restored = createPreferences({ ...storage, getItem: async () => storage.setItem.mock.lastCall![1] }, catalogue);
  await restored.load();
  expect(restored.get()).toMatchObject({ interfaceTheme: 'light', mode: 'custom', recent: [camden] });
  expect(restored.get().cards).toEqual([{ ...a, style: 'modern' }]);
  owner.setInterfaceTheme('dark');
  await owner.flush();
  const dark = createPreferences({ ...storage, getItem: async () => storage.setItem.mock.lastCall![1] }, catalogue);
  await dark.load();
  expect(dark.get().interfaceTheme).toBe('dark');
});

it('applies session interface choices and preserves warnings when preference storage fails', async () => {
  const storage = makeStorage();
  storage.setItem.mockRejectedValue(Error('denied'));
  const owner = createPreferences(storage, catalogue);
  await owner.load();
  owner.setInterfaceTheme('light');
  expect(owner.get().interfaceTheme).toBe('light');
  await owner.flush();
  expect(owner.get().warning).toContain('session');
  const unread = createPreferences({ ...storage, getItem: async () => { throw Error('denied'); } }, catalogue);
  await unread.load();
  unread.setInterfaceTheme('dark');
  expect(unread.get()).toMatchObject({ interfaceTheme: 'dark', warning: expect.stringContaining('session') });
});


it.each(['{broken', 'null', '[]', '42', '"text"', '{"version":1}', '{"version":0}', '{"version":"2"}', '{"version":1.5}', '{"version":-1}', '{"cards":[]}'])(
  'resets corrupt preferences %s and persists subsequent saves across relaunch', async raw => {
    const storage = makeStorage();
    storage.getItem.mockResolvedValue(raw);
    const owner = createPreferences(storage, catalogue);
    await owner.load();
    expect(owner.get()).toMatchObject({ ready: true, cards: [], mode: 'amber', recent: [], warning: expect.stringContaining('reset') });
    await owner.flush();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.setItem.mock.lastCall![1])).toEqual({ version: 1, cards: [], mode: 'amber', recent: [] });
    expect(owner.get().warning).toContain('reset');
    expect(owner.save(a)).toBe('saved');
    owner.setMode('modern');
    await owner.flush();
    expect(owner.get().warning).toBeNull();
    const restored = createPreferences({ ...storage, getItem: async () => storage.setItem.mock.lastCall![1] }, catalogue);
    await restored.load();
    expect(restored.get()).toMatchObject({ cards: [a], mode: 'modern', warning: null });
  },
);

it('salvages valid current-version fields and records while repairing corrupt fields', async () => {
  const storage = makeStorage();
  storage.getItem.mockResolvedValue(JSON.stringify({ version: 1, cards: [null, 2, {}, { ...a, style: 'broken' }, { ...b, style: 'modern' }], mode: 'broken', recent: [camden, null, 'missing', colindale], interfaceTheme: 'dark' }));
  const owner = createPreferences(storage, catalogue);
  await owner.load();
  await owner.flush();
  expect(owner.get()).toMatchObject({ cards: [a, { ...b, style: 'modern' }], mode: 'amber', recent: [camden, colindale], interfaceTheme: 'dark', warning: expect.stringContaining('reset') });
  expect(JSON.parse(storage.setItem.mock.lastCall![1])).toEqual({ version: 1, cards: [a, { ...b, style: 'modern' }], mode: 'amber', recent: [camden, colindale], interfaceTheme: 'dark' });
});

it.each([{ cards: {}, mode: 'custom', recent: [] }, { cards: [a], mode: 'modern', recent: {} }])(
  'repairs invalid collection fields while keeping other valid preferences', async fields => {
    const storage = makeStorage();
    storage.getItem.mockResolvedValue(JSON.stringify({ version: 1, ...fields }));
    const owner = createPreferences(storage, catalogue);
    await owner.load();
    await owner.flush();
    expect(owner.get().warning).toContain('reset');
    expect(owner.get().mode).toBe(fields.mode);
    expect(owner.get().cards).toEqual(Array.isArray(fields.cards) ? fields.cards : []);
    expect(owner.get().recent).toEqual([]);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  },
);

it('preserves future-version bytes before applying current-schema validation', async () => {
  const raw = '  {"version": 7, "cards": "future representation", "mode": null}  ';
  const storage = makeStorage();
  storage.getItem.mockResolvedValue(raw);
  const owner = createPreferences(storage, catalogue);
  await owner.load();
  expect(owner.get().warning).toContain('newer');
  expect(owner.get().warning).toContain('session');
  owner.save(a);
  owner.setMode('modern');
  await owner.flush();
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(await storage.getItem()).toBe(raw);
});

it('protects unread bytes and reports a read warning without scheduling a reset', async () => {
  const storage = makeStorage();
  storage.getItem.mockRejectedValue(new Error('denied'));
  const owner = createPreferences(storage, catalogue);
  await owner.load();
  owner.save(a);
  await owner.flush();
  expect(owner.get().warning).toContain('Could not read');
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('reports a rejected reset accurately and retries through a later save that survives relaunch', async () => {
  const storage = makeStorage();
  storage.getItem.mockResolvedValue('{broken');
  storage.setItem.mockRejectedValueOnce(new Error('denied'));
  const owner = createPreferences(storage, catalogue);
  await owner.load();
  await owner.flush();
  expect(owner.get().warning).toContain('Could not save');
  expect(owner.get().warning).toContain('session');
  owner.save(a);
  await owner.flush();
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(owner.get().warning).toBeNull();
  const restored = createPreferences({ ...storage, getItem: async () => storage.setItem.mock.lastCall![1] }, catalogue);
  await restored.load();
  expect(restored.get()).toMatchObject({ cards: [a], warning: null });
});

it('queues a delayed recovery snapshot before rapid saves and keeps each snapshot immutable', async () => {
  const storage = makeStorage();
  storage.getItem.mockResolvedValue('{broken');
  let finishReset!: () => void;
  storage.setItem.mockImplementationOnce(() => new Promise<void>(resolve => { finishReset = resolve; }));
  const owner = createPreferences(storage, catalogue);
  await owner.load();
  owner.save(a);
  owner.setMode('modern');
  owner.save(b);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  finishReset();
  await owner.flush();
  expect(storage.setItem.mock.calls.map(call => JSON.parse(call[1]))).toEqual([
    { version: 1, cards: [], mode: 'amber', recent: [] },
    { version: 1, cards: [a], mode: 'amber', recent: [] },
    { version: 1, cards: [a], mode: 'modern', recent: [] },
    { version: 1, cards: [a, b], mode: 'modern', recent: [] },
  ]);
  expect(owner.get().warning).toBeNull();
});

it('loads valid legacy optional fields without a reset write or warning', async () => {
  const storage = makeStorage();
  storage.getItem.mockResolvedValue(JSON.stringify({ version: 1, cards: [a], mode: 'amber', recent: [] }));
  const owner = createPreferences(storage, catalogue);
  await owner.load();
  await owner.flush();
  expect(owner.get()).toMatchObject({ cards: [a], warning: null });
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('queues recovery before ready subscribers can save a new preference', async () => {
  const storage = makeStorage();
  storage.getItem.mockResolvedValue('{broken');
  const owner = createPreferences(storage, catalogue);
  let saved = false;
  owner.subscribe(() => {
    if (owner.get().ready && !saved) {
      saved = true;
      owner.save(a);
    }
  });
  await owner.load();
  await owner.flush();
  expect(storage.setItem.mock.calls.map(call => JSON.parse(call[1]).cards)).toEqual([[], [a]]);
  expect(owner.get().warning).toBeNull();
});
