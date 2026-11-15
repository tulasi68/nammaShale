import type { Metadata } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { institutionConfig } from "@/lib/config";
export const metadata: Metadata = {
  title: `${institutionConfig.name} | ${institutionConfig.nameKannada}`,
  description: institutionConfig.tagline,
  applicationName: institutionConfig.name,
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="min-h-screen bg-[#f6f8f7] text-slate-900 antialiased">{children}<BottomNav/></body></html>;
}
