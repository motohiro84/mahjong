import type { AppState } from "./types";

export const STORAGE_KEY = "haishirube-state-v1";

export function saveState(state: AppState, getStorage: () => Pick<Storage, "setItem"> = () => localStorage) {
  try {
    const { history: _history, hydrated: _hydrated, ...persisted } = state;
    void _history;
    void _hydrated;
    getStorage().setItem(STORAGE_KEY, JSON.stringify(persisted));
    return true;
  } catch {
    return false;
  }
}
