"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { institutionConfig } from "@/lib/config";

const API_BASE = process.env.NEXT_PUBLIC_NAMMASHALE_API_URL?.replace(/\/+$/, "");

export default function LoginPage() {
  const router = useRouter();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function handleSubmit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!API_BASE){setMessage("Secure sign-in has not been configured for this pilot yet. Please contact the school coordinator.");return;}
    setBusy(true);setMessage("");
    try {
      const response=await fetch(`${API_BASE}/v1/auth/login`,{
        method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({email:email.trim(),password})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"Sign-in failed. Check your details and try again.");
      const session=await fetch(`${API_BASE}/v1/me`,{method:"GET",credentials:"include",cache:"no-store"});
      if(!session.ok)throw new Error("Your session could not be verified. Please try signing in again.");
      router.replace("/school");router.refresh();
    } catch(error) {
      setMessage(error instanceof Error?error.message:"Unable to reach the sign-in service.");
    } finally {setBusy(false);}
  }

  return <main className="min-h-screen bg-[#f6f8f7] flex items-center justify-center px-4 py-10">
    <div className="w-full max-w-md">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-emerald-800 font-semibold mb-6"><ArrowLeft size={16}/> Back to NammaShale</Link>
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="h-12 w-12 rounded-2xl bg-emerald-700 text-white grid place-items-center text-xl font-bold">ನ</div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">{institutionConfig.name} sign in</h1>
        <p className="mt-2 text-sm text-slate-500">Use the account provided by your school or platform administrator.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div><label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email address</label><input id="email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-600" placeholder="you@example.org"/></div>
          <div><label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-600" placeholder="Your password"/></div>
          {message&&<p role="alert" className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">{message}</p>}
          <button disabled={busy} type="submit" className="w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white py-3 font-semibold text-sm flex items-center justify-center gap-2">{busy?<LoaderCircle size={17} className="animate-spin"/>:<LockKeyhole size={17}/>} {busy?"Signing in…":"Sign in securely"}</button>
        </form>
        <div className="mt-5 rounded-xl bg-emerald-50 p-3 flex gap-2 text-xs leading-relaxed text-emerald-950"><ShieldCheck size={17} className="shrink-0 mt-0.5"/><span>There is no public self-registration. School roles are assigned through an authorised institution process. Student information is not stored in this browser.</span></div>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">Kannada · English</p>
    </div>
  </main>;
}
