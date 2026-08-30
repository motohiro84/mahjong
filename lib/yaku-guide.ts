import type { AppState, YakuGuide } from "./types";
import { bestScore } from "./scoring";
import { chiitoitsuShanten, kokushiShanten, shanten, standardShanten } from "./shanten";
import { countsOf, handSize, HONORS, isOpen, isSimple, isTerminalOrHonor, visibleCount } from "./tiles";
import { YAKU_CATALOG } from "./reference-data";

const SUITS = ["萬子", "筒子", "索子"];

function filtered(counts: number[], predicate: (i: number) => boolean) {
  return counts.map((count, i) => (predicate(i) ? count : 0));
}

function toitoiShanten(counts: number[], open: number) {
  const work = counts.slice();
  let sets = 0;
  let pairs = 0;
  for (let i = 0; i < 34; i++) if (work[i] >= 3) { sets++; work[i] -= 3; }
  for (let i = 0; i < 34; i++) if (work[i] >= 2) { pairs++; work[i] -= 2; }
  const complete = sets + open;
  const usefulPairs = Math.min(pairs, 5 - complete);
  let value = 8 - complete * 2 - usefulPairs;
  if (complete + usefulPairs === 5 && pairs === 0) value++;
  return value;
}

function runPatternDistance(state: AppState, counts: number[], starts: number[]) {
  const used = new Array(state.melds.length).fill(false);
  let missing = 0;
  let matched = 0;
  starts.forEach((start) => {
    const meldIndex = state.melds.findIndex((meld, i) => !used[i] && meld.type === "CHI" && meld.base === start);
    if (meldIndex >= 0) {
      used[meldIndex] = true;
      matched++;
    } else {
      for (let tile = start; tile <= start + 2; tile++) missing += Math.max(0, 1 - counts[tile]);
    }
  });
  if (state.melds.length - matched > 4 - starts.length) return null;
  return Math.max(shanten(counts, state.melds), missing - 1);
}

function tripletPatternDistance(state: AppState, counts: number[], tiles: number[]) {
  const used = new Array(state.melds.length).fill(false);
  let missing = 0;
  let matched = 0;
  tiles.forEach((tile) => {
    const meldIndex = state.melds.findIndex((meld, i) => !used[i] && meld.type !== "CHI" && meld.base === tile);
    if (meldIndex >= 0) {
      used[meldIndex] = true;
      matched++;
    } else missing += Math.max(0, 3 - counts[tile]);
  });
  if (state.melds.length - matched > 4 - tiles.length) return null;
  return Math.max(shanten(counts, state.melds), missing - 1);
}

function sequenceOnlyShanten(counts: number[], forbiddenPairs: Set<number>) {
  const work = counts.slice();
  let best = 8;
  const search = (index: number, sets: number, partial: number, pair: boolean) => {
    while (index < 34 && work[index] === 0) index++;
    if (index > 33) {
      const capped = Math.min(partial, 4 - sets);
      best = Math.min(best, 8 - sets * 2 - capped - (pair ? 1 : 0));
      return;
    }
    if (!pair && work[index] >= 2 && !forbiddenPairs.has(index)) {
      work[index] -= 2; search(index, sets, partial, true); work[index] += 2;
    }
    if (index < 27 && index % 9 <= 6 && work[index + 1] > 0 && work[index + 2] > 0) {
      work[index]--; work[index + 1]--; work[index + 2]--;
      search(index, sets + 1, partial, pair);
      work[index]++; work[index + 1]++; work[index + 2]++;
    }
    if (sets + partial < 4 && index < 27) {
      if (index % 9 <= 7 && work[index + 1] > 0) {
        work[index]--; work[index + 1]--; search(index, sets, partial + 1, pair); work[index]++; work[index + 1]++;
      }
      if (index % 9 <= 6 && work[index + 2] > 0) {
        work[index]--; work[index + 2]--; search(index, sets, partial + 1, pair); work[index]++; work[index + 2]++;
      }
    }
    work[index]--; search(index, sets, partial, pair); work[index]++;
  };
  search(0, 0, 0, false);
  return best;
}

function key(name: string) {
  return name.replace(/（[^）]*）/g, "").replace(/[\s・]/g, "").replace("断么九", "断幺九");
}

function catalogFor(name: string) {
  const normalized = key(name);
  if (normalized.startsWith("場風")) return YAKU_CATALOG.find((item) => item.name.startsWith("場風牌"));
  if (normalized.startsWith("自風")) return YAKU_CATALOG.find((item) => item.name.startsWith("自風牌"));
  if (normalized.startsWith("役牌")) return YAKU_CATALOG.find((item) => item.name.startsWith("役牌"));
  return YAKU_CATALOG.find((item) => key(item.name) === normalized);
}

export function yakuGuides(state: AppState) {
  const counts = countsOf(state.hand);
  const open = isOpen(state);
  const meldTiles = state.melds.flatMap((meld) => meld.tiles);
  const meldsMatch = (predicate: (i: number) => boolean) => meldTiles.every(predicate);
  const noChi = state.melds.every((meld) => meld.type !== "CHI");
  const result: YakuGuide[] = [];
  const add = (guide: YakuGuide) => { if (guide.distance <= 3) result.push(guide); };

  if (meldsMatch(isSimple)) add({
    name: "断幺九", han: "1翻", distance: standardShanten(filtered(counts, isSimple), state.melds.length),
    description: "2〜8の数牌だけで作る。1・9・字牌を1枚でも使うと成立しない。", sample: [1, 2, 3, 4, 5, 6, 10, 11, 12, 19, 20, 21, 13, 13],
  });

  let ittsuu = 99; let ittsuuBase = 0;
  [0, 9, 18].forEach((base) => {
    const distance = runPatternDistance(state, counts, [base, base + 3, base + 6]);
    if (distance !== null && distance < ittsuu) { ittsuu = distance; ittsuuBase = base; }
  });
  if (ittsuu < 99) add({
    name: "一気通貫", han: "2翻", openHan: "鳴くと1翻", distance: ittsuu,
    description: `${SUITS[Math.floor(ittsuuBase / 9)]}で123・456・789の3順子を作る。`,
    sample: [ittsuuBase, ittsuuBase + 1, ittsuuBase + 2, ittsuuBase + 3, ittsuuBase + 4, ittsuuBase + 5, ittsuuBase + 6, ittsuuBase + 7, ittsuuBase + 8, 31, 31, 31, 27, 27],
  });

  let sanshoku = 99; let sanshokuStart = 0;
  for (let n = 0; n < 7; n++) {
    const distance = runPatternDistance(state, counts, [n, n + 9, n + 18]);
    if (distance !== null && distance < sanshoku) { sanshoku = distance; sanshokuStart = n; }
  }
  if (sanshoku < 99) add({
    name: "三色同順", han: "2翻", openHan: "鳴くと1翻", distance: sanshoku,
    description: "萬子・筒子・索子で同じ数字の順子を1組ずつ作る。", sample: [sanshokuStart, sanshokuStart + 1, sanshokuStart + 2, sanshokuStart + 9, sanshokuStart + 10, sanshokuStart + 11, sanshokuStart + 18, sanshokuStart + 19, sanshokuStart + 20, 4, 5, 6, 31, 31],
  });

  if (!open && state.melds.length === 0) {
    const forbidden = new Set([31, 32, 33, 27 + state.round, 27 + state.seat]);
    add({ name: "平和", han: "1翻", closedOnly: true, distance: sequenceOnlyShanten(counts, forbidden), description: "すべて順子、役牌ではない雀頭、両面待ちで作る。門前限定。", sample: [0, 1, 2, 3, 4, 5, 10, 11, 12, 19, 20, 21, 13, 13] });
    let iipeikou = 99; let start = 0;
    for (let base = 0; base < 27; base += 9) for (let n = 0; n < 7; n++) {
      const s = base + n;
      const missing = [s, s + 1, s + 2].reduce((sum, tile) => sum + Math.max(0, 2 - counts[tile]), 0);
      const distance = Math.max(shanten(counts, state.melds), missing - 1);
      if (distance < iipeikou) { iipeikou = distance; start = s; }
    }
    add({ name: "一盃口", han: "1翻", closedOnly: true, distance: iipeikou, description: "同じ種類・同じ数字の順子を2組作る。門前限定。", sample: [start, start + 1, start + 2, start, start + 1, start + 2, 12, 13, 14, 21, 22, 23, 31, 31] });
  }

  let halfFlush = 99; let halfSuit = 0;
  for (let suit = 0; suit < 3; suit++) {
    if (!meldsMatch((i) => i >= 27 || Math.floor(i / 9) === suit)) continue;
    const distance = standardShanten(filtered(counts, (i) => i >= 27 || Math.floor(i / 9) === suit), state.melds.length);
    if (distance < halfFlush) { halfFlush = distance; halfSuit = suit; }
  }
  if (halfFlush < 99) add({ name: `混一色（${SUITS[halfSuit]}）`, han: "3翻", openHan: "鳴くと2翻", distance: halfFlush, description: `${SUITS[halfSuit]}と字牌だけで作る。`, sample: YAKU_CATALOG.find((item) => item.name.startsWith("混一色"))?.sample || [] });

  let fullFlush = 99; let fullSuit = 0;
  for (let suit = 0; suit < 3; suit++) {
    if (!meldsMatch((i) => i < 27 && Math.floor(i / 9) === suit)) continue;
    const distance = standardShanten(filtered(counts, (i) => i < 27 && Math.floor(i / 9) === suit), state.melds.length);
    if (distance < fullFlush) { fullFlush = distance; fullSuit = suit; }
  }
  if (fullFlush < 99) add({ name: `清一色（${SUITS[fullSuit]}）`, han: "6翻", openHan: "鳴くと5翻", distance: fullFlush, description: `${SUITS[fullSuit]}だけで作る。字牌も使わない。`, sample: YAKU_CATALOG.find((item) => item.name.startsWith("清一色"))?.sample || [] });

  if (noChi) add({ name: "対々和", han: "2翻", distance: toitoiShanten(counts, state.melds.length), description: "順子を使わず、同じ牌3枚の刻子を4組作る。ポンしても成立する。", sample: YAKU_CATALOG.find((item) => item.name.startsWith("対々和"))?.sample || [] });
  if (noChi && meldsMatch(isTerminalOrHonor)) add({ name: "混老頭", han: "2翻", distance: toitoiShanten(filtered(counts, isTerminalOrHonor), state.melds.length), description: "1・9・字牌だけで作る。", sample: YAKU_CATALOG.find((item) => item.name.startsWith("混老頭"))?.sample || [] });
  if (state.melds.length === 0) add({ name: "七対子", han: "2翻", closedOnly: true, distance: chiitoitsuShanten(counts), description: "異なる7種類の対子を作る特殊な形。", sample: YAKU_CATALOG.find((item) => item.name.startsWith("七対子"))?.sample || [] });

  const values = [31, 32, 33, 27 + state.round, 27 + state.seat];
  [...new Set(values)].forEach((tile) => {
    const have = counts[tile] + state.melds.filter((meld) => meld.base === tile).length * 3;
    if (have < 1) return;
    const need = Math.max(0, 3 - have);
    if (need > 0 && 4 - visibleCount(state, tile) < need) return;
    add({ name: `役牌 ${HONORS[tile - 27]}`, han: "1翻", distance: need, description: `${HONORS[tile - 27]}を3枚そろえるだけで成立する。ポンしても消えない。`, sample: [tile, tile, tile, 1, 2, 3, 10, 11, 12, 19, 20, 21, 27, 27] });
  });

  let sameTriplet = 99; let rank = 0;
  for (let n = 0; n < 9; n++) {
    const distance = tripletPatternDistance(state, counts, [n, n + 9, n + 18]);
    if (distance !== null && distance < sameTriplet) { sameTriplet = distance; rank = n; }
  }
  if (sameTriplet < 99) add({ name: "三色同刻", han: "2翻", distance: sameTriplet, description: "萬子・筒子・索子で同じ数字の刻子を作る。", sample: [rank, rank, rank, rank + 9, rank + 9, rank + 9, rank + 18, rank + 18, rank + 18, 0, 1, 2, 31, 31] });

  if (state.melds.length === 0) add({ name: "国士無双", han: "役満", closedOnly: true, distance: kokushiShanten(counts), description: "13種類の1・9・字牌を集め、どれかを対子にする。", sample: YAKU_CATALOG.find((item) => item.name.startsWith("国士無双"))?.sample || [] });

  const score = handSize(state) === 14 ? bestScore(state) : null;
  if (score?.yaku) {
    score.yaku.forEach((yaku) => {
      const existing = result.find((guide) => key(guide.name) === key(yaku.nm));
      if (existing) {
        existing.distance = -1;
        existing.completed = true;
        return;
      }
      const catalog = catalogFor(yaku.nm);
      result.push({
        name: yaku.nm,
        han: yaku.yakuman ? "役満" : `${yaku.han}翻`,
        closedOnly: catalog?.rule === "門前限定",
        distance: -1,
        completed: true,
        description: catalog?.description || "現在の和了形で成立している役。",
        sample: catalog?.sample || state.hand.map((tile) => tile.i),
      });
    });
  }

  const unique = [...new Map(result.map((guide) => [key(guide.name), guide])).values()];
  return unique.sort((a, b) => state.yakuSort === "near" ? a.distance - b.distance || Number(b.han.replace(/\D/g, "")) - Number(a.han.replace(/\D/g, "")) : Number(b.han.replace(/\D/g, "")) - Number(a.han.replace(/\D/g, "")) || a.distance - b.distance);
}
