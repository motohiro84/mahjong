"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AppShell } from "./app-shell";
import { MahjongTile } from "./mahjong-tile";
import { analysisState, callOptions, canExpose, canOwnRon, initialPlay, MELD_LABELS, ownScore, PLAY_KEY, playReducer, restorePlay, selfKanOptions, validScoreInput, WINDS, winSettlement } from "@/lib/play";
import type { PlayAction, PlaySnapshot, PlayState, WinInput } from "@/lib/play";
import type { SituationalYaku, Tile } from "@/lib/types";
import { countsOf, RED_FIVES, tileName } from "@/lib/tiles";
import { discardCandidates, isPermanentFuriten, riichiCandidates } from "@/lib/analysis";
import { shanten, ukeire } from "@/lib/shanten";
import { yakuGuides } from "@/lib/yaku-guide";

type Dispatch = (action: PlayAction) => void;
type Panel = "aim" | "rivers" | "settings" | "call" | "kan" | "end" | "win-ron" | "win-tsumo" | "reset" | null;
const same = (a: Tile, b: Tile) => a.i === b.i && a.red === b.red;
const wind = (s: PlaySnapshot, p: number) => `${WINDS[p]}家${p === s.me ? "（あなた）" : ""}`;
const points = (n: number) => n.toLocaleString();

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog className="play-dialog" ref={ref} onCancel={close} onClose={close}>
    <header><h2>{title}</h2><button autoFocus onClick={close} aria-label="閉じる">閉じる ×</button></header>
    <div className="play-dialog-body">{children}</div>
  </dialog>;
}
function TilePicker({ onPick, disabled, label = "牌を選択" }: { onPick: (tile: Tile) => void; disabled?: (tile: Tile) => boolean; label?: string }) {
  const [red, setRed] = useState(false);
  return <div className="play-picker" aria-label={label}>
    <div className="play-picker-tools"><span>{label}</span><button className={red ? "selected" : ""} aria-pressed={red} onClick={() => setRed(!red)}>赤5</button></div>
    {[0, 9, 18, 27].map((start) => <div className="play-tile-row" key={start}>{Array.from({ length: start === 27 ? 7 : 9 }, (_, n) => {
      const tile = { i: start + n, red: red && RED_FIVES.includes(start + n) };
      return <MahjongTile key={tile.i} {...tile} disabled={disabled?.(tile)} onClick={() => { onPick(tile); setRed(false); }} />;
    })}</div>)}
  </div>;
}
function Tiles({ tiles }: { tiles: Tile[] }) { return <span className="play-tiles">{tiles.map((t, i) => <MahjongTile key={i} {...t} small />)}</span>; }

export function PlayPage() {
  const [s, rawDispatch] = useReducer((state: PlayState, action: PlayAction | { type: "LOAD"; state: PlayState }) => action.type === "LOAD" ? action.state : playReducer(state, action), undefined, initialPlay);
  const [status, setStatus] = useReducer((old: { ready: boolean; loadError: string; saveError: boolean; retry: number }, next: Partial<typeof old>) => ({ ...old, ...next }), { ready: false, loadError: "", saveError: false, retry: 0 });
  const [panel, setPanel] = useState<Panel>(null);
  const [otherCall, setOtherCall] = useState(false);
  const [callKind, setCallKind] = useState<"CHI" | "PON" | "KAN">("PON");
  const [riichi, setRiichi] = useState(false);
  const dispatch: Dispatch = (action) => { rawDispatch(action); setRiichi(false); };
  useEffect(() => {
    try { rawDispatch({ type: "LOAD", state: restorePlay(localStorage.getItem(PLAY_KEY)) }); setStatus({ ready: true }); }
    catch { setStatus({ ready: true, loadError: "保存データを読み込めませんでした。再読込で再試行するか、新しい対局を開始してください。" }); }
  }, []);
  useEffect(() => {
    if (!status.ready || status.loadError) return;
    try { localStorage.setItem(PLAY_KEY, JSON.stringify(s)); setStatus({ saveError: false }); }
    catch { setStatus({ saveError: true }); }
  }, [s, status.ready, status.loadError, status.retry]);
  const a = useMemo(() => analysisState(s), [s]);
  const handSize = s.hand.length + s.melds[s.me].length * 3;
  const currentShanten = handSize >= 13 ? shanten(countsOf(s.hand), s.melds[s.me]) : null;
  const candidates = useMemo(() => s.phase === "discard" ? discardCandidates(a).filter((c) => !s.kuikae.includes(c.tile.i) && (!s.riichi[s.me] || (s.drawn && same(s.drawn, c.tile)))) : [], [a, s]);
  const riichiTiles = useMemo(() => s.phase === "discard" && s.scores[s.me] >= 1000 ? riichiCandidates(a).map((c) => c.tile) : [], [a, s]);
  const canDiscard = (tile: Tile) => candidates.some((c) => same(c.tile, tile)) && (!riichi || riichiTiles.some((t) => same(t, tile)));
  const ownWin = ownScore(s, "tsumo");
  const useful = handSize === 13 ? ukeire(countsOf(s.hand), s.melds[s.me], (i) => Math.max(0, 4 - [...s.hand, ...s.rivers.flat().filter((t) => !t.called), ...s.melds.flat().flatMap((m) => m.tiles.map((i) => ({ i, red: false }))), ...s.dora.map((i) => ({ i, red: false }))].filter((t) => t.i === i).length)) : null;
  const title = s.phase === "setup" ? "13枚を選んで、対局を始める" : s.phase === "result" ? "この局の結果" : s.phase === "draw" ? s.rinshanFor === s.me ? "嶺上牌を選択" : "あなたのツモ牌を選択" : s.phase === "discard" ? ownWin?.score ? "ツモ和了できます" : riichi ? "リーチして捨てる牌を選択" : "あなたの捨て牌を選択" : `${WINDS[s.turn]}家の捨て牌を選択`;
  const close = () => setPanel(null);
  if (!status.ready) return <div className="loading-screen">対局ナビを準備中…</div>;
  return <AppShell><main className="play-page">
    <header className="play-header"><div><span className="play-eyebrow">対局ナビ</span><h1>{WINDS[s.round]}{s.kyoku}局 <small>{s.honba}本場</small></h1></div><button onClick={() => setPanel("settings")} className="play-context">{WINDS[s.me]}家 · あなた<span>供託 {s.sticks}本 ／ 設定</span></button></header>
    <div className="play-seats" aria-label="手番と持ち点">{s.scores.map((score, p) => <div key={p} className={`${p === s.turn && !["setup", "result"].includes(s.phase) ? "turn" : ""} ${p === s.me ? "me" : ""}`}><span>{WINDS[p]}家 {p === s.me ? "あなた" : ""}{s.riichi[p] ? " · 立直" : ""}</span><b>{points(score)}</b></div>)}</div>
    {status.loadError && <div className="play-alert" role="alert">{status.loadError}<button onClick={() => { rawDispatch({ type: "RESET" }); setStatus({ loadError: "" }); }}>新しい対局を開始</button></div>}
    {status.saveError && <div className="play-alert" role="alert">対局を保存できません。閉じる前に再試行してください。<button onClick={() => setStatus({ retry: status.retry + 1 })}>保存を再試行</button></div>}
    <section className="play-hand" aria-label="自分の手牌"><div className="play-hand-caption"><span>手牌 {s.phase === "setup" ? `${handSize}/13` : `${handSize}枚`}{handSize === 14 ? "（打牌前）" : ""}</span><b>{currentShanten === null ? `あと${13 - handSize}枚` : currentShanten === -1 ? "和了形" : currentShanten === 0 ? "テンパイ" : `${currentShanten}シャンテン`}</b></div><div className="play-hand-tiles">{s.hand.map((t, index) => ({ t, index })).sort((a, b) => a.t.i - b.t.i || Number(b.t.red) - Number(a.t.red)).map(({ t, index }) => <MahjongTile key={index} {...t} selected={s.phase === "discard" && index === s.hand.length - 1 && !!s.drawn} disabled={s.phase === "discard" && !canDiscard(t)} onClick={s.phase === "setup" ? () => dispatch({ type: "REMOVE", index }) : s.phase === "discard" ? () => dispatch({ type: "TILE", tile: t, riichi }) : undefined} label={`${tileName(t.i, t.red)}${s.phase === "setup" ? "を取り消す" : s.phase === "discard" ? "を捨てる" : ""}`} />)}{!s.hand.length && <p>下の牌をタップして配牌を入力</p>}</div>{s.melds[s.me].length > 0 && <div className="play-melds">{s.melds[s.me].map((m, i) => <div key={i}><small>{MELD_LABELS[m.type]}</small><Tiles tiles={m.tiles.map((i, n) => ({ i, red: m.redFlags[n] }))} /></div>)}</div>}</section>
    <div className="play-scroll">
      {s.error && <p className="play-alert" role="alert">{s.error}</p>}
      {!status.loadError && <>
        {s.last && s.phase !== "result" && <section className="play-response" aria-label="直前の牌への対応"><div className="play-last"><MahjongTile {...s.last.tile} small /><div><small>{s.last.kind === "kan" ? "加槓した牌" : "直前の捨て牌"}</small><b>{wind(s, s.last.player)}{s.pendingRiichi !== null ? " · リーチ宣言" : ""}</b></div>{s.last.kind === "discard" && s.last.player !== s.me && !s.riichi[s.last.player] && s.melds[s.last.player].every((m) => m.type === "ANKAN") && <button onClick={() => dispatch({ type: "LATE_RIICHI" })}>リーチを追加</button>}</div>
          <div className="play-response-actions">{(["CHI", "PON", "KAN"] as const).map((kind) => <button key={kind} disabled={!callOptions(s, kind).length} onClick={() => { setOtherCall(false); setCallKind(kind); setPanel("call"); }}>{MELD_LABELS[kind]}</button>)}<button className="play-ron" disabled={!canOwnRon(s)} onClick={() => setPanel("win-ron")}>ロン</button>{s.last.kind === "discard" && <button onClick={() => { setOtherCall(true); setCallKind("PON"); setPanel("call"); }}>他家の鳴き</button>}</div><p>次の牌を確定するまで、この牌に対応できます。</p></section>}
        <section className="play-step" aria-live="polite"><span className="play-step-dot" /><div><h2>{title}</h2><p>{s.phase === "setup" ? "局の最初から記録します。場・自風は上の設定で変更できます。" : s.phase === "other" ? s.rinshanFor === s.turn ? "嶺上牌の後の捨て牌です。ツモ和了は「局を終了」から。" : s.afterCall ? "鳴いた人の打牌です。打牌後はその人の下家へ進みます。" : "選ぶと次の人へ進みます。毎回の見送り操作は不要です。" : s.phase === "draw" ? "上家の牌を鳴く場合は、ツモ牌を選ぶ前に操作してください。" : s.phase === "discard" ? s.riichi[s.me] ? "リーチ中です。和了しない場合はツモ牌を捨てます。" : "上の手牌、または下の候補から選べます。" : "精算内容を確認して次局へ進みます。"}</p></div></section>
        {s.phase === "setup" && <>{s.hand.length < 13 && <TilePicker onPick={(tile) => dispatch({ type: "TILE", tile })} disabled={(t) => !canExpose(s, [t])} label="配牌を選択" />}<button className="play-primary" disabled={s.hand.length !== 13} onClick={() => dispatch({ type: "START" })}>開始 · {s.me === 0 ? "自分の14枚目へ" : "東家の捨て牌から"}</button></>}
        {(s.phase === "draw" || s.phase === "other") && <>
          {s.phase === "other" && <div className="play-inline"><label><input type="checkbox" checked={riichi} disabled={s.riichi[s.turn] || s.afterCall || s.scores[s.turn] < 1000 || s.melds[s.turn].some((m) => m.type !== "ANKAN")} onChange={(e) => setRiichi(e.target.checked)} /> この牌でリーチ</label><button disabled={s.afterCall || s.melds.flat().filter((m) => ["KAN", "ANKAN", "ADD"].includes(m.type)).length >= 4} onClick={() => setPanel("kan")}>この人がカンした</button></div>}
          <TilePicker key={`${s.phase}-${s.turn}-${s.rivers.flat().length}`} onPick={(tile) => dispatch({ type: "TILE", tile, riichi })} disabled={(t) => !canExpose(s, [t]) || (s.phase === "other" && s.kuikae.includes(t.i))} label={s.phase === "draw" ? "取得した牌" : "捨てられた牌"} />
          {useful && <div className="play-useful"><h3>{useful.base === 0 ? "あなたの待ち牌" : "あなたの有効牌"}<small>{useful.tiles.length}種・残り{useful.total}枚</small></h3><div>{useful.tiles.map((t) => <span key={t.i}><MahjongTile i={t.i} tiny /><small>{t.left}枚</small></span>)}</div></div>}
        </>}
        {s.phase === "discard" && <>
          <div className="play-inline"><label><input type="checkbox" checked={riichi} disabled={!riichiTiles.length} onChange={(e) => setRiichi(e.target.checked)} /> リーチして打牌</label><button disabled={!selfKanOptions(s).length} onClick={() => setPanel("kan")}>暗槓・加槓</button></div>
          {ownWin?.score && <article className="play-win-summary"><small>ツモ和了 · 受取合計</small><strong>{points(ownWin.score.total)}<span>点</span></strong><p>{ownWin.yakuman ? ownWin.score.limit : `${ownWin.han}翻 ${ownWin.fu}符`} · {ownWin.yaku?.map((y) => y.nm).join("・")}</p><p>{ownWin.score.detail}</p><button className="play-primary" onClick={() => setPanel("win-tsumo")}>ツモ和了 · 役と点数を確認</button></article>}
          <div className="play-discard-list">{candidates.filter((c) => !riichi || riichiTiles.some((t) => same(t, c.tile))).map((c, index) => <button key={`${c.tile.i}-${c.tile.red}`} onClick={() => dispatch({ type: "TILE", tile: c.tile, riichi })}><MahjongTile {...c.tile} small /><span>{c.shanten === 0 ? "テンパイ" : `${c.shanten}シャンテン`}<small>有効牌 {c.kinds}種・{c.total}枚</small></span>{index === 0 && <em>候補</em>}</button>)}</div>
        </>}
        {s.phase === "result" && s.result && <ResultPanel s={s} dispatch={dispatch} />}
        {s.phase !== "setup" && s.phase !== "result" && (s.riichiFuriten || s.temporaryFuriten || isPermanentFuriten(a)) && <p className="play-alert">{s.riichiFuriten ? "リーチ後の見逃しフリテン" : s.temporaryFuriten ? "同巡内の見逃しフリテン" : "自分の捨て牌によるフリテン"}です。ロンできません。</p>}
      </>}
    </div>
    <footer className="play-footer"><div><button onClick={() => setPanel("aim")}>狙い目の役</button><button onClick={() => setPanel("rivers")}>捨て牌・記録</button><button disabled={!s.history.length || !!status.loadError} onClick={() => { dispatch({ type: "UNDO" }); close(); }}>1手戻す</button></div><button className="play-end" disabled={s.phase === "setup" || s.phase === "result" || !!status.loadError} onClick={() => setPanel("end")}>局を終了</button></footer>
    {panel === "settings" && <Modal title="対局の設定" close={close}><SettingsPanel s={s} dispatch={dispatch} close={close} /><button className="play-danger" onClick={() => setPanel("reset")}>新しい対局にリセット</button></Modal>}
    {panel === "reset" && <Modal title="対局ナビをリセット" close={close}><p>この対局ナビの手牌・持ち点・進行を初期値に戻します。既存の手牌分析には影響しません。「1手戻す」で取り消せます。</p><button className="play-primary" onClick={() => { dispatch({ type: "RESET" }); close(); }}>リセットする</button></Modal>}
    {panel === "aim" && <Modal title="狙い目の役" close={close}>{handSize < 13 ? <p>13枚入力すると役の候補が表示されます。</p> : yakuGuides(a).map((y) => <article className="play-guide" key={y.name}><h3>{y.name}<small>{y.han}</small></h3><p>{y.description}</p><span>{y.distance < 0 ? "成立" : y.distance === 0 ? "テンパイ" : `あと${y.distance}（目安）`}</span></article>)}</Modal>}
    {panel === "rivers" && <Modal title="捨て牌・対局記録" close={close}>{s.rivers.map((r, p) => <section className="play-river" key={p}><h3>{wind(s, p)} · {points(s.scores[p])}点</h3><div>{r.map((t, i) => <span key={i} className={`${t.called ? "called" : ""} ${t.declaration ? "declaration" : ""}`}><MahjongTile {...t} small /><small>{t.called ? "鳴かれた" : t.declaration ? "立直" : i + 1}</small></span>)}</div>{!r.length && <p>まだ捨て牌はありません</p>}{s.melds[p].map((m, i) => <p key={i}>{MELD_LABELS[m.type]} <Tiles tiles={m.tiles.map((i, n) => ({ i, red: m.redFlags[n] }))} /></p>)}</section>)}<details><summary>進行記録</summary><ol>{s.log.map((line, i) => <li key={i}>{line}</li>)}</ol></details></Modal>}
    {panel === "call" && s.last && <Modal title="鳴きを記録" close={close}><CallPanel s={s} otherCall={otherCall} initialKind={callKind} dispatch={dispatch} close={close} /></Modal>}
    {panel === "kan" && <Modal title="カンを記録" close={close}><KanPanel s={s} dispatch={dispatch} close={close} /></Modal>}
    {panel === "end" && <Modal title="局を終了" close={close}><EndPanel s={s} dispatch={dispatch} close={close} win={(method) => setPanel(method === "ron" ? "win-ron" : "win-tsumo")} /></Modal>}
    {(panel === "win-ron" || panel === "win-tsumo") && <Modal title={panel === "win-ron" ? "ロン和了の確認" : "ツモ和了の確認"} close={close}><WinPanel s={s} method={panel === "win-ron" ? "ron" : "tsumo"} dispatch={dispatch} close={close} /></Modal>}
  </main></AppShell>;
}

function SettingsPanel({ s, dispatch, close }: { s: PlayState; dispatch: Dispatch; close: () => void }) {
  const [values, setValues] = useState({ me: s.me, round: s.round, kyoku: s.kyoku, honba: s.honba, sticks: s.sticks, scores: s.scores.slice() });
  const [doraMode, setDoraMode] = useState(false);
  return <>
    {s.phase === "setup" ? <form className="play-form" onSubmit={(e) => { e.preventDefault(); dispatch({ type: "SETUP", ...values }); close(); }}>
      <div className="play-form-grid"><label>場風<select value={values.round} onChange={(e) => setValues({ ...values, round: +e.target.value })}>{WINDS.map((w, p) => <option key={p} value={p}>{w}場</option>)}</select></label><label>局<select value={values.kyoku} onChange={(e) => setValues({ ...values, kyoku: +e.target.value })}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></label><label>自風<select value={values.me} onChange={(e) => setValues({ ...values, me: +e.target.value })}>{WINDS.map((w, p) => <option key={p} value={p}>{w}家</option>)}</select></label><label>本場<input type="number" min="0" max="99" required value={values.honba} onChange={(e) => setValues({ ...values, honba: +e.target.value })} /></label><label>供託（本）<input type="number" min="0" max="99" required value={values.sticks} onChange={(e) => setValues({ ...values, sticks: +e.target.value })} /></label></div>
      <h3>開始時の持ち点</h3><div className="play-form-grid">{values.scores.map((v, p) => <label key={p}>{WINDS[p]}家<input type="number" step="100" min="-1000000" max="1000000" required value={v} onChange={(e) => setValues({ ...values, scores: values.scores.map((old, n) => n === p ? +e.target.value : old) })} /></label>)}</div><p className="play-muted">持ち点は供託分を除いた現在の点数を入力してください。</p><button className="play-primary">設定を保存</button>
    </form> : <p>{WINDS[s.round]}{s.kyoku}局・{s.honba}本場・供託{s.sticks}本。場と持ち点は次局の準備画面で変更できます。</p>}
    <section className="play-settings-section"><h3>ドラ表示牌 {s.dora.length}/5</h3><div className="play-tiles">{s.dora.map((i, n) => <MahjongTile key={n} i={i} small onClick={() => dispatch({ type: "INDICATOR", tile: i, remove: n })} label={`${tileName(i)}の表示牌を削除`} />)}<button disabled={s.dora.length >= 5} onClick={() => setDoraMode(!doraMode)}>{doraMode ? "閉じる" : "追加"}</button></div>{doraMode && <TilePicker label="ドラそのものではなく表示牌" disabled={(t) => t.red || !canExpose(s, [t]) || s.dora.length >= 5} onPick={(tile) => { dispatch({ type: "INDICATOR", tile: tile.i }); setDoraMode(false); }} />}<p className="play-muted">カンの後は、新しい表示牌をここに追加できます。</p></section>
    <div className="play-rule-options"><label><input type="checkbox" checked={s.kiriage} onChange={(e) => dispatch({ type: "RULE", rule: "kiriage", value: e.target.checked })} />切り上げ満貫</label><label><input type="checkbox" checked={s.doubleYakuman} onChange={(e) => dispatch({ type: "RULE", rule: "doubleYakuman", value: e.target.checked })} />ダブル役満（四暗刻単騎など）</label></div>
    <details className="play-muted"><summary>精算ルール</summary><p>喰いタン・赤五各色1枚・数え役満あり。流局はノーテン罰符3,000点、親テンパイで連荘。複数ロンは本場を各和了者へ、供託は放銃者から順に最も近い和了者へ渡します。自動終局・ウマ・オカ・責任払いの精算は行いません。次局に進む前に親の継続を変更できます。</p></details>
  </>;
}

function CallPanel({ s, initialKind, otherCall, dispatch, close }: { s: PlayState; otherCall: boolean; initialKind: "CHI" | "PON" | "KAN"; dispatch: Dispatch; close: () => void }) {
  const last = s.last!;
  const [player, setPlayer] = useState(!otherCall && callOptions(s, initialKind).length ? s.me : [0, 1, 2, 3].find((p) => p !== last.player && p !== s.me && !s.riichi[p]) ?? s.me);
  const [kind, setKind] = useState(initialKind);
  const [consume, setConsume] = useState<Tile[]>([]);
  const count = kind === "KAN" ? 3 : 2;
  const options = callOptions(s, kind);
  const test = playReducer(s, { type: "CALL", player, kind, consume });
  return <><p>{wind(s, last.player)}の <Tiles tiles={[last.tile]} /> を鳴く</p><div className="play-form-grid"><label>鳴いた人<select value={player} onChange={(e) => { setPlayer(+e.target.value); setConsume([]); }}>{WINDS.map((w, p) => <option key={p} value={p} disabled={p === last.player || s.riichi[p]}>{w}家{p === s.me ? "（あなた）" : ""}</option>)}</select></label><label>種類<select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setConsume([]); }}>{(["PON", "CHI", "KAN"] as const).map((k) => <option key={k} value={k} disabled={k === "CHI" && player !== (last.player + 1) % 4}>{MELD_LABELS[k]}</option>)}</select></label></div>
    {player === s.me ? <><h3>手から出す牌を選択</h3>{options.length ? options.map((tiles, index) => <button className="play-call-option" key={index} onClick={() => { dispatch({ type: "CALL", player, kind, consume: tiles }); close(); }}><Tiles tiles={tiles} /><span>{MELD_LABELS[kind]}を確定</span></button>) : <p>この鳴きはできません。手牌・上家・喰い替え制限を確認してください。</p>}</> : <>
      <h3>その人が手から出した{count}枚</h3><p className="play-muted">捨て牌は追加済みです。残りの公開牌を選びます。</p><div className="play-tiles">{consume.map((tile, n) => <MahjongTile key={n} {...tile} small onClick={() => setConsume(consume.filter((_, i) => i !== n))} />)}</div>
      {consume.length < count && <TilePicker disabled={(t) => !canExpose(s, [...consume, t]) || (kind !== "CHI" && t.i !== last.tile.i) || (kind === "CHI" && (t.i >= 27 || Math.floor(t.i / 9) !== Math.floor(last.tile.i / 9) || Math.abs(t.i - last.tile.i) > 2 || t.i === last.tile.i || consume.some((v) => v.i === t.i)))} onPick={(t) => setConsume([...consume, t])} label="公開された牌" />}
      {consume.length === count && test.error && <p className="play-alert">{test.error}</p>}<button className="play-primary" disabled={!!test.error} onClick={() => { dispatch({ type: "CALL", player, kind, consume }); close(); }}>鳴きを確定 · {WINDS[player]}家の打牌へ</button>
    </>}</>;
}

function KanPanel({ s, dispatch, close }: { s: PlayState; dispatch: Dispatch; close: () => void }) {
  const [kind, setKind] = useState<"ANKAN" | "ADD">("ANKAN");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const p = s.turn;
  const test = playReducer(s, { type: "KAN", player: p, kind, tiles });
  if (p === s.me) return <>{selfKanOptions(s).map((o, i) => <button className="play-call-option" key={i} onClick={() => { dispatch({ type: "KAN", player: p, ...o }); close(); }}><Tiles tiles={o.tiles} /><span>{MELD_LABELS[o.kind]}</span></button>)}{!selfKanOptions(s).length && <p>現在できるカンはありません。</p>}</>;
  return <><p>{wind(s, p)}のカンを記録します。</p><label>種類<select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setTiles([]); }}><option value="ANKAN">暗槓（4枚）</option><option value="ADD" disabled={s.riichi[p] || !s.melds[p].some((m) => m.type === "PON")}>加槓（追加の1枚）</option></select></label><p>赤五を含む場合も、実際の牌を指定してください。</p><div className="play-tiles">{tiles.map((t, i) => <MahjongTile key={i} {...t} small onClick={() => setTiles(tiles.filter((_, n) => n !== i))} />)}</div>{tiles.length < (kind === "ANKAN" ? 4 : 1) && <TilePicker disabled={(t) => !canExpose(s, [...tiles, t]) || (!!tiles.length && tiles[0].i !== t.i) || (kind === "ADD" && !s.melds[p].some((m) => m.type === "PON" && m.base === t.i))} onPick={(t) => setTiles([...tiles, t])} />}{tiles.length === (kind === "ANKAN" ? 4 : 1) && test.error && <p className="play-alert">{test.error}</p>}<button className="play-primary" disabled={!!test.error} onClick={() => { dispatch({ type: "KAN", player: p, kind, tiles }); close(); }}>カンを確定</button></>;
}

function EndPanel({ s, dispatch, close, win }: { s: PlayState; dispatch: Dispatch; close: () => void; win: (method: "ron" | "tsumo") => void }) {
  const [tenpai, setTenpai] = useState<number[]>(s.riichi.map((r, p) => r || (p === s.me && shanten(countsOf(s.hand), s.melds[s.me]) === 0) ? p : -1).filter((p) => p >= 0));
  const [abortive, setAbortive] = useState(false);
  const [draw, setDraw] = useState(false);
  if (!draw) return <div className="play-end-options"><button disabled={!s.last} onClick={() => win("ron")}>直前の牌でロン（他家の和了もここ）</button><button disabled={(s.phase !== "other" || s.afterCall) && (s.phase !== "discard" || !s.drawn || !ownScore(s, "tsumo")?.score)} onClick={() => win("tsumo")}>{wind(s, s.turn)}のツモ和了</button><button onClick={() => setDraw(true)}>流局・途中流局</button></div>;
  return <><label><input type="checkbox" checked={abortive} onChange={(e) => setAbortive(e.target.checked)} />途中流局（精算なし・親継続）</label>{!abortive && <><h3>テンパイした人を選択</h3><div className="play-checkboxes">{WINDS.map((w, p) => <label key={p}><input type="checkbox" checked={tenpai.includes(p)} onChange={(e) => setTenpai(e.target.checked ? [...tenpai, p] : tenpai.filter((n) => n !== p))} />{w}家{p === s.me ? "（あなた）" : ""}</label>)}</div><p>ノーテン罰符は合計3,000点。親がテンパイなら連荘します。</p></>}<button className="play-primary" onClick={() => { dispatch({ type: "DRAW_END", tenpai, abortive }); close(); }}>流局を確定して精算</button></>;
}

function WinPanel({ s, method, dispatch, close }: { s: PlayState; method: "ron" | "tsumo"; dispatch: Dispatch; close: () => void }) {
  const [winners, setWinners] = useState<WinInput[]>(method === "tsumo" ? [{ player: s.turn, han: 3, fu: 40, yakuman: 0 }] : canOwnRon(s) ? [{ player: s.me, han: 3, fu: 40, yakuman: 0 }] : []);
  const [extra, setExtra] = useState<SituationalYaku[]>([]);
  const [uraMode, setUraMode] = useState(false);
  const own = ownScore(s, method, extra);
  const includesMe = winners.some((w) => w.player === s.me);
  let preview: ReturnType<typeof winSettlement> | null = null;
  let error = "";
  try { preview = winSettlement(s, method, winners, extra); } catch (e) { error = e instanceof Error ? e.message : "入力を確認してください。"; }
  const update = (p: number, values: Partial<WinInput>) => setWinners(winners.map((w) => w.player === p ? { ...w, ...values } : w));
  return <>
    {own && ((method === "tsumo" && s.rinshanFor !== s.me) || (method === "ron" && s.last?.kind !== "kan")) && <label><input type="checkbox" checked={extra.length > 0} onChange={(e) => setExtra(e.target.checked ? [method === "ron" ? "houtei" : "haitei"] : [])} />{method === "ron" ? "自分の河底撈魚（最後の捨て牌）" : "自分の海底摸月（最後のツモ）"}</label>}
    {method === "ron" && <><p>{s.last ? `${wind(s, s.last.player)}の${s.last.kind === "kan" ? "加槓牌" : "捨て牌"}` : "捨て牌がありません"}{s.last && <Tiles tiles={[s.last.tile]} />}</p><h3>和了者（複数選択可）</h3><div className="play-checkboxes">{WINDS.map((w, p) => <label key={p}><input type="checkbox" disabled={p === s.last?.player || (p === s.me && !own?.score)} checked={winners.some((v) => v.player === p)} onChange={(e) => setWinners(e.target.checked ? [...winners, { player: p, han: 3, fu: 40, yakuman: 0 }] : winners.filter((v) => v.player !== p))} />{wind(s, p)}</label>)}</div></>}
    {winners.map((w) => <section className="play-win-entry" key={w.player}><h3>{wind(s, w.player)}の和了</h3>{w.player === s.me ? <>
      <p>手牌・副露・リーチから自動計算します。</p>{own?.yaku?.map((y) => <div className="play-yaku-line" key={y.nm}><span>{y.nm}</span><b>{y.yakuman ? `${y.yakuman}倍役満` : `${y.han}翻`}</b></div>)}{!!own?.dora && <div className="play-yaku-line"><span>ドラ（表・裏・赤）</span><b>{own.dora}翻</b></div>}
    </> : <><p className="play-muted">リーチ・ドラを含む合計翻数を入力</p><div className="play-form-grid"><label>翻・満貫以上<select value={w.yakuman ? `y${w.yakuman}` : String(w.han)} onChange={(e) => update(w.player, e.target.value.startsWith("y") ? { yakuman: +e.target.value.slice(1) } : { han: +e.target.value, yakuman: 0 })}>{[1, 2, 3, 4, 5, 6, 8, 11, 13].map((n) => <option key={n} value={n}>{n <= 4 ? `${n}翻` : ({ 5: "満貫（5翻）", 6: "跳満（6–7翻）", 8: "倍満（8–10翻）", 11: "三倍満（11–12翻）", 13: "数え役満（13翻以上）" } as Record<number, string>)[n]}</option>)}{[1, 2, 3, 4, 5, 6].map((n) => <option key={`y${n}`} value={`y${n}`}>{n === 1 ? "役満" : `${n}倍役満`}</option>)}</select></label>{w.han < 5 && !w.yakuman && <label>符<select value={w.fu} onChange={(e) => update(w.player, { fu: +e.target.value })}>{[20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110].map((n) => <option key={n} value={n}>{n}符</option>)}</select></label>}</div>{!validScoreInput(w, method) && <p className="play-alert">この翻・符の組み合わせは成立しません。</p>}</>}</section>)}
    {includesMe && s.riichi[s.me] && <section className="play-settings-section"><h3>裏ドラ表示牌 {s.ura.length}/{s.dora.length}</h3>{!s.dora.length && <p>表ドラ表示牌を設定してから入力できます。</p>}<div className="play-tiles">{s.ura.map((i, n) => <MahjongTile key={n} i={i} small onClick={() => dispatch({ type: "INDICATOR", ura: true, tile: i, remove: n })} />)}<button disabled={s.ura.length >= s.dora.length} onClick={() => setUraMode(!uraMode)}>{uraMode ? "閉じる" : "裏ドラを追加"}</button></div>{uraMode && <TilePicker disabled={(t) => t.red || !canExpose(s, [t]) || s.ura.length >= s.dora.length} onPick={(tile) => { dispatch({ type: "INDICATOR", ura: true, tile: tile.i }); setUraMode(false); }} label="裏ドラ表示牌" />}</section>}
    {preview && <div className="play-settlement"><h3>支払いの確認</h3>{preview.details.map((d, i) => <p key={i}>{d}</p>)}{preview.delta.map((v, p) => <div key={p}><span>{wind(s, p)}</span><b className={v < 0 ? "negative" : "positive"}>{v > 0 ? "+" : ""}{points(v)}点</b></div>)}</div>}
    {error && <p className="play-muted">{error}</p>}<button className="play-primary" disabled={!preview} onClick={() => { dispatch({ type: "WIN", method, winners, extra }); close(); }}>和了を確定して精算</button>
  </>;
}
function ResultPanel({ s, dispatch }: { s: PlayState; dispatch: Dispatch }) {
  const result = s.result!;
  const [continues, setContinues] = useState(result.dealerContinues);
  return <section className="play-result"><span className="play-eyebrow">ROUND RESULT</span><h2>{result.title}</h2>{result.details.map((d, i) => <p key={i}>{d}</p>)}<table><thead><tr><th>席</th><th>移動</th><th>持ち点</th></tr></thead><tbody>{s.scores.map((v, p) => <tr key={p}><th>{wind(s, p)}</th><td className={result.delta[p] < 0 ? "negative" : "positive"}>{result.delta[p] > 0 ? "+" : ""}{points(result.delta[p])}</td><td>{points(v)}</td></tr>)}</tbody></table><label><input type="checkbox" checked={continues} onChange={(e) => setContinues(e.target.checked)} />親を継続する</label><p>次局：{result.winners.length ? continues ? s.honba + 1 : 0 : s.honba + 1}本場・供託{s.sticks}本。{continues ? "同じ席で続けます。" : `あなたは${WINDS[(s.me + 3) % 4]}家になります。`}</p><button className="play-primary" onClick={() => dispatch({ type: "NEXT", dealerContinues: continues })}>次局の準備へ</button></section>;
}
