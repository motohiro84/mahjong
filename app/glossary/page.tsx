import type { Metadata } from "next";
import { GlossaryPage } from "@/components/glossary-page";

export const metadata: Metadata = { title: "麻雀用語集" };
export default function GlossaryRoute() { return <GlossaryPage />; }
