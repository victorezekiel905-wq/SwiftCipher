'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const tenantId = String(form.get('tenantId') ?? '');

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          'x-device-label': 'web-dashboard',
        },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = await response.json();
      window.sessionStorage.setItem('classsphere_access_token', payload.accessToken);
      window.sessionStorage.setItem('classsphere_refresh_token', payload.refreshToken);
      window.sessionStorage.setItem('classsphere_tenant_id', tenantId);
      router.push('/dashboard');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-900/70 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.3em] text-violet-300">Secure tenant access</p>
        <h1 className="mt-3 text-3xl font-semibold">Sign in to ClassSphere</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          This login stores tenant-scoped session tokens in the browser session, tracks the current device, and unlocks the
          live analytics dashboards included in this delivery.
        </p>

        <div className="mt-6 space-y-4">
          <input name="tenantId" required placeholder="tenant slug" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none transition focus:border-violet-400" />
          <input name="email" required type="email" placeholder="email" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none transition focus:border-violet-400" />
          <input name="password" required type="password" placeholder="password" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none transition focus:border-violet-400" />
          <button disabled={loading} className="w-full rounded-2xl bg-violet-500 px-4 py-3 font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-70">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          <p className="font-medium text-white">Seeded demo accounts</p>
          <p className="mt-2">Tenant: <span className="text-violet-200">system</span> · owner@classsphere.local</p>
          <p>Tenant: <span className="text-violet-200">aurora-high</span> · teacher@aurora.local / parent@aurora.local / student@aurora.local</p>
          <p className="mt-2 text-slate-400">Default password for seeded demo users: <span className="text-white">ChangeMe12345!</span></p>
        </div>

        {error ? <p className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p> : null}
      </form>
    </main>
  );
}
