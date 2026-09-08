import type { AppState, Meld, MeldType, Tile } from "./types";
import { countsOf, handSize, isOpen, visibleCount } from "./tiles";
import { shanten, ukeire } from "./shanten";
import { bestScore, scorePreview } from "./scoring";

export interface ChiOption {
  tiles: number[];
  use: number[];
}

export interface DiscardCandidate {
  tile: Tile;
  shanten: number;
  kinds: number;
  total: number;
}

export function chiOptions(incoming: number, counts: number[]) {
  if (incoming >= 27) return [];
  const number = incoming % 9;
  const base = incoming - number;
  const options: ChiOption[] = [];
  ([[-2, -1], [-1, 1], [1, 2]] as const).forEach(([a, b]) => {
    const x = number + a;
    const y = number + b;
    if (x < 0 || y < 0 || x > 8 || y > 8) return;
    if (counts[base + x] > 0 && counts[base + y] > 0) {
      options.push({ tiles: [incoming, base + x, base + y].sort((p, q) => p - q), use: [base + x, base + y] });
    }
  });
  return options;
}

export function isPermanentFuriten(state: AppState) {
  if (handSize(state) !== 13) return false;
  const counts = countsOf(state.hand);
  if (shanten(counts, state.melds) !== 0) return false;
  // フリテンは残り枚数によらず、和了形を作れる全牌で判定する。
  const waits = ukeire(counts, state.melds, () => 1).tiles.map((tile) => tile.i);
  return state.discards.some((tile) => waits.includes(tile.i));
}

export function ronCandidates(state: AppState) {
  if (handSize(state) !== 13 || isPermanentFuriten(state)) return [];
  const counts = countsOf(state.hand);
  const result = ukeire(counts, state.melds, (i) => Math.max(0, 4 - visibleCount(state, i)));
  if (result.base !== 0) return [];
  return result.tiles
    .filter(({ i }) => {
      const score = scorePreview(state, i, "ron");
      return score && !score.noYaku && !score.needWinTile;
    })
    .map((tile) => tile.i);
}

export function canRiichi(state: AppState) {
  if (isOpen(state)) return false;
  const counts = countsOf(state.hand);
  if (handSize(state) === 13) return shanten(counts, state.melds) === 0;
  return riichiCandidates(state).length > 0;
}

export function discardCandidates(state: AppState): DiscardCandidate[] {
  const seen = new Set<string>();
  const result: DiscardCandidate[] = [];
  state.hand.forEach((tile, index) => {
    const key = `${tile.i}:${tile.red}`;
    if (seen.has(key)) return;
    seen.add(key);
    const rest = state.hand.slice();
    rest.splice(index, 1);
    const counts = countsOf(rest);
    const base = shanten(counts, state.melds);
    const useful: { i: number; left: number }[] = [];
    for (let i = 0; i < 34; i++) {
      if (counts[i] >= 4) continue;
      counts[i]++;
      const next = shanten(counts, state.melds);
      counts[i]--;
      if (next < base) {
        const left = Math.max(0, 4 - visibleCount(state, i));
        if (left > 0) useful.push({ i, left });
      }
    }
    result.push({
      tile,
      shanten: base,
      kinds: useful.length,
      total: useful.reduce((sum, item) => sum + item.left, 0),
    });
  });
  return result.sort((a, b) => a.shanten - b.shanten || b.kinds - a.kinds || b.total - a.total);
}

export function riichiCandidates(state: AppState) {
  if (handSize(state) !== 14 || state.riichi || isOpen(state)) return [];
  return discardCandidates(state).filter((candidate) => candidate.shanten === 0 && !state.kuikae.includes(candidate.tile.i));
}

export function meldCandidates(state: AppState, type: MeldType) {
  const size = handSize(state);
  if (state.riichi) return [];
  if (["PON", "CHI", "KAN"].includes(type) && size !== 13) return [];
  if (["ANKAN", "ADD"].includes(type) && size !== 14) return [];
  const counts = countsOf(state.hand);
  return Array.from({ length: 34 }, (_, i) => i).filter((i) => {
    if (type === "PON") return counts[i] >= 2 && visibleCount(state, i) < 4;
    if (type === "CHI") return visibleCount(state, i) < 4 && chiOptions(i, counts).length > 0;
    if (type === "KAN") return counts[i] >= 3 && visibleCount(state, i) < 4;
    if (type === "ANKAN") return counts[i] >= 4;
    return counts[i] >= 1 && state.melds.some((meld) => meld.type === "PON" && meld.base === i);
  });
}

function takeTiles(hand: Tile[], wanted: number[]) {
  const pool = hand.slice();
  const result: Tile[] = [];
  wanted.forEach((i) => {
    let index = pool.findIndex((tile) => tile.i === i && !tile.red);
    if (index < 0) index = pool.findIndex((tile) => tile.i === i);
    if (index >= 0) result.push(...pool.splice(index, 1));
  });
  return result;
}

export function buildMeld(state: AppState, type: Exclude<MeldType, "ADD">, incoming: number, option?: ChiOption, calledRed = false) {
  const use = type === "CHI" ? option?.use || [] : new Array(type === "PON" ? 2 : type === "KAN" ? 3 : 4).fill(incoming);
  const consumed = takeTiles(state.hand, use);
  const tiles = type === "CHI" ? option?.tiles || [] : new Array(type === "PON" ? 3 : 4).fill(incoming);
  const redByTile = new Map<number, number>();
  consumed.forEach((tile) => {
    if (tile.red) redByTile.set(tile.i, (redByTile.get(tile.i) || 0) + 1);
  });
  if (calledRed) redByTile.set(incoming, (redByTile.get(incoming) || 0) + 1);
  const redFlags = tiles.map((i) => {
    const count = redByTile.get(i) || 0;
    if (!count) return false;
    redByTile.set(i, count - 1);
    return true;
  });
  // CHI の base は鳴いた牌ではなく順子の開始牌として採点側で使う。
  const base = type === "CHI" ? Math.min(...tiles) : incoming;
  const meld: Meld = { type, base, tiles, redFlags, consumed };
  return { meld, consumed };
}

export function kuikaeTiles(type: MeldType, incoming: number, tiles: number[]) {
  if (type === "PON") return [incoming];
  if (type !== "CHI") return [];
  const result = [incoming];
  const start = Math.min(...tiles);
  const number = start % 9;
  if (incoming === start && number <= 5) result.push(start + 3);
  if (incoming === start + 2 && number >= 1) result.push(start - 1);
  return [...new Set(result)];
}

export function canTsumo(state: AppState) {
  const score = bestScore(state);
  return !!score && !score.needWinTile && !score.noYaku;
}

export function noYakuWarning(state: AppState) {
  if (handSize(state) !== 13) return null;
  const counts = countsOf(state.hand);
  if (shanten(counts, state.melds) !== 0) return null;
  if (isPermanentFuriten(state)) {
    return "自分の捨て牌によるフリテンです。ロンはできませんが、ツモなら和了できます。";
  }
  const waits = ukeire(counts, state.melds, (i) => Math.max(0, 4 - visibleCount(state, i))).tiles;
  const availability = waits.map(({ i }) => {
    const ron = scorePreview(state, i, "ron");
    const tsumo = scorePreview(state, i, "tsumo");
    return {
      canRon: !!ron && !ron.noYaku && !ron.needWinTile,
      canTsumo: !!tsumo && !tsumo.noYaku && !tsumo.needWinTile,
    };
  });
  const cannotWin = availability.filter((item) => !item.canRon && !item.canTsumo).length;
  const cannotRon = availability.filter((item) => !item.canRon).length;
  if (cannotWin === waits.length) {
    return isOpen(state)
      ? "テンパイですが、すべての待ちが役なしです。このままでは上がれません。"
      : "ロンにはリーチなどの役が必要です。ツモなら門前清自摸和が付きます。";
  }
  if (cannotWin > 0) return "待ちの一部に役がありません。有効牌タブを確認してください。";
  if (cannotRon === waits.length && availability.every((item) => item.canTsumo)) {
    return "ツモなら上がれます。ロンするにはリーチなどの役が必要です。";
  }
  if (cannotRon > 0) return "待ちの一部はロンできません。有効牌タブを確認してください。";
  return null;
}
