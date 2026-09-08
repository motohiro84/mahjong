"use client";

import { useMemo, useState } from "react";
import { AppShell } from "./app-shell";
import { MahjongTile } from "./mahjong-tile";
import { useAppState } from "./app-provider";
import type { ChiOption } from "@/lib/analysis";
import type { MeldType, SituationalYaku, Tile } from "@/lib/types";
import {
  buildMeld,
  chiOptions,
  discardCandidates,
  isPermanentFuriten,
  kuikaeTiles,
  meldCandidates,
  noYakuWarning,
  riichiCandidates,
  ronCandidates,
} from "@/lib/analysis";
import { bestScore, scorePreview } from "@/lib/scoring";
import { shanten, ukeire } from "@/lib/shanten";
import { canAddTile, canDiscardTile, redAlreadyUsed as hasRedTile, countsOf, doraCount, handSize, HONORS, indicatorToDora, isOpen, RED_FIVES, tileName, visibleCount } from "@/lib/tiles";
import { yakuGuides } from "@/lib/yaku-guide";

type ActionMode = "RON" | "RIICHI" | MeldType;

const ACTION_LABELS: Record<ActionMode, string> = {
  RON: "ロン", RIICHI: "リーチして打牌", PON: "ポン", CHI: "チー", KAN: "明槓", ANKAN: "暗槓", ADD: "加槓",
};

const WAIT_LABELS: Record<string, string> = {
  tanki: "単騎待ち", shanpon: "シャンポン待ち", ryanmen: "両面待ち", kanchan: "嵌張待ち", penchan: "辺張待ち", special: "特殊形",
};

function TileGrid({ onPick, disabled, redMode = false }: { onPick: (i: number, red: boolean) => void; disabled?: (i: number) => boolean; redMode?: boolean }) {
  return <div className="tile-grid">{[[0, 9], [9, 18], [18, 27], [27, 34]].map(([start, end]) => <div className="tile-grid-row" key={start}>{Array.from({ length: end - start }, (_, offset) => {
    const i = start + offset;
    const red = redMode && RED_FIVES.includes(i);
    return <MahjongTile key={i} i={i} red={red} disabled={disabled?.(i)} onClick={() => onPick(i, red)} />;
  })}</div>)}</div>;
}

function SampleTiles({ tiles }: { tiles: number[] }) {
  return <div className="sample-tiles">{tiles.map((tile, index) => <MahjongTile key={`${tile}-${index}`} i={tile} tiny />)}</div>;
}

export function AnalysisPage() {
  const { state, dispatch } = useAppState();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [redMode, setRedMode] = useState(false);
  const [doraMode, setDoraMode] = useState(false);
  const [contextMode, setContextMode] = useState(false);
  const [mode, setMode] = useState<ActionMode | null>(null);
  const [chiChoice, setChiChoice] = useState<{ incoming: number; options: ChiOption[]; calledRed: boolean } | null>(null);
  const [redCall, setRedCall] = useState<{ type: "RON" | Exclude<MeldType, "ADD">; incoming: number; option?: ChiOption } | null>(null);

  const size = handSize(state);
  const counts = useMemo(() => countsOf(state.hand), [state.hand]);
  const currentShanten = size === 13 || size === 14 ? shanten(counts, state.melds) : null;
  const currentUkeire = size === 13 ? ukeire(counts, state.melds, (i) => Math.max(0, 4 - visibleCount(state, i))).total : null;
  const warning = noYakuWarning(state);
  const doraTiles = state.dora.map(indicatorToDora);
  const sortedHand = state.hand.slice().sort((a, b) => a.i - b.i || Number(b.red) - Number(a.red));

  if (!state.hydrated) return <div className="loading-screen">牌しるべを準備中…</div>;

  const meldCands = (type: MeldType) => meldCandidates(state, type);
  const candidatesFor = (type: ActionMode): number[] | ReturnType<typeof riichiCandidates> => {
    if (type === "RON") return ronCandidates(state);
    if (type === "RIICHI") return riichiCandidates(state);
    return meldCands(type);
  };

  const redAlreadyUsed = (i: number) => hasRedTile(state, i);

  const commitMeld = (type: Exclude<MeldType, "ADD">, incoming: number, option?: ChiOption, calledRed = false) => {
    const built = buildMeld(state, type, incoming, option, calledRed);
    dispatch({ type: "ADD_MELD", meld: built.meld, consume: built.consumed, kuikae: kuikaeTiles(type, incoming, built.meld.tiles) });
    setMode(null); setChiChoice(null); setRedCall(null);
  };

  const chooseTarget = (type: ActionMode, incoming: number, calledRedResolved = false, calledRed = false) => {
    if (type === "RON" && calledRedResolved) { dispatch({ type: "RON", tile: { i: incoming, red: calledRed } }); setMode(null); return; }
    if (type === "RIICHI") return;
    if (type === "ADD") {
      const meldIndex = state.melds.findIndex((meld) => meld.type === "PON" && meld.base === incoming);
      const tile = state.hand.find((item) => item.i === incoming && !item.red) || state.hand.find((item) => item.i === incoming);
      if (meldIndex >= 0 && tile) dispatch({ type: "UPGRADE_KAN", meldIndex, tile });
      setMode(null); return;
    }
    if (["RON", "PON", "CHI", "KAN"].includes(type) && RED_FIVES.includes(incoming) && !calledRedResolved) {
      setRedCall({ type, incoming }); setMode(type); return;
    }
    if (type === "RON") { dispatch({ type: "RON", tile: { i: incoming, red: false } }); setMode(null); return; }
    if (type === "CHI") {
      const options = chiOptions(incoming, counts);
      if (options.length > 1) { setChiChoice({ incoming, options, calledRed }); setMode(type); return; }
      if (options[0]) commitMeld(type, incoming, options[0], calledRed);
      return;
    }
    commitMeld(type, incoming, undefined, calledRed);
  };

  const startAction = (type: ActionMode) => {
    const candidates = candidatesFor(type);
    if (!candidates.length) return;
    if (candidates.length === 1) {
      if (type === "RIICHI") {
        const candidate = candidates[0] as ReturnType<typeof riichiCandidates>[number];
        dispatch({ type: "DISCARD", tile: candidate.tile, riichi: true });
      } else chooseTarget(type, candidates[0] as number);
      return;
    }
    setMode(type); setChiChoice(null); setRedCall(null);
  };

  const addTile = (i: number, red: boolean) => {
    if (visibleCount(state, i) >= 4 || (red && redAlreadyUsed(i))) return;
    dispatch({ type: "ADD_TILE", tile: { i, red } });
    setRedMode(false);
    setEditingIndex(null);
  };

  const discard = (tile: Tile, riichi = false) => {
    dispatch({ type: "DISCARD", tile, riichi });
    setMode(null);
  };

  const renderActionChoice = () => {
    if (!mode) return null;
    if (redCall) return <section className="choice-panel"><h2>相手が捨てた五を選択</h2><p>通常の五か赤ドラかを選びます。赤ドラなら1翻増えます。</p><div className="choice-tiles"><button onClick={() => { setRedCall(null); chooseTarget(redCall.type, redCall.incoming, true, false); }}><MahjongTile i={redCall.incoming} small /></button><button disabled={redAlreadyUsed(redCall.incoming)} onClick={() => { setRedCall(null); if (redAlreadyUsed(redCall.incoming)) return; chooseTarget(redCall.type, redCall.incoming, true, true); }}><MahjongTile i={redCall.incoming} red small /></button></div><button className="text-button" onClick={() => { setRedCall(null); setMode(null); }}>やめる</button></section>;
    if (chiChoice) return <section className="choice-panel"><h2>チーの完成形を選択</h2><div className="choice-tiles">{chiChoice.options.map((option, index) => <button key={index} onClick={() => commitMeld("CHI", chiChoice.incoming, option, chiChoice.calledRed)}>{option.tiles.map((tile, tileIndex) => <MahjongTile key={`${tile}-${tileIndex}`} i={tile} small />)}</button>)}</div><button className="text-button" onClick={() => { setChiChoice(null); setMode(null); }}>やめる</button></section>;
    if (mode === "RIICHI") return <section className="choice-panel"><h2>リーチして捨てる牌を選択</h2>{riichiCandidates(state).map((candidate, index) => <DiscardRow key={`${candidate.tile.i}-${candidate.tile.red}`} candidate={candidate} best={index === 0} onClick={() => discard(candidate.tile, true)} />)}<button className="text-button" onClick={() => setMode(null)}>やめる</button></section>;
    const candidates = candidatesFor(mode) as number[];
    return <section className="choice-panel"><h2>{mode === "CHI" ? "相手が捨てた牌" : `${ACTION_LABELS[mode]}する牌`}を選択</h2><div className="choice-tiles">{candidates.map((i) => <button key={i} onClick={() => chooseTarget(mode, i)}><MahjongTile i={i} small /></button>)}</div><button className="text-button" onClick={() => setMode(null)}>やめる</button></section>;
  };

  const renderInput = () => {
    if (editingIndex !== null && size === 13 && !state.riichi && state.hand[editingIndex]) {
      const rest = { ...state, hand: state.hand.filter((_, index) => index !== editingIndex) };
      return <section className="workspace"><div className="workspace-title"><h2>{tileName(state.hand[editingIndex].i, state.hand[editingIndex].red)}を置き換える牌</h2><button onClick={() => setEditingIndex(null)}>やめる</button><button className={`red-five${redMode ? " active" : ""}`} aria-pressed={redMode} onClick={() => setRedMode((value) => !value)}>赤5</button></div><TileGrid redMode={redMode} disabled={(i) => !canAddTile(rest, { i, red: redMode && RED_FIVES.includes(i) })} onPick={(i, red) => { dispatch({ type: "REPLACE_TILE", index: editingIndex, tile: { i, red } }); setEditingIndex(null); setRedMode(false); }} /></section>;
    }
    if (doraMode) return <section className="workspace"><div className="workspace-title"><h2>ドラ表示牌を選択</h2><button className="text-button" onClick={() => setDoraMode(false)}>やめる</button></div><TileGrid onPick={(i) => { dispatch({ type: "ADD_DORA", tile: i }); setDoraMode(false); }} disabled={(i) => state.dora.length >= 5 || visibleCount(state, i) >= 4} /></section>;
    const choice = renderActionChoice();
    return <>
      {size === 13 && !state.riichi && <p className="note">入力を修正するには、上の手牌をタップしてください。</p>}
      <ActionRow size={size} state={state} candidatesFor={candidatesFor} startAction={startAction} />
      {choice || (size <= 13 ? <section className="workspace"><div className="workspace-title"><div><h2>{size < 13 ? `配牌を入力（あと${13 - size}枚）` : "ツモ牌を入力"}</h2><p>牌を1回タップ</p></div><button className={`red-five${redMode ? " active" : ""}`} aria-pressed={redMode} onClick={() => setRedMode((value) => !value)}>赤5</button></div><TileGrid onPick={addTile} redMode={redMode} disabled={(i) => visibleCount(state, i) >= 4 || (redMode && RED_FIVES.includes(i) && redAlreadyUsed(i))} /></section> : <DiscardPanel state={state} onDiscard={discard} />)}
    </>;
  };

  return <AppShell><main className="analysis-page">
    <header className="analysis-header">
      <div className="shanten-status" role="status" aria-live="polite"><b>{currentShanten === null ? "—" : currentShanten < 0 ? "和了" : currentShanten === 0 ? "聴牌" : currentShanten}</b><small>{currentShanten !== null && currentShanten > 0 ? "シャンテン" : currentShanten === null ? "配牌入力中" : ""}</small></div>
      <button className="context-button" onClick={() => setContextMode(true)} aria-label="場風と自風を設定"><span>{HONORS[state.round]}場</span><span>{HONORS[state.seat]}家</span></button>
      <div className="status-numbers"><span><small>有効牌</small><b>{currentUkeire === null ? "—" : `${currentUkeire}枚`}</b></span><span><small>ドラ</small><b>{doraCount(state)}</b></span><span className="wide-count"><small>構成</small><b>{size}</b></span><span className="wide-count"><small>実牌</small><b>{state.hand.length + state.melds.reduce((sum, meld) => sum + meld.tiles.length, 0)}</b></span><span className="narrow-count"><small>牌</small><b>{size}/{state.hand.length + state.melds.reduce((sum, meld) => sum + meld.tiles.length, 0)}</b></span></div>
      <div className="round-settings"><div className="dora-button"><span>ドラ表示</span>{state.dora.map((tile, index) => <MahjongTile key={`${tile}-${index}`} i={tile} small onClick={() => dispatch({ type: "REMOVE_DORA", index })} label={`${tileName(tile)}のドラ表示牌を削除`} />)}{state.dora.length < 5 && <button onClick={() => { setDoraMode(true); dispatch({ type: "SET_TAB", tab: "input" }); }} aria-label="ドラ表示牌を追加">＋</button>}</div></div>
    </header>
    {contextMode && <div className="context-overlay" role="dialog" aria-modal="true" aria-label="場風と自風の設定" onClick={() => setContextMode(false)}><section className="context-panel" onClick={(event) => event.stopPropagation()}><header><h2>場・自風を設定</h2><button onClick={() => setContextMode(false)}>閉じる</button></header><div><b>場風</b><span>{HONORS.slice(0, 2).map((honor, index) => <button key={honor} className={state.round === index ? "active" : ""} onClick={() => dispatch({ type: "SET_ROUND", round: index })}>{honor}場</button>)}</span></div><div><b>自風</b><span>{HONORS.slice(0, 4).map((honor, index) => <button key={honor} className={state.seat === index ? "active" : ""} onClick={() => dispatch({ type: "SET_SEAT", seat: index })}>{honor}家</button>)}</span></div></section></div>}
    {warning && <div className="hand-warning" role="alert">{warning}</div>}

    <section className="hand-area" aria-label="現在の手牌"><div className="hand-row">{sortedHand.length ? sortedHand.map((tile, index) => <MahjongTile key={`${tile.i}-${tile.red}-${index}`} i={tile.i} red={tile.red} dora={tile.red || doraTiles.includes(tile.i)} selected={state.tab === "score" && state.winTile === tile.i} disabled={size === 14 && state.tab !== "score" && !canDiscardTile(state, tile)} onClick={state.tab === "score" && size === 14 ? () => dispatch({ type: "SET_WIN_TILE", tile: tile.i }) : size === 14 ? () => discard(tile) : size === 13 && !state.riichi ? () => { setEditingIndex(state.hand.indexOf(tile)); setMode(null); setDoraMode(false); dispatch({ type: "SET_TAB", tab: "input" }); } : size < 13 ? () => dispatch({ type: "REMOVE_TILE", tile }) : undefined} label={size === 13 && !state.riichi ? `${tileName(tile.i, tile.red)}の入力を修正` : state.tab === "score" ? `${tileName(tile.i, tile.red)}を和了牌に指定` : undefined} />) : <p>配牌を入力してください</p>}</div><div className="meld-row">{state.melds.map((meld, index) => { const canRemove = !state.riichi && state.hand.length + meld.consumed.length + (state.melds.length - 1) * 3 <= 14; return <div className="meld" key={`${meld.type}-${index}`}><small>{({ PON: "ポン", CHI: "チー", KAN: "明槓", ANKAN: "暗槓", ADD: "加槓" } as const)[meld.type]}</small>{meld.tiles.map((tile, tileIndex) => meld.type === "ANKAN" && (tileIndex === 0 || tileIndex === 3) ? <span className="face-down-tile" key={tileIndex} aria-label="伏せ牌" /> : <MahjongTile key={tileIndex} i={tile} red={meld.redFlags[tileIndex]} small />)}<button disabled={!canRemove} title={canRemove ? "取り消す" : "この操作は「1手戻す」で取り消してください"} aria-label={`${({ PON: "ポン", CHI: "チー", KAN: "明槓", ANKAN: "暗槓", ADD: "加槓" } as const)[meld.type]}を取り消す`} onClick={() => dispatch({ type: "REMOVE_MELD", meldIndex: index })}>×</button></div>; })}</div></section>

    <nav className="analysis-tabs" aria-label="分析内容">{([['input', '手牌'], ['visible', '場の牌'], ['ukeire', '有効牌'], ['aim', '狙い目'], ['score', '成立役']] as const).map(([tab, label]) => <button key={tab} className={state.tab === tab ? "active" : ""} onClick={() => dispatch({ type: "SET_TAB", tab })}>{label}</button>)}</nav>
    <section className="analysis-body">{state.tab === "input" ? renderInput() : state.tab === "visible" ? <VisibleTilesPanel state={state} /> : state.tab === "ukeire" ? <UkeirePanel state={state} addTile={addTile} /> : state.tab === "aim" ? <YakuPanel state={state} /> : <ScorePanel state={state} />}</section>
    <footer className="edit-footer"><span>{editingIndex !== null && size === 13 && !state.riichi ? "置き換える牌を選んでください" : size === 14 ? "捨てる牌を選んでください" : size === 13 ? "ツモ牌を入力してください" : `あと${13 - size}枚`}</span><button disabled={!state.history.length} onClick={() => { setEditingIndex(null); dispatch({ type: "UNDO" }); }}>1手戻す</button><button onClick={() => { setEditingIndex(null); setMode(null); setChiChoice(null); setRedCall(null); setDoraMode(false); dispatch({ type: "RESET" }); }}>リセット</button></footer>
  </main></AppShell>;
}

function ActionRow({ size, state, candidatesFor, startAction }: { size: number; state: ReturnType<typeof useAppState>["state"]; candidatesFor: (type: ActionMode) => number[] | ReturnType<typeof riichiCandidates>; startAction: (type: ActionMode) => void }) {
  const actions: ActionMode[] = size === 13 ? ["RON", "PON", "CHI", "KAN"] : size === 14 ? ["RIICHI", "ANKAN", "ADD"] : [];
  if (!actions.length) return null;
  return <div className="action-row">{actions.map((action) => { const count = candidatesFor(action).length; return <button key={action} disabled={!count || (state.riichi && action !== "RON")} onClick={() => startAction(action)}>{ACTION_LABELS[action]}{count > 1 && <small>{count}候補</small>}</button>; })}</div>;
}

function DiscardRow({ candidate, best, onClick }: { candidate: ReturnType<typeof discardCandidates>[number]; best?: boolean; onClick: () => void }) {
  return <button className={`discard-row${best ? " best" : ""}`} onClick={onClick}><MahjongTile i={candidate.tile.i} red={candidate.tile.red} small /><span>シャンテン<b>{candidate.shanten < 0 ? "和了" : candidate.shanten}</b></span><span>種類<b>{candidate.kinds}</b></span><span>枚数<b>{candidate.total}</b></span>{best && <em>推奨</em>}</button>;
}

function DiscardPanel({ state, onDiscard }: { state: ReturnType<typeof useAppState>["state"]; onDiscard: (tile: Tile) => void }) {
  const score = bestScore(state);
  const list = discardCandidates(state).filter((candidate) => canDiscardTile(state, candidate.tile));
  return <section className="discard-panel">{score && !score.noYaku && !score.needWinTile && <div className="win-banner"><b>ツモ和了できます</b><span>成立役タブで役・点数・支払いを確認できます。</span></div>}{list.map((candidate, index) => <DiscardRow key={`${candidate.tile.i}-${candidate.tile.red}`} candidate={candidate} best={index === 0} onClick={() => onDiscard(candidate.tile)} />)}<p className="note">捨てる牌をタップしてください。有効牌は種類数のみ表示しています。</p></section>;
}

function VisibleTilesPanel({ state }: { state: ReturnType<typeof useAppState>["state"] }) {
  const { dispatch } = useAppState();
  const grouped = [...new Set(state.otherDiscards)].sort((a, b) => a - b);
  return <section className="workspace visible-tiles-panel">
    <div className="workspace-title"><div><h2>他家の捨て牌</h2><p>見えた牌を登録すると有効牌の残り枚数に反映します。</p></div><button className="text-button" disabled={!state.otherDiscards.length} onClick={() => dispatch({ type: "CLEAR_OTHER_DISCARDS" })}>すべて消す</button></div>
    <p className="visible-note">誰が捨てたかは区別しません。自分の捨て牌{state.discards.length ? `${state.discards.length}枚` : ""}は自動で反映されています。</p>
    {grouped.length > 0 && <div className="visible-tile-list">{grouped.map((tile) => <button key={tile} onClick={() => dispatch({ type: "REMOVE_OTHER_DISCARD", tile })} aria-label={`${tileName(tile)}を1枚取り消す`}><MahjongTile i={tile} small /><b>{state.otherDiscards.filter((item) => item === tile).length}枚</b><span>−</span></button>)}</div>}
    {!grouped.length && <p className="visible-empty">まだ登録されていません</p>}
    <TileGrid onPick={(tile) => dispatch({ type: "ADD_OTHER_DISCARD", tile })} disabled={(tile) => visibleCount(state, tile) >= 4} />
  </section>;
}

function UkeirePanel({ state, addTile }: { state: ReturnType<typeof useAppState>["state"]; addTile: (i: number, red: boolean) => void }) {
  if (handSize(state) !== 13) return <p className="empty-message">13枚のときに有効牌を表示します。</p>;
  const counts = countsOf(state.hand);
  const result = ukeire(counts, state.melds, (i) => Math.max(0, 4 - visibleCount(state, i)));
  const furiten = isPermanentFuriten(state);
  return <><p className={`notice${furiten ? " warning" : ""}`}>{result.base === 0 ? furiten ? "テンパイですが、自分の捨て牌によるフリテンです。ツモ和了はできます。" : "テンパイ。以下が待ち牌です（引く／出ると上がれる牌）。" : "有効牌です。引くと手が進みますが、まだ上がれる牌とは限りません。"}</p><div className="ukeire-grid">{result.tiles.map(({ i, left }) => { const ron = result.base === 0 ? scorePreview(state, i, "ron") : null; const tsumo = result.base === 0 ? scorePreview(state, i, "tsumo") : null; const canRon = !furiten && ron && !ron.noYaku && !ron.needWinTile; const canTsumo = tsumo && !tsumo.noYaku && !tsumo.needWinTile; const status = canRon && canTsumo ? "ロン・ツモ可" : canRon ? "ロン可" : canTsumo && !state.riichi && state.melds.length === 0 ? "ツモ可／ロンは要リーチ" : canTsumo ? "ツモ可" : "役なし"; return <button key={i} onClick={() => addTile(i, false)}><MahjongTile i={i} small /><b>{left}枚</b>{result.base === 0 && <small>{status}</small>}</button>; })}</div></>;
}

function YakuPanel({ state }: { state: ReturnType<typeof useAppState>["state"] }) {
  const { dispatch } = useAppState();
  if (![13, 14].includes(handSize(state))) return <p className="empty-message">13枚以上になると狙い目を表示します。</p>;
  const guides = yakuGuides(state);
  return <><div className="sort-row"><button className={state.yakuSort === "near" ? "active" : ""} onClick={() => dispatch({ type: "SET_SORT", sort: "near" })}>近い順</button><button className={state.yakuSort === "han" ? "active" : ""} onClick={() => dispatch({ type: "SET_SORT", sort: "han" })}>翻数順</button></div><div className="yaku-guides">{guides.map((guide) => <article key={guide.name} className={guide.distance < 0 ? "completed" : ""}><header><div><h2>{guide.name}</h2><span>{guide.han}</span>{guide.closedOnly && <em>鳴くと消える</em>}{guide.openHan && <em>{guide.openHan}</em>}</div><b>{guide.distance < 0 ? "和了" : guide.distance === 0 ? "テンパイ" : `あと${guide.distance}`}</b></header><p>{guide.description}</p><SampleTiles tiles={guide.sample} /></article>)}</div><p className="note">「あと」はその役を狙う場合の目安です。成立役で判定された役は狙い目にも必ず反映されます。</p></>;
}

function ScorePanel({ state }: { state: ReturnType<typeof useAppState>["state"] }) {
  const { dispatch } = useAppState();
  const [uraMode, setUraMode] = useState(false);
  if (handSize(state) !== 14) return <p className="empty-message">和了形になると、入力した状態を引き継いで成立役と点数を表示します。</p>;
  const result = bestScore(state);
  const canSetUra = state.riichi && result && !result.needWinTile && !result.noYaku && !!result.score && state.dora.length > 0;
  const closed = !isOpen(state);
  const noDiscard = state.discards.length === 0 && state.melds.length === 0;
  const situationalOptions = ([
    { yaku: "ippatsu", label: "一発", visible: state.riichi && closed },
    { yaku: "doubleRiichi", label: "ダブル立直", visible: state.riichi && closed },
    { yaku: "haitei", label: "海底摸月", visible: state.agariType === "tsumo" },
    { yaku: "houtei", label: "河底撈魚", visible: state.agariType === "ron" },
    { yaku: "rinshan", label: "嶺上開花", visible: state.agariType === "tsumo" },
    { yaku: "chankan", label: "槍槓", visible: state.agariType === "ron" },
    { yaku: "tenhou", label: "天和", visible: state.agariType === "tsumo" && closed && state.seat === 0 && noDiscard },
    { yaku: "chiihou", label: "地和", visible: state.agariType === "tsumo" && closed && state.seat !== 0 && noDiscard },
  ] satisfies { yaku: SituationalYaku; label: string; visible: boolean }[]).filter((option) => option.visible);
  return <>
    <div className="score-controls"><span>{state.agariType === "ron" ? "ロン" : "ツモ"}</span>{state.riichi && <span>リーチ中</span>}{result?.wait && <span>{WAIT_LABELS[result.wait] || result.wait}</span>}{canSetUra && <button className={uraMode ? "active" : ""} onClick={() => setUraMode((value) => !value)}>裏ドラ {state.uraDora.length}/{state.dora.length}</button>}</div>
    <section className="score-options">
      <div className="score-options-title"><div><h2>和了時の状況</h2><p>操作順から分かる項目は自動選択されます。実際の状況と違う場合はタップして外せます。</p></div></div>
      <div className="situation-buttons">{situationalOptions.map(({ yaku, label }) => <button key={yaku} className={state.situationalYaku.includes(yaku) ? "active" : ""} aria-pressed={state.situationalYaku.includes(yaku)} onClick={() => dispatch({ type: "TOGGLE_SITUATIONAL_YAKU", yaku })}>{label}</button>)}</div>
      <div className="counter-options">
        <ScoreStepper label="本場" value={state.honba} unit="本" onChange={(value) => dispatch({ type: "SET_HONBA", value })} />
        <ScoreStepper label="供託" value={state.kyotaku} unit="本" onChange={(value) => dispatch({ type: "SET_KYOTAKU", value })} />
      </div>
      <div className="rule-options">
        <button className={state.kiriageMangan ? "active" : ""} aria-pressed={state.kiriageMangan} onClick={() => dispatch({ type: "SET_SCORING_RULE", rule: "kiriageMangan", enabled: !state.kiriageMangan })}><b>切り上げ満貫</b><small>30符4翻・60符3翻</small></button>
        <button className={state.doubleYakuman ? "active" : ""} aria-pressed={state.doubleYakuman} onClick={() => dispatch({ type: "SET_SCORING_RULE", rule: "doubleYakuman", enabled: !state.doubleYakuman })}><b>ダブル役満</b><small>単騎・十三面・純正・大四喜</small></button>
      </div>
    </section>
    {uraMode && canSetUra && <section className="workspace ura-workspace"><div className="workspace-title"><div><h2>裏ドラ表示牌を入力</h2><p>リーチ和了時だけ加算します。表ドラと同じ枚数まで入力できます。</p></div><button className="text-button" onClick={() => setUraMode(false)}>閉じる</button></div>{state.uraDora.length > 0 && <div className="ura-list">{state.uraDora.map((tile, index) => <MahjongTile key={`${tile}-${index}`} i={tile} small onClick={() => dispatch({ type: "REMOVE_URA_DORA", index })} label={`${tileName(tile)}の裏ドラ表示牌を削除`} />)}</div>}<TileGrid onPick={(tile) => dispatch({ type: "ADD_URA_DORA", tile })} disabled={(tile) => state.uraDora.length >= state.dora.length || visibleCount(state, tile) + state.uraDora.filter((item) => item === tile).length >= 4} /></section>}
    {!result ? <p className="empty-message">まだ和了形ではありません。</p> : result.needWinTile ? <p className="empty-message">和了牌が記録されていません。手牌をタップして指定してください。</p> : result.noYaku ? <div className="no-yaku"><b>役がありません</b><span>形はそろっていますが、このままでは上がれません。</span></div> : result.score && <>
      <article className="score-card"><div className="score-total"><small>受取合計</small><strong>{result.score.total.toLocaleString()}<em>点</em></strong><span>{result.yakuman ? result.score.limit : `${result.han}翻 ${result.fu}符${result.score.limit ? `（${result.score.limit}）` : ""}`}　{state.seat === 0 ? "親" : "子"}</span></div><table><tbody>{result.yaku?.map((yaku) => <tr key={yaku.nm}><th>{yaku.nm}</th><td>{yaku.yakuman ? yaku.yakuman > 1 ? `${yaku.yakuman}倍役満` : "役満" : `${yaku.han}翻`}</td></tr>)}{!!result.omoteDora && <tr><th>表ドラ</th><td>{result.omoteDora}翻</td></tr>}{!!result.uraDora && <tr><th>裏ドラ</th><td>{result.uraDora}翻</td></tr>}{!!result.akaDora && <tr><th>赤ドラ</th><td>{result.akaDora}翻</td></tr>}</tbody></table><div className="payment"><h3>点数の受け取り方</h3>{result.score.payments.map((payment) => <div key={payment.label}><span>{payment.label}</span><b>{payment.amount}</b></div>)}<div><span>あなたの受取合計</span><b>{result.score.total.toLocaleString()}点</b></div></div></article>
    </>}
    <p className="note">ロン／ツモとリーチ状態は手牌タブの内容を自動反映します。和了牌を変える場合は上の手牌をタップしてください。</p>
  </>;
}

function ScoreStepper({ label, value, unit, onChange }: { label: string; value: number; unit: string; onChange: (value: number) => void }) {
  return <div><span>{label}</span><div><button disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label={`${label}を1つ減らす`}>−</button><b>{value}<small>{unit}</small></b><button disabled={value >= 99} onClick={() => onChange(value + 1)} aria-label={`${label}を1つ増やす`}>＋</button></div></div>;
}
