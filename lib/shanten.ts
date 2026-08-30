import type { Meld } from "./types";
import { TERMINALS } from "./tiles";

const cache = new Map<string, number>();

export function standardShanten(counts: number[], openMelds: number) {
  const key = `${counts.join(",")}|${openMelds}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const work = counts.slice();
  let best = 8;

  function search(index: number, sets: number, partial: number, pair: boolean) {
    if (index > 33) {
      const complete = sets + openMelds;
      let value = 8 - complete * 2 - partial;
      if (complete + partial === 5 && !pair) value++;
      best = Math.min(best, value);
      return;
    }
    if (work[index] === 0) {
      search(index + 1, sets, partial, pair);
      return;
    }
    const blocks = sets + openMelds + partial;
    if (work[index] >= 3) {
      work[index] -= 3;
      search(index, sets + 1, partial, pair);
      work[index] += 3;
    }
    if (index < 27 && index % 9 <= 6 && work[index + 1] > 0 && work[index + 2] > 0) {
      work[index]--;
      work[index + 1]--;
      work[index + 2]--;
      search(index, sets + 1, partial, pair);
      work[index]++;
      work[index + 1]++;
      work[index + 2]++;
    }
    if (blocks < 5) {
      if (work[index] >= 2) {
        work[index] -= 2;
        search(index, sets, partial + 1, true);
        work[index] += 2;
      }
      if (index < 27 && index % 9 <= 7 && work[index + 1] > 0) {
        work[index]--;
        work[index + 1]--;
        search(index, sets, partial + 1, pair);
        work[index]++;
        work[index + 1]++;
      }
      if (index < 27 && index % 9 <= 6 && work[index + 2] > 0) {
        work[index]--;
        work[index + 2]--;
        search(index, sets, partial + 1, pair);
        work[index]++;
        work[index + 2]++;
      }
    }
    work[index]--;
    search(index, sets, partial, pair);
    work[index]++;
  }

  search(0, 0, 0, false);
  cache.set(key, best);
  return best;
}

export function chiitoitsuShanten(counts: number[]) {
  let pairs = 0;
  let kinds = 0;
  counts.forEach((count) => {
    if (count > 0) kinds++;
    if (count >= 2) pairs++;
  });
  return 6 - pairs + Math.max(0, 7 - kinds);
}

export function kokushiShanten(counts: number[]) {
  let kinds = 0;
  let pair = 0;
  TERMINALS.forEach((i) => {
    if (counts[i] > 0) kinds++;
    if (counts[i] >= 2) pair = 1;
  });
  return 13 - kinds - pair;
}

export function shanten(counts: number[], melds: Meld[]) {
  let value = standardShanten(counts, melds.length);
  if (melds.length === 0) value = Math.min(value, chiitoitsuShanten(counts), kokushiShanten(counts));
  return value;
}

export function ukeire(counts: number[], melds: Meld[], remaining: (i: number) => number) {
  const base = shanten(counts, melds);
  const tiles: { i: number; left: number }[] = [];
  for (let i = 0; i < 34; i++) {
    if (counts[i] >= 4) continue;
    counts[i]++;
    const next = shanten(counts, melds);
    counts[i]--;
    if (next < base) {
      const left = remaining(i);
      if (left > 0) tiles.push({ i, left });
    }
  }
  return { base, tiles, total: tiles.reduce((sum, tile) => sum + tile.left, 0) };
}
