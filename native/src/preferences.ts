/** Loads, recovers and serializes native saved-platform and appearance preferences. */
import { byId } from '../../src/lib/northern/stations';
import { readSelection, selectionKey, type Catalogue, type Selection } from './catalogue';

export { selectionKey, type Selection } from './catalogue';
export type Style = 'amber' | 'modern';
export type Mode = Style | 'custom';
export type InterfaceTheme = 'light' | 'dark';
export type Card = Selection & { style?: Style };
export type MockPlan = 'free' | 'pro';

export function savedCardLimit(plan?: MockPlan): number {
  return plan === 'free' ? 2 : plan === 'pro' ? 7 : 3;
}
type Undo = { card: Card; index: number; expiresAt: number };
type State = {
  ready: boolean;
  interfaceTheme?: InterfaceTheme;
  cards: readonly Card[];
  pausedCards: readonly Card[];
  mockPlan?: MockPlan;
  mode: Mode;
  recent: readonly string[];
  warning: string | null;
  removal: Undo | null;
};
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
type Save = 'saved' | 'duplicate' | 'full' | 'invalid';
type UndoResult = 'restored' | 'full' | 'expired' | 'invalid';
const style = (value: unknown): Style | undefined => value === 'amber' || value === 'modern' ? value : undefined;
const persistenceWarning = 'Changes may only be available for this session.';

type Decoded = { kind: 'valid' | 'corrupt'; preferences: Partial<State> } | { kind: 'future' };
const resetWarning = 'Some saved platform preferences were corrupt and have been reset. Valid preferences were kept.';

/** Keeps active vacancies independent of paused cards until the tester moves or restores them. */
function splitCards(cards: readonly Card[], plan?: MockPlan, pausedCards: readonly Card[] = []) {
  const limit = savedCardLimit(plan);
  return { cards: cards.slice(0, limit), pausedCards: plan ? [...cards.slice(limit), ...pausedCards] : [] };
}

/** Classifies unknown stored data before salvaging current-format preferences. */
function decode(raw: string | null, isKnownStation: (id: string) => boolean, canonicalStationId: (id: string) => string, catalogue: Catalogue, mockPlans: boolean, fromLegacy: boolean): Decoded {
  if (raw === null) return { kind: 'valid', preferences: {} };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) return { kind: 'corrupt', preferences: {} };
    throw error;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'corrupt', preferences: {} };
  const data = value as Record<string, unknown>;
  // Future schemas must be protected before inspecting fields this version understands.
  if (typeof data.version === 'number' && Number.isInteger(data.version) && data.version > 1) return { kind: 'future' };
  if (data.version !== 1) return { kind: 'corrupt', preferences: {} };
  let corrupt = !Array.isArray(data.cards) || !Array.isArray(data.recent) ||
    (style(data.mode) === undefined && data.mode !== 'custom');
  const fromMock = mockPlans && !fromLegacy;
  const mockPlan = mockPlans ? (fromMock && data.mockPlan === 'pro' ? 'pro' : 'free') : undefined;
  if (fromMock && ((data.mockPlan !== 'free' && data.mockPlan !== 'pro') || !Array.isArray(data.pausedCards))) {
    corrupt = true;
  }
  const seen = new Set<string>();
  const readCards = (items: unknown): Card[] => (Array.isArray(items) ? items : []).flatMap(item => {
    const parsed = readSelection(item);
    if (!parsed) {
      corrupt = true;
      return [];
    }
    const savedStyle = (item as Record<string, unknown>).style;
    if (savedStyle !== undefined && style(savedStyle) === undefined) corrupt = true;
    const selection = catalogue.resolve?.(parsed) ?? parsed;
    const key = selectionKey(selection);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...selection, style: style(savedStyle) }];
  });
  const cards = readCards(data.cards);
  const paused = fromMock ? readCards(data.pausedCards) : [];
  const recentIds = Array.isArray(data.recent) ? data.recent : [];
  const validRecentIds = recentIds.filter((id): id is string => typeof id === 'string' && isKnownStation(id));
  if (validRecentIds.length !== recentIds.length) corrupt = true;
  const recent = [...new Set(validRecentIds.map(canonicalStationId))].slice(0, 2);
  const interfaceTheme = data.interfaceTheme === 'light' || data.interfaceTheme === 'dark' ? data.interfaceTheme : undefined;
  if (data.interfaceTheme !== undefined && interfaceTheme === undefined) corrupt = true;
  return { kind: corrupt ? 'corrupt' : 'valid', preferences: {
    ...splitCards(cards, mockPlan, paused), mockPlan,
    mode: style(data.mode) ?? (data.mode === 'custom' ? 'custom' : 'amber'), recent, interfaceTheme,
  } };
}

/** Resolves the common board style without discarding saved individual overrides. */
export function effectiveStyle(mode: Mode, card?: Card): Style {
  return mode === 'custom' ? card?.style ?? 'amber' : mode;
}

/** Derives the control accent from effective saved styles, resolving ties to Amber. */
export function majorityStyle(mode: Mode, cards: readonly Card[]): Style {
  if (cards.length === 0) return effectiveStyle(mode);
  const modernCount = cards.filter(card => effectiveStyle(mode, card) === 'modern').length;
  return modernCount > cards.length / 2 ? 'modern' : 'amber';
}

/** Owns synchronous preference transactions and serializes durable snapshots. */
export function createPreferences(
  storage: Storage,
  catalogue: Catalogue,
  now = Date.now,
  legacyStorageKey = 'nextbranch.preferences',
  initialCards: readonly Card[] = [],
  isKnownStation: (id: string) => boolean = id => byId.has(id),
  canonicalStationId: (id: string) => string = id => id,
  { mockPlans = false } = {},
) {
  const storageKey = mockPlans ? legacyStorageKey + '.testflight-plans' : legacyStorageKey;
  const initialPlan = mockPlans ? 'free' : undefined;
  const defaults = mockPlans ? splitCards(initialCards, initialPlan) : { cards: initialCards, pausedCards: [] };
  let state: State = {
    ready: false, cards: [], pausedCards: [], mockPlan: initialPlan, mode: 'amber', recent: [], warning: null, removal: null,
  };
  let writeQueue = Promise.resolve();
  let writable = true;
  let loading: Promise<void> | undefined;
  let undoChoice: Undo | null = null;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  const persist = (snapshot: State, clearWarning: boolean) => {
    if (!writable) return;
    const { cards, mode, recent, interfaceTheme, mockPlan, pausedCards } = snapshot;
    const payload = JSON.stringify({ version: 1, cards, mode, recent, interfaceTheme,
      ...(mockPlan && { mockPlan, pausedCards }),
    });
    writeQueue = writeQueue.then(async () => {
      try {
        await storage.setItem(storageKey, payload);
        if (clearWarning && state.warning) publish({ warning: null });
      } catch {
        publish({ warning: 'Could not save platform preferences. ' + persistenceWarning });
      }
    });
  };
  const commit = (patch: Partial<State>, clearWarning = true) => {
    // Enqueue the snapshot before ready subscribers can create a later transaction.
    persist({ ...state, ...patch }, clearWarning);
    publish(patch);
  };
  const indexOf = (key: string) => state.cards.findIndex(card => selectionKey(card) === key);
  const pausedIndexOf = (key: string) => state.pausedCards.findIndex(card => selectionKey(card) === key);
  const contains = (key: string) => indexOf(key) >= 0 || pausedIndexOf(key) >= 0;
  const canSave = (selection: Selection) => state.ready && catalogue.has(selection);
  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load: () => loading ??= (async () => {
      let raw: string | null;
      let fromLegacy = false;
      try {
        raw = await storage.getItem(storageKey);
        if (mockPlans && raw === null) {
          raw = await storage.getItem(legacyStorageKey);
          fromLegacy = true;
        }
      } catch {
        writable = false;
        publish({ ready: true, ...defaults, warning: 'Could not read platform preferences. ' + persistenceWarning });
        return;
      }
      const decoded = decode(raw, isKnownStation, canonicalStationId, catalogue, mockPlans, fromLegacy);
      if (decoded.kind === 'future') {
        if (fromLegacy) {
          commit({ ready: true, ...defaults, warning: 'Legacy platform preferences were saved by a newer app version.' }, false);
          return;
        }
        writable = false;
        publish({ ready: true, ...defaults, warning: 'Platform preferences were saved by a newer app version. ' + persistenceWarning });
        return;
      }
      const recovered = { ...defaults, ...decoded.preferences, ready: true, warning: decoded.kind === 'corrupt' ? resetWarning : null };
      if (decoded.kind === 'corrupt' || fromLegacy) commit(recovered, false);
      else publish(recovered);
    })(),
    flush: () => writeQueue,
    save(selection: Selection): Save {
      if (!canSave(selection)) return 'invalid';
      if (contains(selectionKey(selection))) return 'duplicate';
      if (state.cards.length >= savedCardLimit(state.mockPlan)) return 'full';
      commit({ cards: [...state.cards, { ...selection }] });
      return 'saved';
    },
    replace(oldKey: string, selection: Selection): boolean {
      const index = indexOf(oldKey);
      if (!canSave(selection) || state.cards.length !== savedCardLimit(state.mockPlan) || index < 0 || contains(selectionKey(selection))) return false;
      const cards = [...state.cards];
      cards[index] = { ...selection };
      commit({ cards });
      return true;
    },
    setMockPlan(mockPlan: MockPlan) {
      if (!state.ready || !state.mockPlan || state.mockPlan === mockPlan) return;
      const { cards, pausedCards } = state;
      const collections = mockPlan === 'pro' ? splitCards([...cards, ...pausedCards], mockPlan) : splitCards(cards, mockPlan, pausedCards);
      commit({ mockPlan, ...collections });
    },
    activatePaused(key: string, swapKey?: string): boolean {
      const index = pausedIndexOf(key);
      if (index < 0) return false;
      const cards = [...state.cards];
      const pausedCards = [...state.pausedCards];
      const [card] = pausedCards.splice(index, 1);
      if (cards.length < savedCardLimit(state.mockPlan)) {
        if (swapKey !== undefined) return false;
        cards.push(card);
      } else {
        const slot = swapKey === undefined ? -1 : indexOf(swapKey);
        if (slot < 0) return false;
        const [swapped] = cards.splice(slot, 1, card);
        pausedCards.splice(index, 0, swapped);
      }
      commit({ cards, pausedCards });
      return true;
    },
    move(from: string, to: string) {
      const start = indexOf(from);
      const end = indexOf(to);
      if (start < 0 || end < 0 || start === end) return;
      const cards = [...state.cards];
      const [card] = cards.splice(start, 1);
      cards.splice(end, 0, card);
      commit({ cards });
    },
    remove(key: string) {
      const index = indexOf(key);
      if (index < 0) return;
      const cards = [...state.cards];
      const [card] = cards.splice(index, 1);
      undoChoice = null;
      commit({ cards, removal: { card, index, expiresAt: now() + 5_000 } });
    },
    expireUndo() {
      if (state.removal && state.removal !== undoChoice && now() >= state.removal.expiresAt) publish({ removal: null });
    },
    cancelUndo(intent: Undo) {
      if (undoChoice !== intent) return;
      undoChoice = null;
      if (now() >= intent.expiresAt) publish({ removal: null });
    },
    undo(replaceKey?: string, intent?: Undo): UndoResult {
      const removal = state.removal;
      if (intent && intent !== removal) return 'expired';
      if (!removal || (removal !== undoChoice && now() >= removal.expiresAt)) {
        if (removal) publish({ removal: null });
        return 'expired';
      }
      const { card, index } = removal;
      if (contains(selectionKey(card))) {
        undoChoice = null;
        publish({ removal: null });
        return 'restored';
      }
      const cards = [...state.cards];
      if (cards.length >= savedCardLimit(state.mockPlan)) {
        if (!replaceKey) {
          undoChoice = removal;
          return 'full';
        }
        const slot = indexOf(replaceKey);
        if (slot < 0) return 'invalid';
        cards[slot] = card;
      } else {
        if (replaceKey) return 'invalid';
        cards.splice(index, 0, card);
      }
      undoChoice = null;
      commit({ cards, removal: null });
      return 'restored';
    },
    /** Applies an explicit interface appearance after the saved session is loaded. */
    setInterfaceTheme(interfaceTheme: InterfaceTheme) {
      if (state.ready && state.interfaceTheme !== interfaceTheme) commit({ interfaceTheme });
    },
    setMode(mode: Mode) {
      if (state.ready && state.mode !== mode) commit({ mode });
    },
    setStyle(key: string, value: Style) {
      const index = indexOf(key);
      if (index < 0) return;
      const cards = [...state.cards];
      cards[index] = { ...cards[index], style: value };
      commit({ cards, mode: 'custom' });
    },
    selectStation(id: string) {
      if (!state.ready || !isKnownStation(id)) return;
      const stationId = canonicalStationId(id);
      if (state.recent[0] === stationId) return;
      commit({ recent: [stationId, ...state.recent.filter(item => item !== stationId)].slice(0, 2) });
    },
  };
}
