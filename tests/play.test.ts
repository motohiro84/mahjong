import test from "node:test";
import assert from "node:assert/strict";
import { analysisState, callOptions, canExpose, canOwnRon, initialPlay, ownScore, physicalTiles, playReducer, restorePlay, selfKanOptions, validScoreInput, winSettlement } from "../lib/play";
import type { PlayState, PlayAction } from "../lib/play";
import { visibleCount } from "../lib/tiles";
const tile = (i: number, red = false) => ({ i, red });
const baseHand = [0, 1, 2, 9, 10, 11, 18, 19, 20, 4, 5, 31, 31];
function seed(hand = baseHand, me = 2): PlayState { return { ...initialPlay(), hand: hand.map((i) => tile(i)), me }; }
function step(s: PlayState, a: PlayAction) { const next = playReducer(s, a); assert.equal(next.error, null, JSON.stringify(a)); return next; }
function start(hand = baseHand, me = 2) { return step(seed(hand, me), { type: "START" }); }
function put(s: PlayState, i: number, riichi = false) { return step(s, { type: "TILE", tile: tile(i), riichi }); }

test("西家の開始は東→南→自分のツモ→打牌→北と進む", () => {
  let s = start(); assert.equal(s.turn, 0); assert.equal(s.phase, "other");
  s = put(s, 27); assert.equal(s.turn, 1); assert.equal(s.last?.player, 0);
  s = put(s, 28); assert.equal(s.turn, 2); assert.equal(s.phase, "draw");
  s = put(s, 29); assert.equal(s.phase, "discard"); assert.equal(s.hand.length, 14); assert.equal(s.last, null);
  s = put(s, 29); assert.equal(s.turn, 3); assert.equal(s.phase, "other");
  assert.equal(s.rivers[2].length, 1);
});

test("親は14枚目から開始し、配牌は13枚を要求する", () => {
  assert.equal(start(baseHand, 0).phase, "draw");
  assert.ok(playReducer(initialPlay(), { type: "START" }).error);
});

test("自分のポンは南家を飛ばし自分の打牌→北家に進む", () => {
  let s = put(start(), 31);
  const consume = callOptions(s, "PON")[0]; assert.ok(consume);
  s = step(s, { type: "CALL", player: 2, kind: "PON", consume });
  assert.equal(s.turn, 2); assert.equal(s.phase, "discard"); assert.equal(s.hand.length, 11);
  assert.equal(s.rivers[0][0].called, true);
  assert.equal(physicalTiles(s).filter((t) => t.i === 31).length, 3);
  assert.equal(visibleCount(analysisState(s), 31), 3);
  s = put(s, 0); assert.equal(s.turn, 3);
});

test("チーは上家のみ、喰い替えだけが残る鳴きは許可しない", () => {
  let s = put(start(), 3);
  assert.equal(callOptions(s, "CHI").length, 0);
  s = put(s, 3);
  assert.ok(callOptions(s, "CHI").length);
  s = step(s, { type: "CALL", player: 2, kind: "CHI", consume: callOptions(s, "CHI")[0] });
  assert.ok(s.kuikae.includes(3));
  const invalid = playReducer(s, { type: "TILE", tile: tile(3) }); assert.ok(invalid.error);
});

test("他家同士のポンで自分の手番が飛ばされ、履歴で全体を戻せる", () => {
  let s = put(start(), 29); const before = s;
  s = step(s, { type: "CALL", player: 3, kind: "PON", consume: [tile(29), tile(29)] });
  assert.equal(s.turn, 3); assert.equal(s.afterCall, true);
  assert.equal(s.melds[3].length, 1); assert.equal(s.rivers[0][0].called, true);
  const undone = step(s, { type: "UNDO" });
  assert.deepEqual(undone.hand, before.hand); assert.deepEqual(undone.rivers, before.rivers);
  assert.equal(undone.turn, 1); assert.equal(undone.melds[3].length, 0);
  s = put(s, 30); assert.equal(s.turn, 0);
});

test("自分の捨て牌が他家に鳴かれてもフリテン用の牌と見える枚数を維持する", () => {
  let s = start(baseHand, 0); s = put(s, 29); s = put(s, 29);
  s = step(s, { type: "CALL", player: 2, kind: "PON", consume: [tile(29), tile(29)] });
  assert.equal(analysisState(s).discards.some((t) => t.i === 29), true);
  assert.equal(visibleCount(analysisState(s), 29), 3);
});

test("最後の1枚を捨てられた場合でも、その牌でロンできる", () => {
  const hand = [0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 6];
  let s = start(hand); s.dora = [6, 6];
  s = put(s, 6);
  assert.equal(physicalTiles(s).filter((t) => t.i === 6).length, 4);
  assert.equal(canOwnRon(s), true);
});

test("次の入力で見逃しフリテンを確定し、自分のツモで解除する", () => {
  let s = put(start(), 3); assert.equal(canOwnRon(s), true); assert.equal(s.temporaryFuriten, false);
  s = put(s, 6); assert.equal(s.temporaryFuriten, true); assert.equal(canOwnRon(s), false);
  const undone = step(s, { type: "UNDO" }); assert.equal(canOwnRon(undone), true);
  s = put(s, 28); assert.equal(s.temporaryFuriten, false);
});

test("リーチ後の見逃しはツモ後も解除されない", () => {
  let s = start(); s.riichi[2] = true;
  s = put(s, 3); s = put(s, 6); assert.equal(s.riichiFuriten, true);
  s = put(s, 28); assert.equal(s.riichiFuriten, true);
  const invalid = playReducer(s, { type: "TILE", tile: tile(0) }); assert.ok(invalid.error);
  s = put(s, 28); assert.equal(s.hand.some((t) => t.i === 28), false);
});

test("リーチ棒は宣言直後に徴収せず次の入力で成立する", () => {
  let s = put(start(), 27, true);
  assert.equal(s.pendingRiichi, 0); assert.equal(s.sticks, 0); assert.equal(s.scores[0], 25000);
  s = put(s, 28); assert.equal(s.pendingRiichi, null); assert.equal(s.sticks, 1); assert.equal(s.scores[0], 24000);
  const restored = restorePlay(JSON.stringify(s));
  const undone = step(restored, { type: "UNDO" }); assert.equal(undone.pendingRiichi, 0); assert.equal(undone.scores[0], 25000);
});

test("直前の他家の牌にリーチを追加でき、宣言牌ロンなら供託しない", () => {
  let s = put(start(), 27); s = step(s, { type: "LATE_RIICHI" });
  assert.equal(s.rivers[0][0].declaration, true);
  s = step(s, { type: "WIN", method: "ron", winners: [{ player: 1, han: 3, fu: 40, yakuman: 0 }] });
  assert.equal(s.scores[0], 19800); assert.equal(s.scores[1], 30200); assert.equal(s.sticks, 0);
  assert.equal(s.scores.reduce((a, b) => a + b), 100000);
});

test("リーチ宣言牌を鳴いた場合は供託が成立し一発だけ消える", () => {
  let s = put(start(), 31, true);
  s = step(s, { type: "CALL", player: 2, kind: "PON", consume: callOptions(s, "PON")[0] });
  assert.equal(s.scores[0], 24000); assert.equal(s.sticks, 1); assert.equal(s.ippatsu[0], false); assert.equal(s.doubleRiichi[0], true);
});

test("明槓は嶺上牌入力を挟み、暗槓・加槓も手番を維持する", () => {
  const hand = [0, 1, 2, 9, 10, 11, 18, 19, 31, 31, 31, 4, 5];
  let s = put(start(hand), 31);
  s = step(s, { type: "CALL", player: 2, kind: "KAN", consume: callOptions(s, "KAN")[0] });
  assert.equal(s.phase, "draw"); assert.equal(s.rinshanFor, 2); assert.equal(s.hand.length, 10);
  s = put(s, 20); assert.equal(s.phase, "discard"); assert.equal(s.hand.length, 11); assert.ok(analysisState(s).situationalYaku.includes("rinshan"));
  s = put(s, 4); assert.equal(s.turn, 3); assert.equal(s.rinshanFor, null);
});

test("他家の暗槓を入力でき、加槓には既存のポンが必要", () => {
  let s = start();
  assert.ok(playReducer(s, { type: "KAN", player: 0, kind: "ADD", tiles: [tile(29)] }).error);
  s = step(s, { type: "KAN", player: 0, kind: "ANKAN", tiles: [tile(29), tile(29), tile(29), tile(29)] });
  assert.equal(s.turn, 0); assert.equal(s.rinshanFor, 0); assert.equal(s.phase, "other");
  assert.equal(canExpose(s, [tile(29)]), false);
});

test("自分の暗槓候補・通常五と赤五の重複を検証する", () => {
  let s = start([0, 0, 0, 9, 10, 11, 18, 19, 20, 4, 5, 31, 31], 0);
  s = put(s, 0); assert.equal(selfKanOptions(s).length, 1);
  s = step(s, { type: "KAN", player: 0, ...selfKanOptions(s)[0] }); assert.equal(s.phase, "draw");
  assert.equal(s.melds[0][0].type, "ANKAN");
  assert.equal(canExpose(s, [tile(4, true), tile(4, true)]), false);
});

test("3翻40符の子ツモに本場・供託を加算して持ち点へ反映", () => {
  const s = start(); s.turn = 1; s.honba = 2; s.sticks = 2;
  const r = winSettlement(s, "tsumo", [{ player: 1, han: 3, fu: 40, yakuman: 0 }]);
  assert.deepEqual(r.delta, [-2800, 7800, -1500, -1500]);
});

test("複数ロンは本場を各人へ、供託は放銃者から最も近い人へ", () => {
  let s = put(start(), 27); s.honba = 2; s.sticks = 2;
  s = step(s, { type: "WIN", method: "ron", winners: [{ player: 3, han: 3, fu: 40, yakuman: 0 }, { player: 1, han: 3, fu: 40, yakuman: 0 }] });
  assert.deepEqual(s.result?.delta, [-11600, 7800, 0, 5800]);
  assert.equal(s.sticks, 0); assert.equal(s.result?.dealerContinues, false);
});

test("不正な翻符と和了者を拒否し、二重精算できない", () => {
  assert.equal(validScoreInput({ player: 1, han: 1, fu: 20, yakuman: 0 }, "tsumo"), false);
  let s = put(start(), 27);
  assert.ok(playReducer(s, { type: "WIN", method: "ron", winners: [{ player: 0, han: 3, fu: 40, yakuman: 0 }] }).error);
  s = step(s, { type: "WIN", method: "ron", winners: [{ player: 1, han: 3, fu: 40, yakuman: 0 }] });
  const twice = playReducer(s, { type: "WIN", method: "ron", winners: [{ player: 1, han: 3, fu: 40, yakuman: 0 }] });
  assert.ok(twice.error); assert.deepEqual(twice.scores, s.scores);
});

test("流局のノーテン罰符、供託持越し、親の交代と席の回転", () => {
  let s = start(); s.honba = 2; s.sticks = 1; s.scores = [24000, 25000, 25000, 25000];
  s = step(s, { type: "DRAW_END", tenpai: [1, 2] });
  assert.deepEqual(s.result?.delta, [-1500, 1500, 1500, -1500]);
  assert.equal(s.result?.dealerContinues, false);
  s = step(s, { type: "NEXT" }); assert.equal(s.me, 1); assert.equal(s.kyoku, 2); assert.equal(s.honba, 3); assert.equal(s.sticks, 1);
  assert.deepEqual(s.scores, [26500, 26500, 23500, 22500]); assert.equal(s.hand.length, 0);
});

test("親テンパイと途中流局で連荘し、次局の判断を変更できる", () => {
  let s = step(start(), { type: "DRAW_END", tenpai: [0] });
  s = step(s, { type: "NEXT" }); assert.equal(s.me, 2); assert.equal(s.kyoku, 1); assert.equal(s.honba, 1);
  const aborted = step(start(), { type: "DRAW_END", tenpai: [], abortive: true });
  assert.deepEqual(aborted.result?.delta, [0, 0, 0, 0]); assert.equal(aborted.result?.dealerContinues, true);
  const changed = step(aborted, { type: "NEXT", dealerContinues: false }); assert.equal(changed.me, 1);
});

test("東4局の親交代で南1局になり、和了精算も取り消せる", () => {
  let s = start(); s.kyoku = 4; s = put(s, 27); const before = s;
  s = step(s, { type: "WIN", method: "ron", winners: [{ player: 1, han: 3, fu: 40, yakuman: 0 }] });
  const undone = step(s, { type: "UNDO" }); assert.deepEqual(undone.scores, before.scores); assert.deepEqual(undone.last, before.last);
  s = step(s, { type: "NEXT" }); assert.equal(s.round, 1); assert.equal(s.kyoku, 1);
});

test("保存復元で進行・履歴・未成立リーチを維持し、壊れたデータを拒否", () => {
  const s = put(start(), 27, true);
  assert.deepEqual(restorePlay(JSON.stringify(s)), s);
  assert.throws(() => restorePlay('{"version":1}'));
  assert.equal(restorePlay(null).phase, "setup");
});

test("自分の和了は既存の役判定を利用し、鳴きが入ると地和にならない", () => {
  let s = start(); s = put(s, 27); s = put(s, 28); s = put(s, 6);
  assert.ok(ownScore(s, "tsumo")?.yaku?.some((y) => y.nm === "地和"));
  s.interrupted = true;
  assert.ok(!ownScore(s, "tsumo")?.yaku?.some((y) => y.nm === "地和"));
  assert.ok(ownScore(s, "tsumo")?.score);
});

test("リーチ宣言直後の他家ツモでもプレビューと精算が一致する", () => {
  const s = put(start(), 27, true);
  const winners = [{ player: 1, han: 3, fu: 40, yakuman: 0 }];
  const preview = winSettlement(s, "tsumo", winners);
  const settled = step(s, { type: "WIN", method: "tsumo", winners });
  assert.deepEqual(settled.result, preview);
  assert.equal(settled.scores[1], 31200);
  assert.equal(settled.scores.reduce((a, b) => a + b), 100000);
});

test("他家のポン直後の喰い替えも拒否する", () => {
  let s = put(start(), 29);
  s = step(s, { type: "CALL", player: 3, kind: "PON", consume: [tile(29), tile(29)] });
  assert.ok(playReducer(s, { type: "TILE", tile: tile(29) }).error);
});

test("リーチ後の暗槓は待ちが変わらない場合のみ候補になる", () => {
  let s = start([0, 0, 0, 9, 10, 11, 18, 19, 20, 4, 5, 31, 31], 0);
  s.riichi[0] = true; s = put(s, 0);
  assert.equal(selfKanOptions(s).length, 1);
  let changed = start([0, 0, 0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31], 0);
  changed.riichi[0] = true; changed = put(changed, 0);
  assert.equal(selfKanOptions(changed).length, 0);
});

test("河底のみで成立するロンを状況指定から計算できる", () => {
  let s = start([0, 1, 2, 3, 4, 5, 15, 16, 17, 21, 23, 27, 27]);
  s = put(s, 22);
  assert.equal(ownScore(s, "ron")?.noYaku, true);
  assert.ok(ownScore(s, "ron", ["houtei"])?.score);
  s = step(s, { type: "WIN", method: "ron", winners: [{ player: 2, han: 0, fu: 0, yakuman: 0 }], extra: ["houtei"] });
  assert.equal(s.phase, "result");
});

test("ネストした保存データが壊れても不正な状態を復元しない", () => {
  const s = start();
  assert.throws(() => restorePlay(JSON.stringify({ ...s, last: { player: 9, tile: tile(0), index: 0, kind: "discard" } })));
  assert.throws(() => restorePlay(JSON.stringify({ ...s, phase: "result", result: {} })));
});

test("テンパイ前の有効牌を見送ってもフリテンにならない", () => {
  let s = start([0, 1, 3, 4, 9, 10, 12, 13, 18, 19, 21, 22, 27]);
  s = put(s, 2); s = put(s, 28);
  assert.equal(s.temporaryFuriten, false);
  assert.equal(s.riichiFuriten, false);
});

test("加槓への槍槓は一発を維持し、不成立の加槓をポンに戻す", () => {
  let s = start(); s.riichi[2] = true; s.ippatsu[2] = true;
  s.melds[0] = [{ type: "PON", base: 6, tiles: [6, 6, 6], redFlags: [false, false, false], consumed: [tile(6), tile(6)], from: 1 }];
  s.rivers[1] = [{ ...tile(6), called: true, declaration: false }];
  s = step(s, { type: "KAN", player: 0, kind: "ADD", tiles: [tile(6)] });
  assert.ok(ownScore(s, "ron")?.yaku?.some((y) => y.nm === "一発"));
  assert.ok(ownScore(s, "ron")?.yaku?.some((y) => y.nm === "槍槓"));
  const settled = step(s, { type: "WIN", method: "ron", winners: [{ player: 2, han: 0, fu: 0, yakuman: 0 }] });
  assert.equal(settled.melds[0][0].type, "PON");
  const passed = put(s, 29); assert.equal(passed.ippatsu[2], false); assert.equal(passed.riichiFuriten, true);
});
