"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", icon: "🀄", main: "手牌分析" },
  { href: "/yaku", icon: "一覧", main: "全役" },
  { href: "/rules", icon: "?", main: "ルール" },
  { href: "/glossary", icon: "あ", main: "用語" },
];

export function AppShell({ children, title, subtitle }: { children: React.ReactNode; title?: string; subtitle?: string }) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      {title && <header className="reference-header"><h1>{title}</h1><p>{subtitle}</p></header>}
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
