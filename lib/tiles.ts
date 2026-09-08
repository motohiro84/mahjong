import type { AppState, Suit, Tile } from "./types";

export const KANSU = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
export const HONORS = ["東", "南", "西", "北", "白", "發", "中"];
export const TERMINALS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
export const RED_FIVES = [4, 13, 22];

export function suitOf(i: number): Suit {
  if (i < 9) return "man";
  if (i < 18) return "pin";
  if (i < 27) return "sou";
  return "honor";
}

export function tileName(i: number, red = false) {
  if (i < 9) return `${red ? "赤" : ""}${KANSU[i]}萬`;
  if (i < 18) return `${red ? "赤" : ""}${KANSU[i - 9]}筒`;
  if (i < 27) return `${red ? "赤" : ""}${KANSU[i - 18]}索`;
  return HONORS[i - 27];
}

export function isSimple(i: number) {
  return i < 27 && i % 9 !== 0 && i % 9 !== 8;
}

export function isTerminalOrHonor(i: number) {
  return TERMINALS.includes(i);
}

export function isHonor(i: number) {
  return i >= 27;
}

export function countsOf(hand: Tile[]) {
  const counts = new Array<number>(34).fill(0);
  hand.forEach((tile) => counts[tile.i]++);
  return counts;
}

export function handSize(state: Pick<AppState, "hand" | "melds">) {
  return state.hand.length + state.melds.length * 3;
}

export function physicalHandSize(state: Pick<AppState, "hand" | "melds">) {
  return state.hand.length + state.melds.reduce((sum, meld) => sum + meld.tiles.length, 0);
}

export function isOpen(state: Pick<AppState, "melds">) {
  return state.melds.some((meld) => meld.type !== "ANKAN");
}

export function visibleCount(state: Pick<AppState, "hand" | "melds" | "dora" | "discards" | "otherDiscards">, i: number) {
  return (
    state.hand.filter((tile) => tile.i === i).length +
    state.melds.flatMap((meld) => meld.tiles).filter((tile) => tile === i).length +
    state.dora.filter((tile) => tile === i).length +
    state.discards.filter((tile) => tile.i === i).length +
    state.otherDiscards.filter((tile) => tile === i).length
  );
}

export function indicatorToDora(i: number) {
  if (i < 27) return Math.floor(i / 9) * 9 + ((i % 9 + 1) % 9);
  if (i < 31) return 27 + ((i - 27 + 1) % 4);
  return 31 + ((i - 31 + 1) % 3);
}

export function doraBreakdown(state: Pick<AppState, "hand" | "melds" | "dora" | "uraDora" | "riichi">) {
  const omoteTiles = state.dora.map(indicatorToDora);
  const uraTiles = state.riichi ? state.uraDora.map(indicatorToDora) : [];
  const all = [...state.hand.map((tile) => tile.i), ...state.melds.flatMap((meld) => meld.tiles)];
  const omote = all.reduce((sum, tile) => sum + omoteTiles.filter((dora) => dora === tile).length, 0);
  const ura = all.reduce((sum, tile) => sum + uraTiles.filter((dora) => dora === tile).length, 0);
  const aka = state.hand.filter((tile) => tile.red).length
    + state.melds.reduce((sum, meld) => sum + meld.redFlags.filter(Boolean).length, 0);
  return { omote, ura, aka, total: omote + ura + aka };
}

export function doraCount(state: Pick<AppState, "hand" | "melds" | "dora" | "uraDora" | "riichi">) {
  return doraBreakdown(state).total;
}

export const ALL_TILES = Array.from({ length: 34 }, (_, i) => i);

export function redAlreadyUsed(state: Pick<AppState, "hand" | "melds" | "discards">, i: number) {
  return [...state.hand, ...state.discards].some((tile) => tile.i === i && tile.red)
    || state.melds.some((meld) => meld.tiles.some((tile, index) => tile === i && meld.redFlags[index]));
}

export function canAddTile(state: AppState, tile: Tile) {
  return visibleCount(state, tile.i) + state.uraDora.filter((i) => i === tile.i).length < 4
    && (!tile.red || (RED_FIVES.includes(tile.i) && !redAlreadyUsed(state, tile.i)));
}

export function canDiscardTile(state: AppState, tile: Tile) {
  if (handSize(state) !== 14 || state.kuikae.includes(tile.i)) return false;
  // ADD_TILE は末尾に追加する。採点用の winTile を変えてもツモ牌は変わらない。
  const drawn = state.hand.at(-1);
  return !state.riichi || (state.agariType === "tsumo" && drawn?.i === tile.i && drawn.red === tile.red);
}
