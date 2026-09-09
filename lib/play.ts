import type { AppState, Meld, MeldType, ScoreResult, SituationalYaku, Tile } from "./types";
import { chiOptions, isPermanentFuriten, kuikaeTiles, riichiCandidates } from "./analysis";
import { countsOf, RED_FIVES } from "./tiles";
import { bestScore, pointResult, scorePreview } from "./scoring";
import { ukeire } from "./shanten";

export const PLAY_KEY = "haishirube-play-v1";
export const WINDS = ["東", "南", "西", "北"];
export const MELD_LABELS: Record<MeldType, string> = { CHI: "チー", PON: "ポン", KAN: "明槓", ANKAN: "暗槓", ADD: "加槓" };
export interface RiverTile extends Tile { called: boolean; declaration: boolean }
export interface TableMeld extends Meld { from: number | null }
export interface ResponseTile { player: number; index: number; tile: Tile; kind: "discard" | "kan" }
export interface WinInput { player: number; han: number; fu: number; yakuman: number }
export interface RoundResult {
  title: string; details: string[]; before: number[]; delta: number[];
  dealerContinues: boolean; nextHonba: number; winners: number[];
}
export interface PlaySnapshot {
  version: 1; phase: "setup" | "draw" | "discard" | "other" | "result";
  me: number; turn: number; round: number; kyoku: number; honba: number; sticks: number;
  scores: number[]; hand: Tile[]; melds: TableMeld[][]; rivers: RiverTile[][];
  riichi: boolean[]; doubleRiichi: boolean[]; ippatsu: boolean[];
  pendingRiichi: number | null; last: ResponseTile | null; drawn: Tile | null;
  kuikae: number[]; interrupted: boolean; rinshanFor: number | null; afterCall: boolean;
  temporaryFuriten: boolean; riichiFuriten: boolean;
  dora: number[]; ura: number[]; kiriage: boolean; doubleYakuman: boolean;
  result: RoundResult | null; log: string[];
}
export interface PlayState extends PlaySnapshot { history: PlaySnapshot[]; error: string | null }
export type PlayAction =
  | { type: "SETUP"; me: number; round: number; kyoku: number; honba: number; sticks: number; scores: number[] }
  | { type: "TILE"; tile: Tile; riichi?: boolean }
  | { type: "REMOVE"; index: number }
  | { type: "START" }
  | { type: "LATE_RIICHI" }
  | { type: "CALL"; player: number; kind: "CHI" | "PON" | "KAN"; consume: Tile[] }
  | { type: "KAN"; player: number; kind: "ANKAN" | "ADD"; tiles: Tile[] }
  | { type: "INDICATOR"; tile: number; ura?: boolean; remove?: number }
  | { type: "RULE"; rule: "kiriage" | "doubleYakuman"; value: boolean }
  | { type: "WIN"; method: "ron" | "tsumo"; winners: WinInput[]; extra?: SituationalYaku[] }
  | { type: "DRAW_END"; tenpai: number[]; abortive?: boolean }
  | { type: "NEXT"; dealerContinues?: boolean }
  | { type: "UNDO" } | { type: "RESET" };

export function initialPlay(): PlayState {
  return { version: 1, phase: "setup", me: 2, turn: 0, round: 0, kyoku: 1, honba: 0, sticks: 0,
    scores: [25000, 25000, 25000, 25000], hand: [], melds: [[], [], [], []], rivers: [[], [], [], []],
    riichi: [false, false, false, false], doubleRiichi: [false, false, false, false], ippatsu: [false, false, false, false],
    pendingRiichi: null, last: null, drawn: null, kuikae: [], interrupted: false, rinshanFor: null, afterCall: false,
    temporaryFuriten: false, riichiFuriten: false, dora: [], ura: [], kiriage: false, doubleYakuman: false,
    result: null, log: [], history: [], error: null };
}
function snapshot(s: PlayState): PlaySnapshot {
  const { history: _history, error: _error, ...data } = s;
  void _history; void _error;
  return data;
}
function requireThat(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function same(a: Tile, b: Tile) { return a.i === b.i && a.red === b.red; }
function playerValid(p: number) { return Number.isInteger(p) && p >= 0 && p < 4; }
function validTile(t: Tile) { return t && Number.isInteger(t.i) && t.i >= 0 && t.i < 34 && typeof t.red === "boolean" && (!t.red || RED_FIVES.includes(t.i)); }
function size(s: PlaySnapshot) { return s.hand.length + s.melds[s.me].length * 3; }
function say(s: PlaySnapshot, text: string) { s.log = [...s.log.slice(-149), text]; }
export function physicalTiles(s: PlaySnapshot): Tile[] {
  return [...s.hand, ...s.rivers.flat().filter((t) => !t.called), ...s.melds.flat().flatMap((m) => m.tiles.map((i, n) => ({ i, red: m.redFlags[n] }))), ...s.dora.map((i) => ({ i, red: false })), ...s.ura.map((i) => ({ i, red: false }))];
}
export function canExpose(s: PlaySnapshot, tiles: Tile[]) {
  const all = physicalTiles(s);
  for (const tile of tiles) {
    if (!validTile(tile) || all.filter((t) => t.i === tile.i).length >= 4 || (tile.red && all.some((t) => same(t, tile)))) return false;
    all.push(tile);
  }
  return true;
}
function removeHand(s: PlaySnapshot, consume: Tile[]) {
  for (const wanted of consume) {
    const index = s.hand.findIndex((t) => same(t, wanted));
    requireThat(index >= 0, "手牌にない牌は選択できません。");
    s.hand.splice(index, 1);
  }
}
export function analysisState(s: PlaySnapshot): AppState {
  // 自分の捨て牌は鳴かれたものもフリテン用に残す。副露側ではその1枚を除いて数える。
  const other = s.rivers.flatMap((river, p) => p === s.me ? [] : river.filter((t) => !t.called).map((t) => t.i));
  s.melds.forEach((melds, p) => {
    if (p === s.me) return;
    melds.forEach((meld) => {
      const tiles = meld.tiles.slice();
      if (meld.from === s.me) {
        // consumed は鳴いた人が手から出した牌。呼んだ牌は差分で求める。
        const used = meld.consumed.map((t) => t.i);
        const incoming = meld.tiles.slice();
        used.forEach((i) => incoming.splice(incoming.indexOf(i), 1));
        if (incoming.length) tiles.splice(tiles.indexOf(incoming[0]), 1);
      }
      other.push(...tiles);
    });
  });
  const situation: SituationalYaku[] = [];
  if (s.ippatsu[s.me]) situation.push("ippatsu");
  if (s.doubleRiichi[s.me]) situation.push("doubleRiichi");
  if (s.rinshanFor === s.me && s.drawn) situation.push("rinshan");
  if (!s.interrupted && !s.rivers[s.me].length && s.drawn) situation.push(s.me === 0 ? "tenhou" : "chiihou");
  return { hand: s.hand, melds: s.melds[s.me], discards: s.rivers[s.me], otherDiscards: other, dora: s.dora,
    uraDora: s.ura, kuikae: s.kuikae, riichi: s.riichi[s.me], winTile: s.drawn?.i ?? null,
    round: s.round, seat: s.me, agariType: "tsumo", situationalYaku: situation, honba: s.honba, kyotaku: s.sticks,
    kiriageMangan: s.kiriage, doubleYakuman: s.doubleYakuman, tab: "input", yakuSort: "near", history: [], hydrated: true };
}
export function ownScore(s: PlaySnapshot, method: "ron" | "tsumo", extra: SituationalYaku[] = []): ScoreResult | null {
  const a = analysisState(s);
  if (method === "ron") {
    if (!s.last || s.last.player === s.me || size(s) !== 13 || s.temporaryFuriten || s.riichiFuriten || isPermanentFuriten(a)) return null;
    a.situationalYaku = a.situationalYaku.filter((y) => !["tenhou", "chiihou", "rinshan"].includes(y));
    if (s.last.kind === "kan") a.situationalYaku.push("chankan");
    a.situationalYaku.push(...extra.filter((y) => y === "houtei" && s.last?.kind !== "kan"));
    return scorePreview(a, s.last.tile.i, "ron", s.last.tile.red);
  }
  if (s.phase !== "discard" || !s.drawn || s.turn !== s.me) return null;
  a.situationalYaku.push(...extra.filter((y) => y === "haitei" && s.rinshanFor !== s.me));
  return bestScore(a);
}
export function canOwnRon(s: PlaySnapshot) { const r = ownScore(s, "ron"); return !!r?.score && !r.noYaku; }
function shapeWaits(s: PlaySnapshot) {
  const counts = countsOf(s.hand);
  const meldTiles = s.melds[s.me].flatMap((m) => m.tiles);
  const waits = ukeire(counts, s.melds[s.me], (i) => counts[i] + meldTiles.filter((t) => t === i).length < 4 ? 1 : 0);
  return waits.base === 0 ? waits.tiles.map((t) => t.i) : [];
}
function finishResponse(s: PlaySnapshot, markPass = true) {
  if (markPass && s.last && s.last.player !== s.me && size(s) === 13 && shapeWaits(s).includes(s.last.tile.i)) {
    if (s.riichi[s.me]) s.riichiFuriten = true;
    else s.temporaryFuriten = true;
  }
  if (s.last?.kind === "kan") interrupt(s);
  if (s.pendingRiichi !== null) {
    s.scores[s.pendingRiichi] -= 1000;
    s.sticks++;
    s.pendingRiichi = null;
  }
  s.last = null;
}
function interrupt(s: PlaySnapshot) { s.interrupted = true; s.ippatsu = [false, false, false, false]; }
function declare(s: PlaySnapshot, p: number) {
  requireThat(!s.riichi[p] && s.scores[p] >= 1000 && s.melds[p].every((m) => m.type === "ANKAN") && !s.afterCall, "この状態ではリーチできません。");
  s.riichi[p] = true; s.ippatsu[p] = true;
  s.doubleRiichi[p] = !s.interrupted && s.rivers[p].length === 0;
  s.pendingRiichi = p;
}
export function callOptions(s: PlaySnapshot, kind: "CHI" | "PON" | "KAN"): Tile[][] {
  if (!s.last || s.last.kind !== "discard" || s.last.player === s.me || s.riichi[s.me] || size(s) !== 13 || s.melds[s.me].length >= 4) return [];
  if (kind === "CHI" && (s.last.player + 1) % 4 !== s.me) return [];
  const incoming = s.last.tile.i;
  const uses = kind === "CHI" ? chiOptions(incoming, countsOf(s.hand)).map((o) => o.use) : [Array(kind === "PON" ? 2 : 3).fill(incoming) as number[]];
  const options: Tile[][] = [];
  for (const use of uses) {
    const visit = (remaining: Tile[], picked: Tile[]) => {
      if (picked.length === use.length) {
        const blocked = kuikaeTiles(kind, incoming, [...use, incoming]);
        if (kind === "KAN" || remaining.some((t) => !blocked.includes(t.i))) options.push(picked);
        return;
      }
      const seen = new Set<boolean>();
      remaining.forEach((t, index) => {
        if (t.i !== use[picked.length] || seen.has(t.red)) return;
        seen.add(t.red);
        visit(remaining.filter((_, n) => n !== index), [...picked, t]);
      });
    };
    visit(s.hand, []);
  }
  return options.filter((o, i) => options.findIndex((p) => JSON.stringify(p) === JSON.stringify(o)) === i);
}
export function selfKanOptions(s: PlaySnapshot): { kind: "ANKAN" | "ADD"; tiles: Tile[] }[] {
  if (s.phase !== "discard" || !s.drawn || s.turn !== s.me || s.melds.flat().filter((m) => ["KAN", "ANKAN", "ADD"].includes(m.type)).length >= 4) return [];
  const result: { kind: "ANKAN" | "ADD"; tiles: Tile[] }[] = [];
  countsOf(s.hand).forEach((n, i) => {
    if (n !== 4) return;
    const tiles = s.hand.filter((t) => t.i === i);
    if (s.riichi[s.me]) {
      if (s.drawn?.i !== i) return;
      const before = structuredClone(s); before.hand.pop();
      const after = structuredClone(s); removeHand(after, tiles);
      after.melds[s.me].push({ type: "ANKAN", base: i, tiles: tiles.map((t) => t.i), redFlags: tiles.map((t) => t.red), consumed: tiles, from: null });
      if (JSON.stringify(shapeWaits(before)) !== JSON.stringify(shapeWaits(after))) return;
    }
    result.push({ kind: "ANKAN", tiles });
  });
  if (!s.riichi[s.me]) s.melds[s.me].filter((m) => m.type === "PON").forEach((m) => s.hand.filter((t) => t.i === m.base).forEach((t) => result.push({ kind: "ADD", tiles: [t] })));
  return result;
}
export function validScoreInput(w: WinInput, method: "ron" | "tsumo") {
  if (!playerValid(w.player) || !Number.isInteger(w.yakuman) || w.yakuman < 0 || w.yakuman > 6) return false;
  if (w.yakuman) return true;
  if (!Number.isInteger(w.han) || w.han < 1 || w.han > 13) return false;
  if (w.han >= 5) return true;
  if (![20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110].includes(w.fu)) return false;
  if (w.fu === 20) return method === "tsumo" && w.han >= 2;
  if (w.fu === 25) return w.han >= (method === "tsumo" ? 3 : 2);
  return !(method === "tsumo" && w.fu === 110 && w.han === 1);
}
export function winSettlement(s: PlaySnapshot, method: "ron" | "tsumo", inputs: WinInput[], extra: SituationalYaku[] = []): RoundResult {
  if (method === "tsumo" && s.pendingRiichi !== null) { s = structuredClone(s); finishResponse(s, false); }
  requireThat(inputs.length > 0 && new Set(inputs.map((w) => w.player)).size === inputs.length, "和了者を選択してください。");
  const from = method === "ron" ? s.last?.player : s.turn;
  requireThat(from !== undefined, "対象の捨て牌がありません。");
  if (method === "tsumo") requireThat(inputs.length === 1 && inputs[0].player === s.turn && ((s.phase === "other" && !s.afterCall) || (s.phase === "discard" && !!s.drawn)), "現在の手番のツモ和了を選択してください。");
  else requireThat(inputs.every((w) => w.player !== from), "捨てた本人はロンできません。");
  const delta = [0, 0, 0, 0]; const details: string[] = [];
  const ordered = inputs.slice().sort((a, b) => ((a.player - from + 4) % 4) - ((b.player - from + 4) % 4));
  for (const input of ordered) {
    let w = input;
    if (w.player === s.me) {
      const own = ownScore(s, method, extra);
      requireThat(own?.score && !own.noYaku, "自分の手牌では和了できません。役・フリテン・和了牌を確認してください。");
      w = { player: s.me, han: own.han || 0, fu: own.fu || 0, yakuman: own.yakuman || 0 };
    } else requireThat(validScoreInput(w, method), "成立する翻・符を入力してください（リーチ・ドラ込み）。");
    const rule = { honba: s.honba, kyotaku: 0, kiriageMangan: s.kiriage };
    const score = pointResult(w.han, w.fu, w.player === 0, method === "tsumo", w.yakuman, rule);
    if (method === "ron") { delta[from] -= score.total; delta[w.player] += score.total; }
    else {
      const dealerPayment = pointResult(w.han, w.fu, true, true, w.yakuman, rule).total / 3;
      const childPayment = w.player === 0 ? score.total / 3 : (score.total - dealerPayment) / 2;
      for (let p = 0; p < 4; p++) if (p !== w.player) { const amount = p === 0 ? dealerPayment : childPayment; delta[p] -= amount; delta[w.player] += amount; }
    }
    details.push(`${WINDS[w.player]}家 ${method === "ron" ? "ロン" : "ツモ"}：${w.yakuman ? `${w.yakuman}倍役満` : `${w.han}翻${w.fu}符`}・${score.detail}`);
  }
  // 複数ロンは本場を各和了者へ。供託は放銃者から順に最も近い和了者へ。
  if (s.sticks) { delta[ordered[0].player] += s.sticks * 1000; details.push(`供託${s.sticks}本は${WINDS[ordered[0].player]}家へ`); }
  const winners = ordered.map((w) => w.player);
  const dealerContinues = winners.includes(0);
  return { title: method === "tsumo" ? `${WINDS[winners[0]]}家のツモ和了` : `${winners.map((p) => `${WINDS[p]}家`).join("・")}のロン和了`, details, before: s.scores.slice(), delta, dealerContinues, nextHonba: dealerContinues ? s.honba + 1 : 0, winners };
}
function apply(s: PlaySnapshot, action: PlayAction): PlaySnapshot {
  if (action.type === "RESET") return snapshot(initialPlay());
  if (action.type === "SETUP") {
    requireThat(s.phase === "setup", "局の途中では開始設定を変更できません。");
    requireThat(playerValid(action.me) && playerValid(action.round) && Number.isInteger(action.kyoku) && action.kyoku >= 1 && action.kyoku <= 4 && [action.honba, action.sticks].every((n) => Number.isInteger(n) && n >= 0 && n <= 99) && action.scores.length === 4 && action.scores.every((n) => Number.isInteger(n) && Math.abs(n) <= 1000000 && n % 100 === 0), "開始設定の数値を確認してください。");
    Object.assign(s, { me: action.me, round: action.round, kyoku: action.kyoku, honba: action.honba, sticks: action.sticks, scores: action.scores.slice() }); return s;
  }
  if (action.type === "RULE") { s[action.rule] = action.value; return s; }
  if (action.type === "INDICATOR") {
    const list = action.ura ? s.ura : s.dora;
    if (action.remove !== undefined) { list.splice(action.remove, 1); if (!action.ura) s.ura = s.ura.slice(0, s.dora.length); return s; }
    requireThat(list.length < (action.ura ? s.dora.length : 5) && canExpose(s, [{ i: action.tile, red: false }]), "表示牌の枚数を確認してください。");
    if (action.ura) requireThat(s.riichi[s.me], "裏ドラは自分のリーチ和了時に入力します。");
    list.push(action.tile); return s;
  }
  if (action.type === "REMOVE") { requireThat(s.phase === "setup", "対局中の訂正は1手戻すを使用してください。"); s.hand.splice(action.index, 1); return s; }
  if (action.type === "START") { requireThat(s.phase === "setup" && s.hand.length === 13, "13枚を入力してください。"); s.turn = 0; s.phase = s.me === 0 ? "draw" : "other"; say(s, `${WINDS[s.round]}${s.kyoku}局 開始`); return s; }
  if (action.type === "NEXT") {
    requireThat(s.phase === "result" && s.result, "局を終了してから次局へ進みます。");
    const keep = action.dealerContinues ?? s.result.dealerContinues;
    const fresh = snapshot(initialPlay());
    Object.assign(fresh, { me: keep ? s.me : (s.me + 3) % 4, round: !keep && s.kyoku === 4 ? (s.round + 1) % 4 : s.round, kyoku: keep ? s.kyoku : s.kyoku % 4 + 1,
      honba: s.result.winners.length ? (keep ? s.honba + 1 : 0) : s.honba + 1, sticks: s.sticks, scores: keep ? s.scores : [...s.scores.slice(1), s.scores[0]], kiriage: s.kiriage, doubleYakuman: s.doubleYakuman });
    return fresh;
  }
  requireThat(s.phase !== "result", "この局は終了しています。");
  if (action.type === "TILE") {
    requireThat(validTile(action.tile), "牌を確認してください。");
    if (s.phase === "setup") { requireThat(s.hand.length < 13 && canExpose(s, [action.tile]), "同じ牌は4枚、赤五は各色1枚までです。"); s.hand.push(action.tile); return s; }
    if (s.phase === "draw") {
      requireThat(canExpose(s, [action.tile]), "その牌はすでに全て見えています。");
      finishResponse(s); s.temporaryFuriten = false; s.hand.push(action.tile); s.drawn = action.tile; s.phase = "discard"; s.afterCall = false; return s;
    }
    const p = s.turn;
    if (p === s.me) {
      requireThat(s.phase === "discard" && size(s) === 14 && !s.kuikae.includes(action.tile.i), "この牌は捨てられません。");
      requireThat(!s.riichi[p] || (s.drawn && same(s.drawn, action.tile)), "リーチ後はツモ牌だけを捨てられます。");
      if (action.riichi) requireThat(riichiCandidates(analysisState(s)).some((c) => same(c.tile, action.tile)), "テンパイする打牌を選択してください。");
      removeHand(s, [action.tile]); s.temporaryFuriten = false;
    } else requireThat(s.phase === "other" && !s.kuikae.includes(action.tile.i) && canExpose(s, [action.tile]), "その捨て牌は入力できません。");
    finishResponse(s);
    if (action.riichi) declare(s, p); else s.ippatsu[p] = false;
    s.rivers[p].push({ ...action.tile, called: false, declaration: !!action.riichi });
    s.last = { kind: "discard", player: p, index: s.rivers[p].length - 1, tile: action.tile };
    s.drawn = null; s.kuikae = []; s.rinshanFor = null; s.afterCall = false;
    s.turn = (p + 1) % 4; s.phase = s.turn === s.me ? "draw" : "other";
    say(s, `${WINDS[p]}家が打牌${action.riichi ? "・リーチ宣言" : ""}`); return s;
  }
  requireThat(s.phase !== "setup", "開始を押してください。");
  if (action.type === "LATE_RIICHI") {
    const last = s.last;
    requireThat(last?.kind === "discard" && last.player !== s.me && !s.rivers[last.player][last.index].declaration, "直前の他家の捨て牌を指定してください。");
    const river = s.rivers[last.player]; const tile = river.pop()!;
    declare(s, last.player); tile.declaration = true; river.push(tile); return s;
  }
  if (action.type === "CALL") {
    const last = s.last; const p = action.player;
    requireThat(last?.kind === "discard" && playerValid(p) && p !== last.player && !s.riichi[p] && s.melds[p].length < 4, "この鳴きはできません。");
    requireThat(action.kind !== "CHI" || p === (last.player + 1) % 4, "チーは上家の捨て牌だけです。");
    const all = [...action.consume, last.tile].sort((a, b) => a.i - b.i);
    requireThat(action.consume.length === (action.kind === "KAN" ? 3 : 2) && all.every(validTile), "公開する牌を選択してください。");
    requireThat(action.kind === "CHI" ? all[0].i < 27 && Math.floor(all[0].i / 9) === Math.floor(all[2].i / 9) && all[1].i === all[0].i + 1 && all[2].i === all[0].i + 2 : all.every((t) => t.i === last.tile.i), "面子の組み合わせが正しくありません。");
    if (action.kind === "KAN") requireThat(s.melds.flat().filter((m) => ["KAN", "ANKAN", "ADD"].includes(m.type)).length < 4, "カンは4回までです。");
    if (p === s.me) requireThat(callOptions(s, action.kind).some((o) => o.length === action.consume.length && o.every((t, i) => same(t, action.consume[i]))), "手牌と喰い替え制限を確認してください。");
    else requireThat(canExpose(s, action.consume), "公開牌が4枚を超えるか、赤五が重複しています。");
    finishResponse(s); if (p === s.me) removeHand(s, action.consume);
    s.rivers[last.player][last.index].called = true;
    s.melds[p].push({ type: action.kind, base: all[0].i, tiles: all.map((t) => t.i), redFlags: all.map((t) => t.red), consumed: action.consume, from: last.player });
    interrupt(s); s.turn = p; s.drawn = null; s.afterCall = action.kind !== "KAN";
    s.rinshanFor = action.kind === "KAN" ? p : null;
    s.kuikae = kuikaeTiles(action.kind, last.tile.i, all.map((t) => t.i));
    s.phase = p === s.me ? action.kind === "KAN" ? "draw" : "discard" : "other";
    say(s, `${WINDS[p]}家が${WINDS[last.player]}家から${MELD_LABELS[action.kind]}`); return s;
  }
  if (action.type === "KAN") {
    const p = action.player;
    requireThat(p === s.turn && ((p === s.me && s.phase === "discard" && !!s.drawn) || (p !== s.me && s.phase === "other" && !s.afterCall)), "自分の手番でカンを記録してください。");
    requireThat(s.melds.flat().filter((m) => ["KAN", "ANKAN", "ADD"].includes(m.type)).length < 4, "カンは4回までです。");
    if (action.kind === "ANKAN") requireThat(s.melds[p].length < 4, "面子は4つまでです。");
    const tiles = action.tiles;
    requireThat(tiles.length === (action.kind === "ANKAN" ? 4 : 1) && tiles.every(validTile) && tiles.every((t) => t.i === tiles[0].i), "カンする牌を確認してください。");
    if (p === s.me) requireThat(selfKanOptions(s).some((o) => o.kind === action.kind && JSON.stringify(o.tiles) === JSON.stringify(tiles)), "このカンはできません。");
    else requireThat(canExpose(s, tiles) && (!s.riichi[p] || action.kind === "ANKAN"), "公開牌またはリーチ後の制限を確認してください。");
    const index = s.melds[p].findIndex((m) => m.type === "PON" && m.base === tiles[0].i);
    if (action.kind === "ADD") requireThat(index >= 0, "同じ牌のポンが必要です。");
    finishResponse(s); if (p === s.me) removeHand(s, tiles);
    if (action.kind === "ANKAN") interrupt(s);
    if (action.kind === "ADD") {
      const meld = s.melds[p][index]; meld.type = "ADD"; meld.tiles.push(tiles[0].i); meld.redFlags.push(tiles[0].red); meld.consumed.push(tiles[0]);
      s.last = { kind: "kan", player: p, index, tile: tiles[0] };
    } else s.melds[p].push({ type: "ANKAN", base: tiles[0].i, tiles: tiles.map((t) => t.i), redFlags: tiles.map((t) => t.red), consumed: tiles, from: null });
    s.drawn = null; s.rinshanFor = p; s.afterCall = false; s.phase = p === s.me ? "draw" : "other";
    say(s, `${WINDS[p]}家が${MELD_LABELS[action.kind]}${action.kind === "ADD" ? "を宣言" : ""}`); return s;
  }
  if (action.type === "WIN") {
    // 宣言牌へのロンでは、未成立のリーチ棒を徴収しない。
    if (action.method === "tsumo") finishResponse(s);
    const result = winSettlement(s, action.method, action.winners, action.extra);
    if (action.method === "ron" && s.last?.kind === "kan") {
      const meld = s.melds[s.last.player][s.last.index];
      meld.type = "PON"; meld.tiles.pop(); meld.redFlags.pop(); meld.consumed.pop();
    }
    s.result = result; s.scores = s.scores.map((n, p) => n + result.delta[p]); s.sticks = 0; s.pendingRiichi = null; s.phase = "result"; say(s, result.title); return s;
  }
  if (action.type === "DRAW_END") {
    requireThat(action.tenpai.every(playerValid) && new Set(action.tenpai).size === action.tenpai.length, "テンパイ者を確認してください。");
    finishResponse(s);
    const delta = [0, 0, 0, 0]; const n = action.tenpai.length;
    if (!action.abortive && n > 0 && n < 4) for (let p = 0; p < 4; p++) delta[p] = action.tenpai.includes(p) ? 3000 / n : -3000 / (4 - n);
    s.result = { title: action.abortive ? "途中流局" : "流局", before: s.scores.slice(), delta, details: [action.abortive ? "ノーテン罰符なし・親は継続" : `テンパイ：${action.tenpai.map((p) => `${WINDS[p]}家`).join("・") || "なし"}`, `供託${s.sticks}本は持ち越し`], dealerContinues: !!action.abortive || action.tenpai.includes(0), nextHonba: s.honba + 1, winners: [] };
    s.scores = s.scores.map((v, p) => v + delta[p]); s.phase = "result"; say(s, s.result.title); return s;
  }
  return s;
}
export function playReducer(state: PlayState, action: PlayAction): PlayState {
  if (action.type === "UNDO") {
    const prev = state.history.at(-1);
    return prev ? { ...structuredClone(prev), history: state.history.slice(0, -1), error: null } : state;
  }
  try {
    const next = apply(structuredClone(snapshot(state)), action);
    return { ...next, history: [...state.history.slice(-99), snapshot(state)], error: null };
  } catch (error) { return { ...state, error: error instanceof Error ? error.message : "操作を確認してください。" }; }
}

export function restorePlay(text: string | null): PlayState {
  if (!text) return initialPlay();
  const parsed = JSON.parse(text) as PlayState;
  const valid = (s: PlaySnapshot) => s?.version === 1 && playerValid(s.me) && playerValid(s.turn) && playerValid(s.round)
    && ["setup", "draw", "discard", "other", "result"].includes(s.phase)
    && Array.isArray(s.hand) && s.hand.every(validTile) && s.hand.length <= 14
    && Array.isArray(s.scores) && s.scores.length === 4 && s.scores.every(Number.isFinite)
    && Array.isArray(s.melds) && s.melds.length === 4 && s.melds.every((ms) => Array.isArray(ms) && ms.length <= 4 && ms.every((m) => m && Object.hasOwn(MELD_LABELS, m.type) && (m.from === null || playerValid(m.from)) && Array.isArray(m.tiles) && m.tiles.every((i) => validTile({ i, red: false })) && Array.isArray(m.redFlags) && m.redFlags.length === m.tiles.length && m.redFlags.every((v) => typeof v === "boolean") && Array.isArray(m.consumed) && m.consumed.every(validTile)))
    && Array.isArray(s.rivers) && s.rivers.length === 4 && s.rivers.every((r) => Array.isArray(r) && r.every((t) => validTile(t) && typeof t.called === "boolean" && typeof t.declaration === "boolean"))
    && [s.riichi, s.doubleRiichi, s.ippatsu].every((a) => Array.isArray(a) && a.length === 4 && a.every((v) => typeof v === "boolean"))
    && [s.dora, s.ura, s.kuikae].every((a) => Array.isArray(a) && a.every((i) => validTile({ i, red: false })))
    && Array.isArray(s.log) && s.log.every((v) => typeof v === "string")
    && [s.interrupted, s.afterCall, s.temporaryFuriten, s.riichiFuriten, s.kiriage, s.doubleYakuman].every((v) => typeof v === "boolean")
    && (s.pendingRiichi === null || playerValid(s.pendingRiichi)) && (s.rinshanFor === null || playerValid(s.rinshanFor))
    && (s.drawn === null || validTile(s.drawn))
    && (s.last === null || (s.last && playerValid(s.last.player) && validTile(s.last.tile) && Number.isInteger(s.last.index) && s.last.index >= 0 && (s.last.kind === "discard" ? !!s.rivers[s.last.player][s.last.index] : s.last.kind === "kan" && !!s.melds[s.last.player][s.last.index])))
    && (s.result === null ? s.phase !== "result" : s.result && typeof s.result.title === "string" && Array.isArray(s.result.details) && s.result.details.every((v) => typeof v === "string") && [s.result.before, s.result.delta].every((a) => Array.isArray(a) && a.length === 4 && a.every(Number.isFinite)) && Array.isArray(s.result.winners) && s.result.winners.every(playerValid) && typeof s.result.dealerContinues === "boolean")
    && Number.isInteger(s.honba) && s.honba >= 0 && Number.isInteger(s.sticks) && s.sticks >= 0 && Number.isInteger(s.kyoku) && s.kyoku >= 1 && s.kyoku <= 4;
  requireThat(valid(parsed) && Array.isArray(parsed.history) && parsed.history.every(valid), "保存された対局データを読み込めませんでした。");
  return { ...parsed, history: parsed.history.slice(-100), error: null };
}
