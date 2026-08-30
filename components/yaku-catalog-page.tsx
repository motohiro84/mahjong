"use client";

import { useMemo, useState } from "react";
import { AppShell } from "./app-shell";
import { MahjongTile } from "./mahjong-tile";
import { YAKU_CATALOG } from "@/lib/reference-data";

export function YakuCatalogPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const list = useMemo(() => YAKU_CATALOG.filter((item) => (filter === "all" || item.category === filter) && `${item.name} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())), [filter, query]);
  return <AppShell title="全役一覧" subtitle="一般的な日本のリーチ麻雀"><main className="reference-page"><div className="reference-tools"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="役名・条件を検索" aria-label="役を検索" /><div className="filter-row">{[["all", "すべて"], ["1", "1翻"], ["2", "2翻"], ["3plus", "3翻以上"], ["yakuman", "役満"]].map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div></div><div className="catalog-list">{list.map((item) => <article key={item.name}><header><h2>{item.name}</h2><span>{item.rule}</span><b>{item.han}</b></header><p>{item.description}</p>{item.sample ? <div><small>構成例</small><div className="sample-tiles">{item.sample.map((tile, index) => <MahjongTile key={`${tile}-${index}`} i={tile} tiny />)}</div></div> : <em>構成は自由（和了の状況・宣言で付く役）</em>}</article>)}</div><p className="note">喰いタンあり・数え役満ありを基本とした一覧です。ダブル役満やローカル役は卓のルールを確認してください。</p></main></AppShell>;
}
