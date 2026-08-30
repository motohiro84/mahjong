import type { Metadata } from "next";
import { YakuCatalogPage } from "@/components/yaku-catalog-page";

export const metadata: Metadata = { title: "全役一覧" };
export default function YakuPage() { return <YakuCatalogPage />; }
