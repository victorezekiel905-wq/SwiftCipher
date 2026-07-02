'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

type SessionState = {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
};

type DashboardPayload = {
  identity: {
    tenantId: string;
    userId: string;
    email: string;
    roles: string[];
  };
  platform: {
    tenantCount: number;
    userCount: number;
    subscriptionCount: number;
    activeSubscriptions: number;
    mrr: number;
    arr: number;
    storageIndicators: {
      reportArtifacts: number;
      auditLogCount: number;
    };
  } | null;
  tenant: {
    users: {
      total: number;
      roleBreakdown: Record<string, number>;
    };
    classes: number;
    lessons: number;
    quizzes: number;
    liveSessions: number;
    attendance: {
      records: number;
      presentRate: number;
    };
    behaviour: {
      positiveEvents: number;
      negativeEvents: number;
    };
  };
  teacher: {
    classCount: number;
    classes?: Array<{ id: string; name: string; code: string }>;
    lessonCount: number;
    quizCount: number;
    averageQuizScore: number;
    positiveBehaviourEventsIssued?: number;
    strongestStudents: Array<{ studentId: string; studentName: string; averageScore: number }>;
  } | null;
};

type ParentOverview = {
  parent: { firstName: string; lastName: string; email: string } | null;
  relationship: string | null;
  children: Array<{
    id: string;
    name: string;
    attendance: { attendanceRate: number };
    behaviour: { balance: number };
    quizPerformance: { averageScore: number };
    achievements: string[];
    badges: string[];
    insights: string[];
  }>;
  announcements: Array<{ id: string; title: string; body: string; createdAt: string }>;
};

type WorkspaceUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: Array<{ role: { slug: string } }>;
};

type CommunicationsOverview = {
  inbox: Array<{
    id: string;
    subject: string | null;
    participants: Array<{
      userId: string;
      firstName: string;
      lastName: string;
      email: string;
      roles: string[];
    }>;
    latestMessage: {
      id: string;
      senderId: string;
      body: string;
      createdAt: string;
    } | null;
    messageCount: number;
    unreadCount: number;
    createdAt: string;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    createdAt: string;
    createdBy?: { firstName: string; lastName: string; email: string } | null;
  }>;
  stories: Array<{
    id: string;
    title: string;
    createdAt: string;
    media: Array<{ type: 'image' | 'video' | 'document'; url: string; caption?: string }>;
    createdBy?: { firstName: string; lastName: string; email: string } | null;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    body: string;
    isRead: boolean;
    createdAt: string;
  }>;
  unreadNotifications: number;
};

type ReportRecord = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
const STAFF_ROLES = ['platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher', 'support_staff'];

function readSession(): SessionState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const accessToken = window.sessionStorage.getItem('classsphere_access_token');
  const refreshToken = window.sessionStorage.getItem('classsphere_refresh_token');
  const tenantId = window.sessionStorage.getItem('classsphere_tenant_id');

  if (!accessToken || !tenantId) {
    return null;
  }

  return { accessToken, refreshToken: refreshToken ?? '', tenantId };
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function MetricCard({ label, value, description }: { label: string; value: string | number; description: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur"
    >
      <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-300">{description}</p>
    </motion.div>
  );
}

async function apiRequest<T>(session: SessionState, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      'x-tenant-id': session.tenantId,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

export function DashboardClient() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [parentOverview, setParentOverview] = useState<ParentOverview | null>(null);
  const [communications, setCommunications] = useState<CommunicationsOverview | null>(null);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageSubmitting, setMessageSubmitting] = useState(false);
  const [announcementSubmitting, setAnnouncementSubmitting] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [messageStatus, setMessageStatus] = useState<string | null>(null);
  const [announcementStatus, setAnnouncementStatus] = useState<string | null>(null);
  const [reportStatus, setReportStatus] = useState<string | null>(null);

  const hasSession = Boolean(session);
  const roles = dashboard?.identity.roles ?? [];
  const canManageBroadcast = roles.some((role) => STAFF_ROLES.includes(role));
  const canGenerateRevenueReport = roles.includes('platform_owner');

  async function loadWorkspace(activeSession: SessionState) {
    const [dashboardPayload, communicationsPayload, reportPayload, userPayload] = await Promise.all([
      apiRequest<DashboardPayload>(activeSession, '/analytics/dashboard'),
      apiRequest<CommunicationsOverview>(activeSession, '/communications/overview'),
      apiRequest<ReportRecord[]>(activeSession, '/reporting'),
      apiRequest<WorkspaceUser[]>(activeSession, '/users').catch(() => []),
    ]);

    setDashboard(dashboardPayload);
    setCommunications(communicationsPayload);
    setReports(reportPayload);
    setUsers(userPayload);

    if (dashboardPayload.identity.roles.includes('parent')) {
      const parentPayload = await apiRequest<ParentOverview>(activeSession, '/parent-portal/overview');
      setParentOverview(parentPayload);
    } else {
      setParentOverview(null);
    }
  }

  useEffect(() => {
    const nextSession = readSession();
    setSession(nextSession);

    if (!nextSession) {
      setLoading(false);
      return;
    }

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        await loadWorkspace(nextSession);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const roleList = useMemo(() => dashboard?.identity.roles.join(', ') ?? 'No active session', [dashboard]);
  const availableRecipients = useMemo(
    () => users.filter((user) => user.id !== dashboard?.identity.userId),
    [users, dashboard?.identity.userId],
  );

  async function submitMessage(formData: FormData) {
    if (!session) return;
    setMessageSubmitting(true);
    setMessageStatus(null);
    setError(null);

    try {
      const participantIds = formData
        .getAll('participantIds')
        .map((entry) => String(entry))
        .filter(Boolean);

      await apiRequest(session, '/communications/threads', {
        method: 'POST',
        body: JSON.stringify({
          subject: String(formData.get('subject') ?? ''),
          body: String(formData.get('body') ?? ''),
          participantIds,
        }),
      });

      setMessageStatus('Conversation created and notifications delivered.');
      await loadWorkspace(session);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to send message');
    } finally {
      setMessageSubmitting(false);
    }
  }

  async function submitAnnouncement(formData: FormData) {
    if (!session) return;
    setAnnouncementSubmitting(true);
    setAnnouncementStatus(null);
    setError(null);

    try {
      const audienceRoles = formData
        .getAll('audienceRoles')
        .map((entry) => String(entry))
        .filter(Boolean);

      await apiRequest(session, '/communications/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: String(formData.get('title') ?? ''),
          body: String(formData.get('body') ?? ''),
          audience: audienceRoles.length ? { roles: audienceRoles } : { includeAll: true },
        }),
      });

      setAnnouncementStatus('Announcement published to the selected audience.');
      await loadWorkspace(session);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to publish announcement');
    } finally {
      setAnnouncementSubmitting(false);
    }
  }

  async function submitReport(formData: FormData) {
    if (!session) return;
    setReportSubmitting(true);
    setReportStatus(null);
    setError(null);

    try {
      await apiRequest(session, '/reporting/generate', {
        method: 'POST',
        body: JSON.stringify({
          type: String(formData.get('type') ?? ''),
        }),
      });

      setReportStatus('Report generated and stored in the reporting library.');
      await loadWorkspace(session);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to generate report');
    } finally {
      setReportSubmitting(false);
    }
  }

  async function markNotificationRead(notificationId: string) {
    if (!session) return;

    try {
      await apiRequest(session, `/communications/notifications/${notificationId}/read`, {
        method: 'PATCH',
      });
      await loadWorkspace(session);
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Unable to update notification');
    }
  }

  if (!hasSession) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <div className="rounded-[32px] border border-white/10 bg-slate-900/70 p-10 shadow-2xl backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-violet-300">ClassSphere command center</p>
          <h1 className="mt-4 text-5xl font-semibold">No authenticated workspace detected.</h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">
            Sign in with a tenant-scoped account to unlock analytics, communications, reporting, classroom activity, and
            parent engagement intelligence.
          </p>
          <div className="mt-8 flex gap-4">
            <Link href="/login" className="rounded-full bg-violet-500 px-6 py-3 font-medium text-white">
              Sign in
            </Link>
            <Link href="/" className="rounded-full border border-white/15 px-6 py-3 font-medium text-white">
              Back to overview
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="rounded-[32px] border border-white/10 bg-slate-900/65 p-8 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-violet-300">Enterprise workspace</p>
            <h1 className="mt-2 text-4xl font-semibold">Operational command dashboard</h1>
            <p className="mt-3 max-w-3xl text-slate-300">
              Live tenant analytics, parent engagement, secure communications, and on-demand reporting run from the same
              authenticated control plane.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
            Roles: {roleList}
          </div>
        </div>

        {loading ? <p className="mt-8 text-slate-300">Loading live workspace metrics...</p> : null}
        {error ? <p className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200">{error}</p> : null}

        {dashboard ? (
          <>
            <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="tenant users" value={dashboard.tenant.users.total} description="Role-aware accounts active in this tenant." />
              <MetricCard label="classes" value={dashboard.tenant.classes} description="Provisioned classrooms available for delivery." />
              <MetricCard label="lessons" value={dashboard.tenant.lessons} description="Versioned lesson studio artifacts in this tenant." />
              <MetricCard label="live sessions" value={dashboard.tenant.liveSessions} description="Scheduled and historical live classroom sessions." />
            </section>

            <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-xl font-semibold">Tenant analytics</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-sm text-slate-400">Attendance present rate</p>
                    <p className="mt-2 text-3xl font-semibold">{dashboard.tenant.attendance.presentRate}%</p>
                    <p className="mt-2 text-sm text-slate-300">{dashboard.tenant.attendance.records} attendance records analyzed.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-sm text-slate-400">Behaviour pulse</p>
                    <p className="mt-2 text-3xl font-semibold">+{dashboard.tenant.behaviour.positiveEvents}</p>
                    <p className="mt-2 text-sm text-slate-300">Positive vs {dashboard.tenant.behaviour.negativeEvents} corrective events.</p>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <p className="text-sm text-slate-400">Role distribution</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(dashboard.tenant.users.roleBreakdown).map(([role, count]) => (
                      <span key={role} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-200">
                        {role.replaceAll('_', ' ')} · {count}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-xl font-semibold">Teacher intelligence</h2>
                {dashboard.teacher ? (
                  <div className="mt-4 space-y-4">
                    <MetricCard label="teacher classes" value={dashboard.teacher.classCount} description="Classes directly linked to this educator." />
                    <MetricCard label="avg quiz score" value={`${dashboard.teacher.averageQuizScore}%`} description="Mean score across managed classrooms." />
                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                      <p className="text-sm text-slate-400">Top students</p>
                      <div className="mt-3 space-y-2">
                        {dashboard.teacher.strongestStudents.length ? (
                          dashboard.teacher.strongestStudents.map((student) => (
                            <div key={student.studentId} className="flex items-center justify-between rounded-2xl bg-white/5 px-3 py-2 text-sm text-slate-200">
                              <span>{student.studentName}</span>
                              <span>{student.averageScore}%</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-400">No teacher-linked classes detected for this account.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-slate-400">Teacher analytics appear when the signed-in user carries teacher or co-teacher roles.</p>
                )}
              </div>
            </section>

            {dashboard.platform ? (
              <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-xl font-semibold">Platform owner lens</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="tenants" value={dashboard.platform.tenantCount} description="Isolated school workspaces on the platform." />
                  <MetricCard label="mrr" value={`$${dashboard.platform.mrr}`} description="Seat-derived recurring revenue snapshot." />
                  <MetricCard label="arr" value={`$${dashboard.platform.arr}`} description="Annualized recurring revenue projection." />
                  <MetricCard label="audit logs" value={dashboard.platform.storageIndicators.auditLogCount} description="Immutable activity trail entries captured." />
                </div>
              </section>
            ) : null}

            <section className="mt-8 grid gap-6 xl:grid-cols-[1fr,1fr]">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Communications hub</h2>
                    <p className="mt-2 text-sm text-slate-400">Secure teacher, parent, and student communications with in-app notifications.</p>
                  </div>
                  <div className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-sm text-violet-200">
                    {communications?.unreadNotifications ?? 0} unread notifications
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {communications?.inbox.length ? (
                    communications.inbox.map((thread) => (
                      <div key={thread.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium text-white">{thread.subject ?? 'Conversation thread'}</p>
                            <p className="mt-1 text-sm text-slate-400">
                              {thread.participants.map((participant) => participant.firstName).join(', ')} · {thread.messageCount} messages
                            </p>
                          </div>
                          {thread.unreadCount ? (
                            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-200">
                              {thread.unreadCount} new
                            </span>
                          ) : null}
                        </div>
                        {thread.latestMessage ? (
                          <p className="mt-3 rounded-2xl bg-white/5 px-3 py-3 text-sm text-slate-200">{thread.latestMessage.body}</p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400">No message threads yet for this workspace.</p>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-xl font-semibold">Report library</h2>
                <p className="mt-2 text-sm text-slate-400">Persisted operational reports are available for administrators, teachers, and parents with audience-aware visibility.</p>
                <div className="mt-5 space-y-3">
                  {reports.length ? (
                    reports.slice(0, 8).map((report) => (
                      <div key={report.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-medium text-white">{report.type.replaceAll('_', ' ')}</p>
                            <p className="mt-1 text-sm text-slate-400">Generated {formatDate(report.createdAt)}</p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-200">
                            stored
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400">Generate the first report for this workspace.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-8 grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-xl font-semibold">Announcements and stories</h2>
                <div className="mt-5 space-y-4">
                  {communications?.announcements.map((announcement) => (
                    <div key={announcement.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">{announcement.title}</p>
                        <span className="text-xs text-slate-400">{formatDate(announcement.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-300">{announcement.body}</p>
                    </div>
                  ))}
                </div>

                {communications?.stories.length ? (
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {communications.stories.map((story) => (
                      <div key={story.id} className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/50">
                        {story.media[0]?.type === 'image' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={story.media[0].url} alt={story.title} className="h-48 w-full object-cover" />
                        ) : null}
                        <div className="p-4">
                          <p className="font-medium text-white">{story.title}</p>
                          <p className="mt-2 text-sm text-slate-400">{story.media[0]?.caption ?? 'Published story update'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-xl font-semibold">Notification tray</h2>
                <div className="mt-5 space-y-3">
                  {communications?.notifications.length ? (
                    communications.notifications.slice(0, 8).map((notification) => (
                      <div key={notification.id} className={cn('rounded-2xl border p-4', notification.isRead ? 'border-white/10 bg-slate-950/40' : 'border-violet-500/30 bg-violet-500/10')}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium text-white">{notification.title.replace(/^THREAD:[^:]+:/, '')}</p>
                            <p className="mt-1 text-sm text-slate-300">{notification.body}</p>
                            <p className="mt-2 text-xs text-slate-400">{formatDate(notification.createdAt)}</p>
                          </div>
                          {!notification.isRead ? (
                            <button onClick={() => void markNotificationRead(notification.id)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white">
                              Mark read
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400">No notifications for this user.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-8 grid gap-6 xl:grid-cols-[1fr,1fr,0.9fr]">
              <form
                className="rounded-3xl border border-white/10 bg-white/5 p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitMessage(new FormData(event.currentTarget));
                  event.currentTarget.reset();
                }}
              >
                <h2 className="text-xl font-semibold">Compose secure message</h2>
                <p className="mt-2 text-sm text-slate-400">Create a tenant-scoped conversation thread with selected users.</p>
                <div className="mt-5 space-y-3">
                  <input name="subject" placeholder="Subject" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none transition focus:border-violet-400" />
                  <textarea name="body" placeholder="Message" required rows={5} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none transition focus:border-violet-400" />
                  <select name="participantIds" required multiple className="h-44 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none transition focus:border-violet-400">
                    {availableRecipients.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName} · {user.email}
                      </option>
                    ))}
                  </select>
                  <button disabled={messageSubmitting || !availableRecipients.length} className="w-full rounded-2xl bg-violet-500 px-4 py-3 font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60">
                    {messageSubmitting ? 'Sending…' : 'Create conversation'}
                  </button>
                  {messageStatus ? <p className="text-sm text-emerald-300">{messageStatus}</p> : null}
                </div>
              </form>

              <form
                className="rounded-3xl border border-white/10 bg-white/5 p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitAnnouncement(new FormData(event.currentTarget));
                  event.currentTarget.reset();
                }}
              >
                <h2 className="text-xl font-semibold">Publish announcement</h2>
                <p className="mt-2 text-sm text-slate-400">Broadcast classroom or school-wide updates with audience targeting.</p>
                <div className="mt-5 space-y-3">
                  <input name="title" placeholder="Announcement title" required disabled={!canManageBroadcast} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none transition focus:border-violet-400 disabled:opacity-60" />
                  <textarea name="body" placeholder="Announcement body" required rows={5} disabled={!canManageBroadcast} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none transition focus:border-violet-400 disabled:opacity-60" />
                  <select name="audienceRoles" multiple disabled={!canManageBroadcast} className="h-32 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none transition focus:border-violet-400 disabled:opacity-60">
                    {['teacher', 'co_teacher', 'student', 'parent'].map((role) => (
                      <option key={role} value={role}>
                        {role.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                  <button disabled={announcementSubmitting || !canManageBroadcast} className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-medium text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                    {announcementSubmitting ? 'Publishing…' : 'Publish announcement'}
                  </button>
                  {announcementStatus ? <p className="text-sm text-emerald-300">{announcementStatus}</p> : null}
                </div>
              </form>

              <form
                className="rounded-3xl border border-white/10 bg-white/5 p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitReport(new FormData(event.currentTarget));
                }}
              >
                <h2 className="text-xl font-semibold">Generate report</h2>
                <p className="mt-2 text-sm text-slate-400">Persist an operational report that respects tenant and audience access rules.</p>
                <div className="mt-5 space-y-3">
                  <select name="type" defaultValue="tenant_overview" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none transition focus:border-violet-400">
                    <option value="tenant_overview">tenant overview</option>
                    <option value="teacher_performance">teacher performance</option>
                    <option value="student_engagement">student engagement</option>
                    <option value="parent_activity">parent activity</option>
                    {canGenerateRevenueReport ? <option value="platform_revenue">platform revenue</option> : null}
                  </select>
                  <button disabled={reportSubmitting} className="w-full rounded-2xl bg-sky-500 px-4 py-3 font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60">
                    {reportSubmitting ? 'Generating…' : 'Generate report'}
                  </button>
                  {reportStatus ? <p className="text-sm text-emerald-300">{reportStatus}</p> : null}
                </div>
              </form>
            </section>

            {parentOverview ? (
              <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-xl font-semibold">Parent portal intelligence</h2>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {parentOverview.children.map((child) => (
                    <div key={child.id} className="rounded-3xl border border-white/10 bg-slate-950/50 p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold">{child.name}</h3>
                          <p className="text-sm text-slate-400">Attendance {child.attendance.attendanceRate}% · Quiz average {child.quizPerformance.averageScore}%</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-200">
                          Behaviour balance {child.behaviour.balance}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {child.badges.map((badge) => (
                          <span key={badge} className="rounded-full bg-violet-500/15 px-3 py-1 text-sm text-violet-200">{badge}</span>
                        ))}
                        {child.achievements.map((achievement) => (
                          <span key={achievement} className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm text-emerald-200">{achievement}</span>
                        ))}
                      </div>
                      <ul className="mt-4 space-y-2 text-sm text-slate-300">
                        {child.insights.map((insight) => (
                          <li key={insight} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">{insight}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
