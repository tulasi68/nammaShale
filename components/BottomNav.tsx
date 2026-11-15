"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, School, GraduationCap, HandHeart, Users } from "lucide-react";
import clsx from "clsx";
const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/school", label: "School", icon: School },
  { href: "/students", label: "Students", icon: GraduationCap },
  { href: "/javabdari", label: "Javabdari", icon: HandHeart },
  { href: "/partnerships", label: "Partners", icon: Users },
];
export function BottomNav() {
  const pathname = usePathname();
  if (pathname?.startsWith("/login")) return null;
  return <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur pb-safe"><div className="mx-auto max-w-6xl flex justify-around items-center h-16 px-1">{navItems.map(item=>{const active=pathname===item.href||(item.href!=="/"&&pathname?.startsWith(item.href));const Icon=item.icon;return <Link key={item.href} href={item.href} className={clsx("flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] sm:text-xs font-medium transition-colors",active?"text-emerald-700":"text-slate-500 hover:text-slate-800")}><Icon size={20} strokeWidth={active?2.5:2}/><span>{item.label}</span></Link>})}</div></nav>;
}
