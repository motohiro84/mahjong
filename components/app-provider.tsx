"use client";

import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { AgariType, AnalysisTab, AppState, HandSnapshot, Meld, SituationalYaku, Tile } from "@/lib/types";
import { handSize } from "@/lib/tiles";

const STORAGE_KEY = "haishirube-state-v1";

const initialState: AppState = {
  hand: [],
  melds: [],
  dora: [],
  uraDora: [],
  discards: [],
  otherDiscards: [],
  kuikae: [],
  riichi: false,
  winTile: null,
  round: 0,
  seat: 1,
  agariType: "tsumo",
  situationalYaku: [],
  honba: 0,
  kyotaku: 0,
  kiriageMangan: false,
  doubleYakuman: false,
  tab: "input",
  yakuSort: "near",
  history: [],
  hydrated: false,
};

type Action =
  | { type: "HYDRATE"; state: Partial<AppState> }
  | { type: "ADD_TILE"; tile: Tile }
  | { type: "REMOVE_TILE"; tile: Tile }
  | { type: "DISCARD"; tile: Tile; riichi?: boolean }
  | { type: "ADD_MELD"; meld: Meld; consume: Tile[]; kuikae?: number[] }
  | { type: "UPGRADE_KAN"; meldIndex: number; tile: Tile }
  | { type: "REMOVE_MELD"; meldIndex: number }
  | { type: "ADD_DORA"; tile: number }
  | { type: "REMOVE_DORA"; index: number }
  | { type: "ADD_URA_DORA"; tile: number }
  | { type: "REMOVE_URA_DORA"; index: number }
  | { type: "ADD_OTHER_DISCARD"; tile: number }
  | { type: "REMOVE_OTHER_DISCARD"; tile: number }
  | { type: "CLEAR_OTHER_DISCARDS" }
  | { type: "SET_TAB"; tab: AnalysisTab }
  | { type: "SET_ROUND"; round: number }
  | { type: "SET_SEAT"; seat: number }
  | { type: "SET_AGARI"; agariType: AgariType }
  | { type: "SET_RIICHI"; riichi: boolean }
  | { type: "TOGGLE_SITUATIONAL_YAKU"; yaku: SituationalYaku }
  | { type: "SET_HONBA"; value: number }
  | { type: "SET_KYOTAKU"; value: number }
  | { type: "SET_SCORING_RULE"; rule: "kiriageMangan" | "doubleYakuman"; enabled: boolean }
  | { type: "SET_WIN_TILE"; tile: number }
  | { type: "SET_SORT"; sort: "near" | "han" }
  | { type: "RON"; tile: Tile }
  | { type: "UNDO" }
  | { type: "RESET" };

function snapshot(state: AppState): HandSnapshot {
  return {
    hand: state.hand,
    melds: state.melds,
    dora: state.dora,
    uraDora: state.uraDora,
    discards: state.discards,
    otherDiscards: state.otherDiscards,
    kuikae: state.kuikae,
    riichi: state.riichi,
    winTile: state.winTile,
    round: state.round,
    seat: state.seat,
    agariType: state.agariType,
    situationalYaku: state.situationalYaku,
    honba: state.honba,
    kyotaku: state.kyotaku,
    kiriageMangan: state.kiriageMangan,
    doubleYakuman: state.doubleYakuman,
  };
}

function withoutYaku(yaku: SituationalYaku[], ...removed: SituationalYaku[]) {
  return yaku.filter((item) => !removed.includes(item));
}

function withYaku(yaku: SituationalYaku[], ...added: SituationalYaku[]) {
  return [...new Set([...yaku, ...added])];
}

function changed(state: AppState, next: Partial<AppState>): AppState {
  return { ...state, ...next, history: [...state.history.slice(-89), snapshot(state)] };
}

function removeTiles(hand: Tile[], consume: Tile[]) {
  const result = hand.slice();
  consume.forEach((wanted) => {
    let index = result.findIndex((tile) => tile.i === wanted.i && tile.red === wanted.red);
    if (index < 0) index = result.findIndex((tile) => tile.i === wanted.i);
    if (index >= 0) result.splice(index, 1);
  });
  return result;
}

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...initialState,
        ...action.state,
        melds: (action.state.melds || []).map((meld) => ({
          ...meld,
          base: meld.type === "CHI" ? Math.min(...meld.tiles) : meld.base,
        })),
        uraDora: action.state.riichi ? (action.state.uraDora || []).slice(0, (action.state.dora || []).length) : [],
        otherDiscards: action.state.otherDiscards || [],
        situationalYaku: action.state.situationalYaku || [],
        honba: Math.max(0, Math.min(99, action.state.honba || 0)),
        kyotaku: Math.max(0, Math.min(99, action.state.kyotaku || 0)),
        history: [],
        hydrated: true,
      };
    case "ADD_TILE": {
      if (handSize(state) >= 14) return state;
      const nextHand = [...state.hand, action.tile];
      let situationalYaku = state.situationalYaku;
      if (handSize(state) === 13 && state.discards.length === 0 && state.melds.length === 0) {
        situationalYaku = withYaku(withoutYaku(situationalYaku, "tenhou", "chiihou"), state.seat === 0 ? "tenhou" : "chiihou");
      }
      return changed(state, {
        hand: nextHand,
        winTile: action.tile.i,
        agariType: "tsumo",
        kuikae: [],
        uraDora: [],
        situationalYaku,
      });
    }
    case "REMOVE_TILE": {
      const index = state.hand.findIndex((tile) => tile.i === action.tile.i && tile.red === action.tile.red);
      if (index < 0) return state;
      const hand = state.hand.slice();
      hand.splice(index, 1);
      return changed(state, { hand, winTile: null, uraDora: [], situationalYaku: withoutYaku(state.situationalYaku, "tenhou", "chiihou", "haitei", "houtei", "rinshan", "chankan") });
    }
    case "DISCARD": {
      if (state.kuikae.includes(action.tile.i)) return state;
      const index = state.hand.findIndex((tile) => tile.i === action.tile.i && tile.red === action.tile.red);
      if (index < 0) return state;
      const hand = state.hand.slice();
      const [discard] = hand.splice(index, 1);
      let situationalYaku = withoutYaku(state.situationalYaku, "tenhou", "chiihou", "haitei", "houtei", "rinshan", "chankan");
      if (action.riichi) {
        situationalYaku = withYaku(situationalYaku, "ippatsu");
        if (state.discards.length === 0 && state.melds.length === 0) situationalYaku = withYaku(situationalYaku, "doubleRiichi");
      } else if (state.riichi) {
        situationalYaku = withoutYaku(situationalYaku, "ippatsu");
      }
      return changed(state, {
        hand,
        discards: [...state.discards, discard],
        kuikae: [],
        winTile: null,
        agariType: "tsumo",
        riichi: action.riichi ? true : state.riichi,
        uraDora: [],
        situationalYaku,
      });
    }
    case "ADD_MELD": {
      let situationalYaku = withoutYaku(state.situationalYaku, "ippatsu", "doubleRiichi", "tenhou", "chiihou", "haitei", "houtei", "chankan", "rinshan");
      if (["KAN", "ANKAN"].includes(action.meld.type)) situationalYaku = withYaku(situationalYaku, "rinshan");
      return changed(state, {
        hand: removeTiles(state.hand, action.consume),
        melds: [...state.melds, { ...action.meld, consumed: action.consume }],
        kuikae: action.kuikae || [],
        riichi: false,
        winTile: null,
        uraDora: [],
        situationalYaku,
      });
    }
    case "UPGRADE_KAN": {
      const melds = state.melds.slice();
      const old = melds[action.meldIndex];
      if (!old || old.type !== "PON") return state;
      melds[action.meldIndex] = {
        ...old,
        type: "ADD",
        tiles: [old.base, old.base, old.base, old.base],
        redFlags: [...old.redFlags, action.tile.red],
        consumed: [...old.consumed, action.tile],
      };
      return changed(state, {
        hand: removeTiles(state.hand, [action.tile]), melds, kuikae: [], winTile: null, uraDora: [],
        situationalYaku: withYaku(withoutYaku(state.situationalYaku, "ippatsu", "tenhou", "chiihou", "haitei", "houtei", "chankan"), "rinshan"),
      });
    }
    case "REMOVE_MELD": {
      const meld = state.melds[action.meldIndex];
      if (!meld) return state;
      const restoredHand = [...state.hand, ...meld.consumed];
      if (restoredHand.length + (state.melds.length - 1) * 3 > 14) return state;
      const melds = state.melds.slice();
      melds.splice(action.meldIndex, 1);
      return changed(state, { hand: restoredHand, melds, kuikae: [], winTile: null, uraDora: [], situationalYaku: withoutYaku(state.situationalYaku, "rinshan") });
    }
    case "ADD_DORA":
      return state.dora.length >= 5 ? state : changed(state, { dora: [...state.dora, action.tile] });
    case "REMOVE_DORA": {
      const dora = state.dora.slice();
      dora.splice(action.index, 1);
      return changed(state, { dora, uraDora: state.uraDora.slice(0, dora.length) });
    }
    case "ADD_URA_DORA": {
      const known = state.hand.filter((tile) => tile.i === action.tile).length
        + state.melds.flatMap((meld) => meld.tiles).filter((tile) => tile === action.tile).length
        + state.dora.filter((tile) => tile === action.tile).length
        + state.uraDora.filter((tile) => tile === action.tile).length
        + state.discards.filter((tile) => tile.i === action.tile).length
        + state.otherDiscards.filter((tile) => tile === action.tile).length;
      return !state.riichi || handSize(state) !== 14 || state.uraDora.length >= state.dora.length || known >= 4
        ? state
        : changed(state, { uraDora: [...state.uraDora, action.tile] });
    }
    case "REMOVE_URA_DORA": {
      const uraDora = state.uraDora.slice();
      uraDora.splice(action.index, 1);
      return changed(state, { uraDora });
    }
    case "ADD_OTHER_DISCARD": {
      const known = state.hand.filter((tile) => tile.i === action.tile).length
        + state.melds.flatMap((meld) => meld.tiles).filter((tile) => tile === action.tile).length
        + state.dora.filter((tile) => tile === action.tile).length
        + state.discards.filter((tile) => tile.i === action.tile).length
        + state.otherDiscards.filter((tile) => tile === action.tile).length;
      return known >= 4 ? state : changed(state, { otherDiscards: [...state.otherDiscards, action.tile] });
    }
    case "REMOVE_OTHER_DISCARD": {
      const index = state.otherDiscards.lastIndexOf(action.tile);
      if (index < 0) return state;
      const otherDiscards = state.otherDiscards.slice();
      otherDiscards.splice(index, 1);
      return changed(state, { otherDiscards });
    }
    case "CLEAR_OTHER_DISCARDS":
      return state.otherDiscards.length ? changed(state, { otherDiscards: [] }) : state;
    case "SET_TAB":
      return { ...state, tab: action.tab };
    case "SET_ROUND":
      return changed(state, { round: action.round });
    case "SET_SEAT":
      return changed(state, {
        seat: action.seat,
        situationalYaku: state.situationalYaku.includes("tenhou") || state.situationalYaku.includes("chiihou")
          ? withYaku(withoutYaku(state.situationalYaku, "tenhou", "chiihou"), action.seat === 0 ? "tenhou" : "chiihou")
          : state.situationalYaku,
      });
    case "SET_AGARI":
      return changed(state, {
        agariType: action.agariType,
        situationalYaku: action.agariType === "ron"
          ? withoutYaku(state.situationalYaku, "haitei", "rinshan", "tenhou", "chiihou")
          : withoutYaku(state.situationalYaku, "houtei", "chankan"),
      });
    case "SET_RIICHI":
      return changed(state, {
        riichi: action.riichi,
        uraDora: action.riichi ? state.uraDora : [],
        situationalYaku: action.riichi ? state.situationalYaku : withoutYaku(state.situationalYaku, "ippatsu", "doubleRiichi"),
      });
    case "TOGGLE_SITUATIONAL_YAKU": {
      if (state.situationalYaku.includes(action.yaku)) {
        return changed(state, { situationalYaku: state.situationalYaku.filter((item) => item !== action.yaku) });
      }
      const exclusive: Partial<Record<SituationalYaku, SituationalYaku[]>> = {
        haitei: ["rinshan"],
        rinshan: ["haitei"],
        houtei: ["chankan"],
        chankan: ["houtei"],
        tenhou: ["chiihou"],
        chiihou: ["tenhou"],
      };
      return changed(state, { situationalYaku: withYaku(withoutYaku(state.situationalYaku, ...(exclusive[action.yaku] || [])), action.yaku) });
    }
    case "SET_HONBA":
      return changed(state, { honba: Math.max(0, Math.min(99, action.value)) });
    case "SET_KYOTAKU":
      return changed(state, { kyotaku: Math.max(0, Math.min(99, action.value)) });
    case "SET_SCORING_RULE":
      return changed(state, { [action.rule]: action.enabled });
    case "SET_WIN_TILE":
      return changed(state, { winTile: action.tile });
    case "SET_SORT":
      return { ...state, yakuSort: action.sort };
    case "RON":
      return changed(state, {
        hand: [...state.hand, action.tile],
        winTile: action.tile.i,
        agariType: "ron",
        tab: "score",
        uraDora: [],
        situationalYaku: withoutYaku(state.situationalYaku, "haitei", "rinshan", "tenhou", "chiihou"),
      });
    case "UNDO": {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return { ...state, ...previous, history: state.history.slice(0, -1) };
    }
    case "RESET":
      return { ...initialState, hydrated: true, history: [...state.history.slice(-89), snapshot(state)] };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      dispatch({ type: "HYDRATE", state: stored ? JSON.parse(stored) : {} });
    } catch {
      dispatch({ type: "HYDRATE", state: {} });
    }
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const { history: _history, hydrated: _hydrated, ...persisted } = state;
    void _history;
    void _hydrated;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppState must be used inside AppProvider");
  return context;
}
