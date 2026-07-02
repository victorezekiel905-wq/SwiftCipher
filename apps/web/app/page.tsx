import Link from 'next/link';

const deliveryItems = [
  {
    title: 'Lesson Studio and version history',
    body: 'Tenant-scoped lesson authoring with autosave revisions, reusable templates, collaborative editor presence, and secure asset storage.',
  },
  {
    title: 'Live classroom runtime',
    body: 'Session scheduling, secure join codes, teacher dashboard participation telemetry, and audit logging.',
  },
  {
    title: 'Communications hub',
    body: 'Secure message threads, announcements, stories, and in-app notifications for teachers, parents, and school operations.',
  },
  {
    title: 'Operational reporting',
    body: 'Tenant, teacher, student, parent, and platform revenue reports with persisted audience-aware access control.',
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-16">
      <section className="rounded-[36px] border border-white/10 bg-slate-900/70 p-10 shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-violet-300">ClassSphere SaaS · Delivery 4</p>
        <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-tight">
          Enterprise classroom engagement architecture with live lesson delivery, communications intelligence, and operational reporting.
        </h1>
        <p className="mt-6 max-w-3xl text-lg text-slate-300">
          This increment extends the multi-tenant platform baseline with a production lesson studio, tenant-safe version history,
          template publishing and instantiation, active editor presence, and MinIO-backed lesson asset storage.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link className="rounded-full bg-violet-500 px-6 py-3 font-medium text-white" href="/studio">
            Open lesson studio
          </Link>
          <Link className="rounded-full border border-white/15 px-6 py-3 font-medium text-white" href="/dashboard">
            Open control dashboard
          </Link>
          <Link className="rounded-full border border-white/15 px-6 py-3 font-medium text-white" href="/login">
            Sign in to workspace
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        {deliveryItems.map((item) => (
          <div key={item.title} className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-xl font-semibold">{item.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">{item.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
