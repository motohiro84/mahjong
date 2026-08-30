import type { AppState, Decomposition, ScoreResult, SetBlock, YakuResult } from "./types";
import { chiitoitsuShanten, kokushiShanten, shanten } from "./shanten";
import {
  countsOf,
  doraBreakdown,
  handSize,
  HONORS,
  isHonor,
  isOpen,
  isSimple,
  isTerminalOrHonor,
} from "./tiles";

interface EvaluatedSet extends SetBlock {
  open: boolean;
  kan: boolean;
  tiles?: number[];
}

interface WaitContext {
  wait: "tanki" | "shanpon" | "ryanmen" | "kanchan" | "penchan" | "special";
  winSetIndex: number | null;
  tsumo: boolean;
}

interface ScoreCandidate {
  yaku: YakuResult[];
  fu: number;
  han: number;
  yakuman: number;
  wait: string;
}

function situationalYakuOf(state: AppState, closed: boolean): YakuResult[] {
  const active = new Set(state.situationalYaku);
  const result: YakuResult[] = [];
  const tsumo = state.agariType === "tsumo";

  const firstTurn = state.discards.length === 0 && state.melds.length === 0;
  if (closed && tsumo && firstTurn && active.has("tenhou") && state.seat === 0) result.push({ nm: "天和", yakuman: 1 });
  if (closed && tsumo && firstTurn && active.has("chiihou") && state.seat !== 0) result.push({ nm: "地和", yakuman: 1 });
  if (state.riichi && closed) {
    result.push(active.has("doubleRiichi") ? { nm: "ダブル立直", han: 2 } : { nm: "立直", han: 1 });
    if (active.has("ippatsu")) result.push({ nm: "一発", han: 1 });
  }
  if (tsumo && closed) result.push({ nm: "門前清自摸和", han: 1 });
  if (tsumo && active.has("haitei")) result.push({ nm: "海底摸月", han: 1 });
  if (!tsumo && active.has("houtei")) result.push({ nm: "河底撈魚", han: 1 });
  if (tsumo && active.has("rinshan")) result.push({ nm: "嶺上開花", han: 1 });
  if (!tsumo && active.has("chankan")) result.push({ nm: "槍槓", han: 1 });
  return result;
}

function isKokushiThirteenWait(counts: number[], winTile: number) {
  const terminals = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  const beforeWin = counts.slice();
  beforeWin[winTile]--;
  return terminals.every((tile) => beforeWin[tile] === 1) && beforeWin.reduce((sum, count) => sum + count, 0) === 13;
}

export function decompose(counts: number[]) {
  const result: Decomposition[] = [];
  const work = counts.slice();
  for (let pair = 0; pair < 34; pair++) {
    if (work[pair] < 2) continue;
    work[pair] -= 2;
    const sets: SetBlock[] = [];
    const search = (index: number) => {
      while (index < 34 && work[index] === 0) index++;
      if (index > 33) {
        result.push({ pair, sets: sets.slice() });
        return;
      }
      if (work[index] >= 3) {
        work[index] -= 3;
        sets.push({ t: index, type: "kotsu" });
        search(index);
        sets.pop();
        work[index] += 3;
      }
      if (index < 27 && index % 9 <= 6 && work[index + 1] > 0 && work[index + 2] > 0) {
        work[index]--;
        work[index + 1]--;
        work[index + 2]--;
        sets.push({ t: index, type: "shuntsu" });
        search(index);
        sets.pop();
        work[index]++;
        work[index + 1]++;
        work[index + 2]++;
      }
    };
    search(0);
    work[pair] += 2;
  }
  return result;
}

export function isWinning(counts: number[], state: Pick<AppState, "melds">) {
  if (state.melds.length === 0 && (chiitoitsuShanten(counts) === -1 || kokushiShanten(counts) === -1)) return true;
  return shanten(counts, state.melds) === -1;
}

function allSets(state: AppState, decomposition: Decomposition, context: WaitContext): EvaluatedSet[] {
  const open: EvaluatedSet[] = state.melds.map((meld) => ({
    t: meld.base,
    type: meld.type === "CHI" ? "shuntsu" : "kotsu",
    open: meld.type !== "ANKAN",
    kan: meld.type !== "PON" && meld.type !== "CHI",
    tiles: meld.tiles,
  }));
  const closed: EvaluatedSet[] = decomposition.sets.map((set, index) => ({
    ...set,
    open: !context.tsumo && context.winSetIndex === index && set.type === "kotsu",
    kan: false,
  }));
  return [...open, ...closed];
}

function yakuOf(state: AppState, decomposition: Decomposition, context: WaitContext) {
  const sets = allSets(state, decomposition, context);
  const pair = decomposition.pair;
  const closed = !isOpen(state);
  const result: YakuResult[] = [];
  const tiles: number[] = [];
  sets.forEach((set) => {
    if (set.type === "shuntsu") tiles.push(set.t, set.t + 1, set.t + 2);
    else tiles.push(set.t, set.t, set.t);
  });
  tiles.push(pair, pair);
  const add = (nm: string, han: number) => result.push({ nm, han });

  result.push(...situationalYakuOf(state, closed));
  if (tiles.every(isSimple)) add("断幺九", 1);

  const valuePairs = [31, 32, 33, 27 + state.round, 27 + state.seat];
  sets.forEach((set) => {
    if (set.type !== "kotsu") return;
    if (set.t >= 31) add(`役牌 ${HONORS[set.t - 27]}`, 1);
    else if (set.t === 27 + state.round) add(`場風 ${HONORS[state.round]}`, 1);
    if (set.t === 27 + state.seat && set.t < 31) add(`自風 ${HONORS[state.seat]}`, 1);
  });

  const runs = sets.filter((set) => set.type === "shuntsu").map((set) => set.t);
  if (closed && sets.every((set) => set.type === "shuntsu") && !valuePairs.includes(pair) && context.wait === "ryanmen") add("平和", 1);
  if (closed) {
    const runCounts = new Map<number, number>();
    runs.forEach((run) => runCounts.set(run, (runCounts.get(run) || 0) + 1));
    const pairsOfRuns = [...runCounts.values()].filter((count) => count >= 2).length;
    if (pairsOfRuns >= 2) add("二盃口", 3);
    else if (pairsOfRuns === 1) add("一盃口", 1);
  }
  for (let n = 0; n < 7; n++) {
    if (runs.includes(n) && runs.includes(n + 9) && runs.includes(n + 18)) add("三色同順", closed ? 2 : 1);
  }
  const triplets = sets.filter((set) => set.type === "kotsu").map((set) => set.t);
  for (let n = 0; n < 9; n++) {
    if (triplets.includes(n) && triplets.includes(n + 9) && triplets.includes(n + 18)) add("三色同刻", 2);
  }
  [0, 9, 18].forEach((base) => {
    if (runs.includes(base) && runs.includes(base + 3) && runs.includes(base + 6)) add("一気通貫", closed ? 2 : 1);
  });
  if (sets.every((set) => set.type === "kotsu")) add("対々和", 2);

  const concealedTriplets = sets.filter((set) => set.type === "kotsu" && !set.open).length;
  if (concealedTriplets >= 4) {
    const double = state.doubleYakuman && context.wait === "tanki";
    result.push({ nm: double ? "四暗刻単騎" : "四暗刻", yakuman: double ? 2 : 1 });
  }
  else if (concealedTriplets === 3) add("三暗刻", 2);
  const kans = sets.filter((set) => set.kan).length;
  if (kans === 3) add("三槓子", 2);
  else if (kans === 4) result.push({ nm: "四槓子", yakuman: 1 });

  const dragonTriplets = triplets.filter((tile) => tile >= 31).length;
  const dragonPair = pair >= 31;
  if (dragonTriplets === 3) result.push({ nm: "大三元", yakuman: 1 });
  else if (dragonTriplets === 2 && dragonPair) add("小三元", 2);
  const windTriplets = triplets.filter((tile) => tile >= 27 && tile < 31).length;
  const windPair = pair >= 27 && pair < 31;
  if (windTriplets === 4) result.push({ nm: "大四喜", yakuman: state.doubleYakuman ? 2 : 1 });
  else if (windTriplets === 3 && windPair) result.push({ nm: "小四喜", yakuman: 1 });

  const blocks = sets.map((set) => (set.type === "shuntsu" ? [set.t, set.t + 1, set.t + 2] : [set.t])).concat([[pair]]);
  const allOutside = blocks.every((block) => block.some(isTerminalOrHonor));
  const hasHonor = tiles.some(isHonor);
  if (tiles.every(isTerminalOrHonor) && sets.every((set) => set.type === "kotsu")) {
    if (!hasHonor) result.push({ nm: "清老頭", yakuman: 1 });
    else add("混老頭", 2);
  } else if (allOutside) {
    if (hasHonor) add("混全帯幺九", closed ? 2 : 1);
    else add("純全帯幺九", closed ? 3 : 2);
  }
  if (tiles.every(isHonor)) result.push({ nm: "字一色", yakuman: 1 });
  const green = [19, 20, 21, 23, 25, 32];
  if (tiles.every((tile) => green.includes(tile))) result.push({ nm: "緑一色", yakuman: 1 });

  const suits = new Set(tiles.filter((tile) => tile < 27).map((tile) => Math.floor(tile / 9)));
  if (suits.size === 1 && !hasHonor) {
    add("清一色", closed ? 6 : 5);
    const base = [...suits][0] * 9;
    const suitCounts = new Array(9).fill(0);
    tiles.forEach((tile) => suitCounts[tile - base]++);
    const nineGates = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    let valid = true;
    let extra = 0;
    for (let n = 0; n < 9; n++) {
      if (suitCounts[n] < nineGates[n]) valid = false;
      extra += suitCounts[n] - nineGates[n];
    }
    if (valid && extra === 1 && closed) {
      const beforeWin = suitCounts.slice();
      if (state.winTile !== null && Math.floor(state.winTile / 9) === [...suits][0]) beforeWin[state.winTile % 9]--;
      const pure = beforeWin.every((count, index) => count === nineGates[index]);
      const double = state.doubleYakuman && pure;
      result.push({ nm: double ? "純正九蓮宝燈" : "九蓮宝燈", yakuman: double ? 2 : 1 });
    }
  } else if (suits.size === 1 && hasHonor) add("混一色", closed ? 3 : 2);
  else if (suits.size === 0) add("混一色", closed ? 3 : 2);

  const seen = new Set<string>();
  return result.filter((yaku) => {
    if (seen.has(yaku.nm)) return false;
    seen.add(yaku.nm);
    return true;
  });
}

function waitContexts(decomposition: Decomposition, winTile: number, tsumo: boolean): WaitContext[] {
  const result: WaitContext[] = [];
  if (decomposition.pair === winTile) result.push({ wait: "tanki", winSetIndex: null, tsumo });
  decomposition.sets.forEach((set, index) => {
    if (set.type === "kotsu" && set.t === winTile) result.push({ wait: "shanpon", winSetIndex: index, tsumo });
    if (set.type === "shuntsu" && winTile >= set.t && winTile <= set.t + 2) {
      const position = winTile - set.t;
      const number = set.t % 9;
      let wait: WaitContext["wait"] = "ryanmen";
      if (position === 1) wait = "kanchan";
      else if ((number === 0 && position === 2) || (number === 6 && position === 0)) wait = "penchan";
      result.push({ wait, winSetIndex: index, tsumo });
    }
  });
  return result;
}

function fuOf(state: AppState, decomposition: Decomposition, context: WaitContext, yaku: YakuResult[]) {
  const sets = allSets(state, decomposition, context);
  const closed = !isOpen(state);
  let fu = 20;
  if (closed && !context.tsumo) fu += 10;
  if (context.tsumo) fu += 2;
  sets.forEach((set) => {
    if (set.type !== "kotsu") return;
    const outside = isTerminalOrHonor(set.t);
    if (set.kan) fu += set.open ? (outside ? 16 : 8) : outside ? 32 : 16;
    else fu += set.open ? (outside ? 4 : 2) : outside ? 8 : 4;
  });
  const pair = decomposition.pair;
  if (pair >= 31) fu += 2;
  if (pair === 27 + state.round) fu += 2;
  if (pair === 27 + state.seat && pair < 31) fu += 2;
  if (["tanki", "kanchan", "penchan"].includes(context.wait)) fu += 2;
  if (yaku.some((item) => item.nm === "平和")) fu = context.tsumo ? 20 : 30;
  if (!closed && fu === 20) fu = 30;
  return Math.ceil(fu / 10) * 10;
}

function pointResult(han: number, fu: number, dealer: boolean, tsumo: boolean, yakuman: number, state: Pick<AppState, "honba" | "kyotaku" | "kiriageMangan">) {
  let base: number;
  let limit = "";
  if (yakuman) {
    base = 8000 * yakuman;
    limit = yakuman > 1 ? `${yakuman}倍役満` : "役満";
  } else if (han >= 13) {
    base = 8000;
    limit = "数え役満";
  } else if (han >= 11) {
    base = 6000;
    limit = "三倍満";
  } else if (han >= 8) {
    base = 4000;
    limit = "倍満";
  } else if (han >= 6) {
    base = 3000;
    limit = "跳満";
  } else if (han >= 5) {
    base = 2000;
    limit = "満貫";
  } else {
    const raw = fu * 2 ** (2 + han);
    const kiriage = state.kiriageMangan && raw === 1920;
    base = kiriage ? 2000 : Math.min(2000, raw);
    if (raw >= 2000 || kiriage) limit = kiriage ? "満貫（切り上げ）" : "満貫";
  }
  const round100 = (value: number) => Math.ceil(value / 100) * 100;
  const kyotakuPoints = state.kyotaku * 1000;
  const kyotakuPayment = state.kyotaku > 0 ? [{ label: `供託 ${state.kyotaku}本`, amount: `+${kyotakuPoints.toLocaleString()}点` }] : [];
  if (tsumo) {
    if (dealer) {
      const each = round100(base * 2) + state.honba * 100;
      return {
        total: each * 3 + kyotakuPoints,
        limit,
        detail: `子3人が各${each.toLocaleString()}点${state.kyotaku ? `・供託${kyotakuPoints.toLocaleString()}点` : ""}`,
        payments: [{ label: "子3人", amount: `各${each.toLocaleString()}点` }, ...kyotakuPayment],
      };
    }
    const fromDealer = round100(base * 2) + state.honba * 100;
    const fromChild = round100(base) + state.honba * 100;
    return {
      total: fromDealer + fromChild * 2 + kyotakuPoints,
      limit,
      detail: `親が${fromDealer.toLocaleString()}点・子2人が各${fromChild.toLocaleString()}点${state.kyotaku ? `・供託${kyotakuPoints.toLocaleString()}点` : ""}`,
      payments: [
        { label: "親", amount: `${fromDealer.toLocaleString()}点` },
        { label: "他の子2人", amount: `各${fromChild.toLocaleString()}点` },
        ...kyotakuPayment,
      ],
    };
  }
  const handPoints = round100(base * (dealer ? 6 : 4)) + state.honba * 300;
  return {
    total: handPoints + kyotakuPoints,
    limit,
    detail: `放銃者が${handPoints.toLocaleString()}点${state.kyotaku ? `・供託${kyotakuPoints.toLocaleString()}点` : ""}`,
    payments: [{ label: "放銃者（ロン牌を捨てた人）", amount: `${handPoints.toLocaleString()}点` }, ...kyotakuPayment],
  };
}

export function bestScore(state: AppState): ScoreResult | null {
  const counts = countsOf(state.hand);
  if (handSize(state) !== 14 || !isWinning(counts, state)) return null;
  const closed = !isOpen(state);
  const dealer = state.seat === 0;
  const tsumo = state.agariType === "tsumo";
  if (state.winTile === null || counts[state.winTile] === 0) return { needWinTile: true };
  const candidates: ScoreCandidate[] = [];

  if (closed && kokushiShanten(counts) === -1) {
    const double = state.doubleYakuman && isKokushiThirteenWait(counts, state.winTile);
    const yaku = [{ nm: double ? "国士無双十三面待ち" : "国士無双", yakuman: double ? 2 : 1 }, ...situationalYakuOf(state, closed)];
    candidates.push({ yaku, fu: 25, han: 0, yakuman: yaku.reduce((sum, item) => sum + (item.yakuman || 0), 0), wait: "special" });
  }
  if (closed && chiitoitsuShanten(counts) === -1) {
    const yaku: YakuResult[] = [...situationalYakuOf(state, closed), { nm: "七対子", han: 2 }];
    const tiles = state.hand.map((tile) => tile.i);
    if (tiles.every(isSimple)) yaku.push({ nm: "断幺九", han: 1 });
    if (tiles.every(isTerminalOrHonor)) yaku.push({ nm: "混老頭", han: 2 });
    if (tiles.every(isHonor)) yaku.push({ nm: "字一色", yakuman: 1 });
    const suits = new Set(tiles.filter((tile) => tile < 27).map((tile) => Math.floor(tile / 9)));
    const hasHonor = tiles.some(isHonor);
    if (suits.size === 1 && !hasHonor) yaku.push({ nm: "清一色", han: 6 });
    else if (suits.size === 1 && hasHonor) yaku.push({ nm: "混一色", han: 3 });
    const yakuman = yaku.reduce((sum, item) => sum + (item.yakuman || 0), 0);
    candidates.push({
      yaku,
      fu: 25,
      han: yaku.reduce((sum, item) => sum + (item.han || 0), 0),
      yakuman,
      wait: "tanki",
    });
  }

  decompose(counts).forEach((decomposition) => {
    waitContexts(decomposition, state.winTile as number, tsumo).forEach((context) => {
      const yaku = yakuOf(state, decomposition, context);
      if (!yaku.length) return;
      const yakuman = yaku.reduce((sum, item) => sum + (item.yakuman || 0), 0);
      const han = yaku.reduce((sum, item) => sum + (item.han || 0), 0);
      candidates.push({ yaku, fu: fuOf(state, decomposition, context, yaku), han, yakuman, wait: context.wait });
    });
  });

  if (!candidates.length) return { noYaku: true };
  const dora = doraBreakdown(state);
  let best: ScoreResult | null = null;
  candidates.forEach((candidate) => {
    const han = candidate.yakuman ? 0 : candidate.han + dora.total;
    const score = pointResult(han, candidate.fu, dealer, tsumo, candidate.yakuman, state);
    const yaku = candidate.yakuman ? candidate.yaku.filter((item) => item.yakuman) : candidate.yaku;
    if (!best || !best.score || score.total > best.score.total) {
      best = {
        yaku,
        fu: candidate.fu,
        han,
        yakuman: candidate.yakuman,
        wait: candidate.wait,
        dora: candidate.yakuman ? 0 : dora.total,
        omoteDora: candidate.yakuman ? 0 : dora.omote,
        uraDora: candidate.yakuman ? 0 : dora.ura,
        akaDora: candidate.yakuman ? 0 : dora.aka,
        score,
      };
    }
  });
  return best;
}

export function scorePreview(state: AppState, tile: number, agariType: "ron" | "tsumo", red = false) {
  if (handSize(state) !== 13) return null;
  const preview: AppState = {
    ...state,
    hand: [...state.hand, { i: tile, red }],
    winTile: tile,
    agariType,
  };
  return bestScore(preview);
}
