"use client";

import { useMemo, useState } from "react";
import { AppShell } from "./app-shell";
import { GLOSSARY } from "@/lib/reference-data";

export function GlossaryPage() {
  const [query, setQuery] = useState("");
  const list = useMemo(() => GLOSSARY.filter((item) => `${item.term} ${item.reading} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())), [query]);
  const groups = [...new Set(list.map((item) => item.group))];
  return <AppShell title="麻雀用語集" subtitle="知らない言葉をここで確認"><main className="reference-page"><div className="glossary-flow"><b>点数までの流れ</b><span>和了形を作る＋役を付ける → 翻と符を数える → 親／子とロン／ツモで支払額を決める</span></div><div className="reference-tools"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="用語・読み方を検索" aria-label="用語を検索" /></div>{groups.map((group) => <section className="glossary-group" key={group}><h2>{group}</h2>{list.filter((item) => item.group === group).map((item) => <article key={item.term}><header><h3>{item.term}</h3><span>{item.reading}</span></header><p>{item.description}</p>{item.example && <small>{item.example}</small>}</article>)}</section>)}</main></AppShell>;
}
