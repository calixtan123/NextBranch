import { byId } from '../../src/lib/northern/stations';
import { readSelection, selectionKey, type Catalogue, type Selection } from './catalogue';

export { selectionKey, type Selection } from './catalogue';
export type Style = 'amber' | 'modern';
export type Mode = Style | 'custom';
export type Card = Selection & { style?: Style };
type Undo = { card: Card; index: number; expiresAt: number };
type State = {
  ready: boolean;
  cards: readonly Card[];
  mode: Mode;
  recent: readonly string[];
  warning: string | null;
  removal: Undo | null;
};
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
type Save = 'saved' | 'duplicate' | 'full' | 'invalid';
type UndoResult = 'restored' | 'full' | 'expired' | 'invalid';
const MAX = 3;
const style = (value: unknown): Style | undefined => value === 'amber' || value === 'modern' ? value : undefined;
const persistenceWarning = 'Changes may only be available for this session.';

function decode(raw: string | null): Partial<State> {
  if (raw === null) return {};
  const data = JSON.parse(raw);
  if (data?.version !== 1) throw new Error('Unsupported preference version');
  const cards = new Map<string, Card>();
  for (const item of Array.isArray(data.cards) ? data.cards : []) {
    const selection = readSelection(item);
    if (selection && !cards.has(selectionKey(selection))) {
      cards.set(selectionKey(selection), { ...selection, style: style(item.style) });
    }
  }
  const recent = Array.isArray(data.recent)
    ? [...new Set<string>(data.recent.filter((id: unknown) => typeof id === 'string' && byId.has(id)))].slice(0, 2)
    : [];
  return { cards: [...cards.values()].slice(0, MAX), mode: style(data.mode) ?? (data.mode === 'custom' ? 'custom' : 'amber'), recent };
}

/** Resolves the common board style without discarding saved individual overrides. */
export function effectiveStyle(mode: Mode, card?: Card): Style {
  return mode === 'custom' ? card?.style ?? 'amber' : mode;
}

/** Owns synchronous preference transactions and serializes durable snapshots. */
export function createPreferences(
  storage: Storage,
  catalogue: Catalogue,
  now = Date.now,
  storageKey = 'nextbranch.preferences',
  initialCards: readonly Card[] = [],
) {
  let state: State = { ready: false, cards: [], mode: 'amber', recent: [], warning: null, removal: null };
  let writeQueue = Promise.resolve();
  let writable = true;
  let loading: Promise<void> | undefined;
  let undoChoice: Undo | null = null;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  const commit = (patch: Partial<State>) => {
    publish(patch);
    if (!writable) return;
    const { cards, mode, recent } = state;
    const payload = JSON.stringify({ version: 1, cards, mode, recent });
    writeQueue = writeQueue.then(async () => {
      try {
        await storage.setItem(storageKey, payload);
        if (state.warning) publish({ warning: null });
      } catch {
        publish({ warning: 'Could not save platform preferences. ' + persistenceWarning });
      }
    });
  };
  const indexOf = (key: string) => state.cards.findIndex(card => selectionKey(card) === key);
  const canSave = (selection: Selection) => state.ready && catalogue.has(selection);
  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load: () => loading ??= (async () => {
      try {
        const raw = await storage.getItem(storageKey);
        const decoded = decode(raw);
        publish({ cards: initialCards, ...decoded, ready: true });
      } catch {
        writable = false;
        publish({ ready: true, cards: initialCards, warning: 'Could not read platform preferences. ' + persistenceWarning });
      }
    })(),
    flush: () => writeQueue,
    save(selection: Selection): Save {
      if (!canSave(selection)) return 'invalid';
      if (indexOf(selectionKey(selection)) >= 0) return 'duplicate';
      if (state.cards.length >= MAX) return 'full';
      commit({ cards: [...state.cards, { ...selection }] });
      return 'saved';
    },
    replace(oldKey: string, selection: Selection): boolean {
      const index = indexOf(oldKey);
      if (!canSave(selection) || state.cards.length !== MAX || index < 0 || indexOf(selectionKey(selection)) >= 0) return false;
      const cards = [...state.cards];
      cards[index] = { ...selection };
      commit({ cards });
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
      if (indexOf(selectionKey(card)) >= 0) {
        undoChoice = null;
        publish({ removal: null });
        return 'restored';
      }
      const cards = [...state.cards];
      if (cards.length >= MAX) {
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
      if (!state.ready || !byId.has(id) || state.recent[0] === id) return;
      commit({ recent: [id, ...state.recent.filter(item => item !== id)].slice(0, 2) });
    },
  };
}
