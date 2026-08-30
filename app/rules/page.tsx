import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { MahjongTile } from "@/components/mahjong-tile";
import { RULE_SECTIONS } from "@/lib/reference-data";

export const metadata: Metadata = { title: "基本ルール" };
export default function RulesPage() {
  return <AppShell title="ルール" subtitle="牌・副露・ドラ・点数の基本"><main className="reference-page rules-page">{RULE_SECTIONS.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.examples && <div className="rule-examples">{section.examples.map((example) => <div className="rule-example" key={example.label}><span>{example.label}</span><div>{example.tiles.map((tile, index) => <MahjongTile key={`${tile}-${index}`} i={tile} red={example.red} dora={example.label === "ドラ" || example.red} tiny />)}</div></div>)}</div>}{section.boxes?.map((box, index) => <div className="rule-box" key={`${section.title}-${index}`}>{box.heading && <h3>{box.heading}</h3>}{box.lines.map((line, lineIndex) => <p key={lineIndex}>{line.term && <b>{line.term}… </b>}{line.text}</p>)}</div>)}</section>)}</main></AppShell>;
}
