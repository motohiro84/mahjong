import test from "node:test";
import assert from "node:assert/strict";
import type { AppState } from "../lib/types";
import { bestScore, scorePreview } from "../lib/scoring";
import { yakuGuides } from "../lib/yaku-guide";
import { buildMeld, isPermanentFuriten, noYakuWarning } from "../lib/analysis";
import { countsOf, handSize, visibleCount } from "../lib/tiles";
import { shanten, ukeire } from "../lib/shanten";
import { appReducer } from "../components/app-provider";

function state(hand: number[]): AppState {
  return {
    hand: hand.map((i) => ({ i, red: false })),
    melds: [], dora: [], uraDora: [], discards: [], otherDiscards: [], kuikae: [], riichi: false,
    winTile: hand.at(-1) ?? null, round: 0, seat: 1, agariType: "tsumo",
    situationalYaku: [], honba: 0, kyotaku: 0, kiriageMangan: false, doubleYakuman: false,
    tab: "input", yakuSort: "near", history: [], hydrated: true,
  };
}

test("画像の副露あり一気通貫が成立役と狙い目の両方に出る", () => {
  const current = state([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9]);
  current.seat = 0;
  current.winTile = 4;
  current.melds = [{ type: "CHI", base: 10, tiles: [10, 11, 12], redFlags: [false, false, false], consumed: [{ i: 10, red: false }, { i: 11, red: false }] }];
  assert.ok(bestScore(current)?.yaku?.some((yaku) => yaku.nm === "一気通貫"));
  assert.ok(yakuGuides(current).some((guide) => guide.name === "一気通貫" && guide.distance === -1));
});

test("白の刻子は役牌として和了できる", () => {
  const current = state([0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 18, 31, 31, 31]);
  current.winTile = 31;
  current.agariType = "ron";
  const score = bestScore(current);
  assert.ok(score && !score.noYaku);
  assert.ok(score?.yaku?.some((yaku) => yaku.nm === "役牌 白"));
});

test("13枚の一気通貫待ちはテンパイとして案内される", () => {
  const current = state([0, 1, 2, 3, 4, 5, 6, 7, 31, 31, 31, 27, 27]);
  current.winTile = null;
  assert.equal(shanten(countsOf(current.hand), current.melds), 0);
  assert.equal(yakuGuides(current).find((guide) => guide.name === "一気通貫")?.distance, 0);
});

test("三萬を鳴いて作った一二三萬を順子の開始位置で採点する", () => {
  const beforeCall = state([0, 1, 9, 10, 11, 18, 19, 20, 6, 7, 8, 31, 31]);
  const option = { tiles: [0, 1, 2], use: [0, 1] };
  const built = buildMeld(beforeCall, "CHI", 2, option);
  assert.equal(built.meld.base, 0);

  const current = state([9, 10, 11, 18, 19, 20, 6, 7, 8, 31, 31]);
  current.melds = [built.meld];
  current.winTile = 31;
  current.agariType = "ron";
  const score = bestScore(current);
  assert.ok(score && !score.noYaku);
  assert.ok(score?.yaku?.some((yaku) => yaku.nm === "三色同順"));
  assert.ok(score?.yaku?.some((yaku) => yaku.nm === "混全帯幺九"));
});

test("赤五でロンした場合は赤ドラ1翻を加算する", () => {
  const current = state([2, 3, 10, 11, 12, 11, 12, 13, 21, 22, 23, 23, 23]);
  current.winTile = null;
  const normal = scorePreview(current, 4, "ron", false);
  const red = scorePreview(current, 4, "ron", true);
  assert.equal(normal?.score?.total, 2000);
  assert.equal(red?.score?.total, 3900);
  assert.equal(red?.dora, 1);
});

test("嶺上牌入力後に暗槓を直接取り消して15枚にはできない", () => {
  const current = state([0, 1, 2, 3, 4, 5, 6, 7, 8, 28, 31]);
  current.melds = [{
    type: "ANKAN", base: 27, tiles: [27, 27, 27, 27], redFlags: [false, false, false, false],
    consumed: [27, 27, 27, 27].map((i) => ({ i, red: false })),
  }];
  assert.equal(handSize(current), 14);
  const next = appReducer(current, { type: "REMOVE_MELD", meldIndex: 0 });
  assert.equal(next, current);
  assert.equal(handSize(next), 14);
});

test("ツモだけ可能なテンパイはロンに役が必要だと案内する", () => {
  const current = state([0, 1, 2, 3, 4, 5, 15, 16, 17, 21, 23, 27, 27]);
  current.winTile = null;
  assert.equal(shanten(countsOf(current.hand), current.melds), 0);
  assert.equal(noYakuWarning(current), "ツモなら上がれます。ロンするにはリーチなどの役が必要です。");
});

test("画像の加槓あり和了は二筒・五筒の両面待ちとして30符4000点になる", () => {
  const current = state([2, 3, 4, 10, 11, 12, 13, 13, 19, 20, 21]);
  current.hand[2].red = true;
  current.melds = [{
    type: "ADD", base: 14, tiles: [14, 14, 14, 14], redFlags: [false, false, false, false],
    consumed: [14, 14, 14, 14].map((i) => ({ i, red: false })),
  }];
  current.dora = [1, 27];
  current.winTile = 10;
  const score = bestScore(current);
  assert.equal(score?.wait, "ryanmen");
  assert.equal(score?.han, 3);
  assert.equal(score?.fu, 30);
  assert.equal(score?.score?.total, 4000);
  assert.equal(score?.omoteDora, 1);
  assert.equal(score?.akaDora, 1);
});

test("裏ドラはリーチ時だけ表ドラ表示牌の枚数まで加算する", () => {
  const current = state([1, 2, 3, 10, 11, 12, 19, 20, 21, 23, 24, 25, 13, 13]);
  current.riichi = true;
  current.dora = [27];
  current.uraDora = [0];
  current.winTile = 1;
  const score = bestScore(current);
  assert.equal(score?.uraDora, 1);

  current.riichi = false;
  assert.equal(bestScore(current)?.uraDora, 0);

  current.riichi = true;
  const capped = appReducer(current, { type: "ADD_URA_DORA", tile: 0 });
  assert.equal(capped.uraDora.length, 1);
});

test("他家の捨て牌は有効牌の残り枚数を減らすがフリテンにはしない", () => {
  const current = state([0, 1, 2, 3, 4, 5, 15, 16, 17, 21, 23, 27, 27]);
  current.winTile = null;
  const before = ukeire(countsOf(current.hand), current.melds, (i) => Math.max(0, 4 - visibleCount(current, i)));
  assert.ok(before.tiles.some(({ i }) => i === 22));
  const next = appReducer(current, { type: "ADD_OTHER_DISCARD", tile: 22 });
  const after = ukeire(countsOf(next.hand), next.melds, (i) => Math.max(0, 4 - visibleCount(next, i)));
  assert.equal(after.tiles.find(({ i }) => i === 22)?.left, before.tiles.find(({ i }) => i === 22)!.left - 1);
  assert.equal(isPermanentFuriten(next), false);
});

test("最初の打牌でリーチするとダブル立直と一発を自動選択し、次の打牌で一発だけ消える", () => {
  const current = state([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 27, 27]);
  const declared = appReducer(current, { type: "DISCARD", tile: current.hand[11], riichi: true });
  assert.deepEqual(new Set(declared.situationalYaku), new Set(["ippatsu", "doubleRiichi"]));
  const drawn = appReducer(declared, { type: "ADD_TILE", tile: { i: 12, red: false } });
  const nextTurn = appReducer(drawn, { type: "DISCARD", tile: { i: 12, red: false } });
  assert.equal(nextTurn.situationalYaku.includes("ippatsu"), false);
  assert.equal(nextTurn.situationalYaku.includes("doubleRiichi"), true);
});

test("配牌後の最初のツモは席に応じて天和または地和を自動選択する", () => {
  const child = state([0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27]);
  child.winTile = null;
  const chiihou = appReducer(child, { type: "ADD_TILE", tile: { i: 27, red: false } });
  assert.equal(chiihou.situationalYaku.includes("chiihou"), true);
  const tenhou = appReducer(chiihou, { type: "SET_SEAT", seat: 0 });
  assert.equal(tenhou.situationalYaku.includes("chiihou"), false);
  assert.equal(tenhou.situationalYaku.includes("tenhou"), true);
});

test("一発・海底などの状況役を翻数へ加算する", () => {
  const current = state([1, 2, 3, 10, 11, 12, 19, 20, 21, 23, 24, 25, 13, 13]);
  current.riichi = true;
  current.situationalYaku = ["doubleRiichi", "ippatsu", "haitei"];
  const score = bestScore(current);
  assert.ok(score?.yaku?.some((yaku) => yaku.nm === "ダブル立直" && yaku.han === 2));
  assert.ok(score?.yaku?.some((yaku) => yaku.nm === "一発"));
  assert.ok(score?.yaku?.some((yaku) => yaku.nm === "海底摸月"));
});

test("本場と供託を受取合計と支払い表示へ加算する", () => {
  const current = state([2, 3, 4, 10, 11, 12, 13, 13, 19, 20, 21]);
  current.hand[2].red = true;
  current.melds = [{
    type: "ADD", base: 14, tiles: [14, 14, 14, 14], redFlags: [false, false, false, false],
    consumed: [14, 14, 14, 14].map((i) => ({ i, red: false })),
  }];
  current.dora = [1, 27];
  current.winTile = 10;
  current.honba = 1;
  current.kyotaku = 2;
  const score = bestScore(current);
  assert.equal(score?.score?.total, 6300);
  assert.ok(score?.score?.payments.some((payment) => payment.label === "供託 2本"));
});

test("切り上げ満貫を30符4翻へ適用する", () => {
  const current = state([2, 3, 4, 10, 11, 12, 13, 13, 19, 20, 21]);
  current.hand[2].red = true;
  current.melds = [{
    type: "ADD", base: 14, tiles: [14, 14, 14, 14], redFlags: [false, false, false, false],
    consumed: [14, 14, 14, 14].map((i) => ({ i, red: false })),
  }];
  current.dora = [1, 2, 27];
  current.winTile = 10;
  assert.equal(bestScore(current)?.score?.total, 7900);
  current.kiriageMangan = true;
  assert.equal(bestScore(current)?.score?.total, 8000);
  assert.equal(bestScore(current)?.score?.limit, "満貫（切り上げ）");
});

test("ダブル役満採用時は大四喜を2倍役満として扱う", () => {
  const current = state([28, 28, 28, 29, 29, 29, 30, 30, 30, 31, 31]);
  current.melds = [{
    type: "PON", base: 27, tiles: [27, 27, 27], redFlags: [false, false, false],
    consumed: [27, 27].map((i) => ({ i, red: false })),
  }];
  current.winTile = 31;
  current.agariType = "ron";
  assert.equal(bestScore(current)?.yakuman, 2);
  assert.equal(bestScore(current)?.yaku?.find((yaku) => yaku.nm === "大四喜")?.yakuman, 1);
  current.doubleYakuman = true;
  assert.equal(bestScore(current)?.yakuman, 3);
  assert.equal(bestScore(current)?.yaku?.find((yaku) => yaku.nm === "大四喜")?.yakuman, 2);
  assert.equal(bestScore(current)?.score?.limit, "3倍役満");
});
