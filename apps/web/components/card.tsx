import { ReactNode } from 'react';

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur">
      <h3 className="mb-4 text-lg font-semibold">{title}</h3>
      <div className="text-sm text-slate-300">{children}</div>
    </section>
  );
}
