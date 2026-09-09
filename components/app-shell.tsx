"use client";

import { useAppState } from "./app-provider";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/play", icon: "▶", main: "対局ナビ" },
  { href: "/", icon: "🀄", main: "手牌分析" },
  { href: "/yaku", icon: "一覧", main: "全役" },
  { href: "/rules", icon: "?", main: "ルール" },
  { href: "/glossary", icon: "あ", main: "用語" },
];

export function AppShell({ children, title, subtitle }: { children: React.ReactNode; title?: string; subtitle?: string }) {
  const pathname = usePathname();
  const { saveFailed, retrySave } = useAppState();
  return (
    <div className="app-shell">
      {title && <header className="reference-header"><h1>{title}</h1><p>{subtitle}</p></header>}
      {saveFailed && <div className="save-warning" role="alert">端末に保存できませんでした。画面を閉じると変更が失われる可能性があります。<button onClick={retrySave}>保存を再試行</button></div>}
      {children}
      <nav className="bottom-nav" aria-label="メインページ">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><b>{item.icon}</b><span>{item.main}</span></Link>;
        })}
      </nav>
    </div>
  );
}
