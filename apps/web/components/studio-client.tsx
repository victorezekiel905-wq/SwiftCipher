'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

type SessionState = {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
};

type StudioClass = {
  id: string;
  name: string;
  code: string;
  gradeLevel?: string | null;
  school: { id: string; name: string };
};

type StudioLessonSummary = {
  id: string;
  title: string;
  description?: string | null;
  version: number;
  isTemplate: boolean;
  updatedAt: string;
  classRoom: { id: string; name: string; code: string };
  blocks: Array<{ id: string; type: string; title: string; position: number; content: Record<string, unknown> }>;
  revisions: Array<{ id: string; version: number; source: string; createdAt: string; summary?: string | null }>;
  assets?: Array<{ id: string; displayName: string; mimeType: string; createdAt: string; status?: string }>;
  editorSessions?: Array<{
    id: string;
    lastHeartbeatAt: string;
    user: { id: string; firstName: string; lastName: string; email: string };
  }>;
};

type StudioBootstrap = {
  classes: StudioClass[];
  lessons: StudioLessonSummary[];
  templates: StudioLessonSummary[];
};

type LessonDetail = StudioLessonSummary & {
  sessions: Array<{ id: string; code: string; status: string; startedAt?: string | null }>;
  assets: Array<{
    id: string;
    displayName: string;
    fileName: string;
    mimeType: string;
    status: string;
    createdAt: string;
    owner: { id: string; firstName: string; lastName: string; email: string };
  }>;
  revisions: Array<{
    id: string;
    version: number;
    source: string;
    summary?: string | null;
    createdAt: string;
    createdBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  }>;
  editorSessions: Array<{
    id: string;
    sessionKey: string;
    deviceLabel?: string | null;
    lastHeartbeatAt: string;
    user: { id: string; firstName: string; lastName: string; email: string };
  }>;
};

type BlockDraft = {
  id: string;
  type: string;
  title: string;
  contentText: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
const LESSON_BLOCK_TYPES = [
  'SLIDE',
  'PDF',
  'IMAGE',
  'VIDEO',
  'YOUTUBE',
  'WHITEBOARD',
  'POLL',
  'QUIZ',
  'DRAWING',
  'WEBSITE_EMBED',
  'CODE_EDITOR',
  'SIMULATION',
  'FILE_UPLOAD',
  'AUDIO',
  'TIMER',
  'TEACHER_NOTES',
] as const;

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

async function apiRequest<T>(session: SessionState, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'x-tenant-id': session.tenantId,
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
    body: init?.body,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function createDefaultBlock(): BlockDraft {
  return {
    id: crypto.randomUUID(),
    type: 'SLIDE',
    title: 'New block',
    contentText: JSON.stringify({ heading: 'New content' }, null, 2),
  };
}

export function StudioClient() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [bootstrap, setBootstrap] = useState<StudioBootstrap | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<LessonDetail | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');
  const [blockDrafts, setBlockDrafts] = useState<BlockDraft[]>([]);
  const [selectedClassRoomId, setSelectedClassRoomId] = useState('');
  const [createLessonTitle, setCreateLessonTitle] = useState('');
  const [createLessonDescription, setCreateLessonDescription] = useState('');
  const [templateClassRoomId, setTemplateClassRoomId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRegistrationRef = useRef<{ lessonId: string; sessionId: string } | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const sessionKeyRef = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : 'studio-session');

  const hasSession = Boolean(session);
  const lessons = bootstrap?.lessons ?? [];
  const templates = bootstrap?.templates ?? [];
  const classes = bootstrap?.classes ?? [];

  const hasInvalidJson = useMemo(() => {
    try {
      blockDrafts.forEach((block) => JSON.parse(block.contentText));
      return false;
    } catch {
      return true;
    }
  }, [blockDrafts]);

  const loadLesson = useCallback(
    async (activeSession: SessionState, lessonId: string) => {
      const lesson = await apiRequest<LessonDetail>(activeSession, `/lessons/${lessonId}`);
      setSelectedLesson(lesson);
      setSelectedLessonId(lessonId);
      setSelectedClassRoomId(lesson.classRoom.id);
      setLessonTitle(lesson.title);
      setLessonDescription(lesson.description ?? '');
      setBlockDrafts(
        lesson.blocks.map((block) => ({
          id: block.id,
          type: block.type,
          title: block.title,
          contentText: JSON.stringify(block.content, null, 2),
        })),
      );
      setDirty(false);
    },
    [],
  );

  const loadBootstrap = useCallback(
    async (activeSession: SessionState) => {
      const payload = await apiRequest<StudioBootstrap>(activeSession, '/lessons/studio/bootstrap');
      setBootstrap(payload);

      const nextSelectedLessonId = selectedLessonId && payload.lessons.some((lesson) => lesson.id === selectedLessonId)
        ? selectedLessonId
        : payload.lessons[0]?.id ?? payload.templates[0]?.id ?? null;

      if (nextSelectedLessonId) {
        await loadLesson(activeSession, nextSelectedLessonId);
      } else {
        setSelectedLesson(null);
        setSelectedLessonId(null);
        setBlockDrafts([]);
      }

      if (payload.classes[0] && !selectedClassRoomId) {
        setSelectedClassRoomId(payload.classes[0].id);
      }

      if (payload.classes[0] && !templateClassRoomId) {
        setTemplateClassRoomId(payload.classes[0].id);
      }

      if (payload.templates[0] && !selectedTemplateId) {
        setSelectedTemplateId(payload.templates[0].id);
      }
    },
    [loadLesson, selectedClassRoomId, selectedLessonId, selectedTemplateId, templateClassRoomId],
  );

  useEffect(() => {
    const activeSession = readSession();
    setSession(activeSession);

    if (!activeSession) {
      setLoading(false);
      return;
    }

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadBootstrap(activeSession);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load studio workspace');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadBootstrap]);

  useEffect(() => {
    if (!session || !selectedLessonId) {
      return;
    }

    const activeSession = session;
    const lessonId = selectedLessonId;
    let cancelled = false;

    async function register() {
      try {
        const response = await apiRequest<{ session: { id: string } }>(activeSession, `/lessons/${lessonId}/editor-sessions`, {
          method: 'POST',
          body: JSON.stringify({
            sessionKey: sessionKeyRef.current,
            deviceLabel: 'browser-studio',
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          }),
        });

        if (!cancelled) {
          sessionRegistrationRef.current = { lessonId, sessionId: response.session.id };
          heartbeatTimerRef.current = window.setInterval(() => {
            const current = sessionRegistrationRef.current;
            if (!current) return;
            void apiRequest(activeSession, `/lessons/${current.lessonId}/editor-sessions/${current.sessionId}/heartbeat`, {
              method: 'POST',
            }).catch(() => undefined);
          }, 20000);
        }
      } catch (registrationError) {
        if (!cancelled) {
          setError(registrationError instanceof Error ? registrationError.message : 'Unable to register editor session');
        }
      }
    }

    void register();

    return () => {
      cancelled = true;
      if (heartbeatTimerRef.current) {
        window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }

      const current = sessionRegistrationRef.current;
      if (current && current.lessonId === lessonId) {
        void apiRequest(activeSession, `/lessons/${current.lessonId}/editor-sessions/${current.sessionId}`, {
          method: 'DELETE',
        }).catch(() => undefined);
        sessionRegistrationRef.current = null;
      }
    };
  }, [session, selectedLessonId]);

  useEffect(() => {
    if (!session || !selectedLessonId || !dirty) {
      return;
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      void saveLesson('autosave');
    }, 2500);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [blockDrafts, dirty, lessonDescription, lessonTitle, selectedClassRoomId, selectedLessonId, session]);

  const lessonMetrics = useMemo(() => {
    if (!selectedLesson) {
      return null;
    }

    return {
      blockCount: blockDrafts.length,
      assetCount: selectedLesson.assets.length,
      revisionCount: selectedLesson.revisions.length,
      activeEditors: selectedLesson.editorSessions.length,
    };
  }, [blockDrafts.length, selectedLesson]);

  function buildLessonPayload() {
    return {
      title: lessonTitle,
      description: lessonDescription,
      blocks: blockDrafts.map((block) => ({
        type: block.type,
        title: block.title,
        content: JSON.parse(block.contentText),
      })),
    };
  }

  async function saveLesson(mode: 'manual' | 'autosave') {
    if (!session || !selectedLessonId) {
      return;
    }

    try {
      const payload = buildLessonPayload();
      setSaving(true);
      setError(null);
      await apiRequest(session, mode === 'manual' ? `/lessons/${selectedLessonId}` : `/lessons/${selectedLessonId}/autosave`, {
        method: mode === 'manual' ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...payload, summary: mode === 'manual' ? 'Manual save from studio' : 'Autosave from studio' }),
      });
      await loadLesson(session, selectedLessonId);
      await loadBootstrap(session);
      setStatus(mode === 'manual' ? 'Lesson saved to version history.' : 'Autosave captured.');
      setDirty(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save lesson');
    } finally {
      setSaving(false);
    }
  }

  async function createLesson() {
    if (!session || !selectedClassRoomId || !createLessonTitle.trim()) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const created = await apiRequest<LessonDetail>(session, '/lessons', {
        method: 'POST',
        body: JSON.stringify({
          classRoomId: selectedClassRoomId,
          title: createLessonTitle.trim(),
          description: createLessonDescription.trim(),
          blocks: [
            {
              type: 'SLIDE',
              title: 'Opening slide',
              content: { heading: createLessonTitle.trim(), notes: createLessonDescription.trim() },
            },
          ],
        }),
      });
      setCreateLessonTitle('');
      setCreateLessonDescription('');
      await loadBootstrap(session);
      await loadLesson(session, created.id);
      setStatus('New lesson created.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create lesson');
    } finally {
      setLoading(false);
    }
  }

  async function publishTemplate() {
    if (!session || !selectedLessonId) {
      return;
    }

    try {
      await apiRequest(session, `/lessons/${selectedLessonId}/publish-template`, {
        method: 'POST',
        body: JSON.stringify({ title: lessonTitle, description: lessonDescription }),
      });
      await loadBootstrap(session);
      await loadLesson(session, selectedLessonId);
      setStatus('Lesson published to the template library.');
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Unable to publish template');
    }
  }

  async function instantiateTemplate() {
    if (!session || !selectedTemplateId || !templateClassRoomId) {
      return;
    }

    try {
      const created = await apiRequest<LessonDetail>(session, `/lessons/templates/${selectedTemplateId}/instantiate`, {
        method: 'POST',
        body: JSON.stringify({ classRoomId: templateClassRoomId }),
      });
      await loadBootstrap(session);
      await loadLesson(session, created.id);
      setStatus('Template instantiated into the target classroom.');
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : 'Unable to instantiate template');
    }
  }

  async function restoreRevision(revisionId: string) {
    if (!session || !selectedLessonId) {
      return;
    }

    try {
      await apiRequest(session, `/lessons/${selectedLessonId}/revisions/${revisionId}/restore`, {
        method: 'POST',
      });
      await loadLesson(session, selectedLessonId);
      await loadBootstrap(session);
      setStatus('Lesson restored from version history.');
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Unable to restore revision');
    }
  }

  async function downloadAsset(assetId: string) {
    if (!session) {
      return;
    }

    try {
      const payload = await apiRequest<{ downloadUrl: string }>(session, `/storage/assets/${assetId}/download-url`);
      window.open(payload.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Unable to open asset');
    }
  }

  async function uploadAsset(file: File) {
    if (!session || !selectedLessonId) {
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const initiated = await apiRequest<{ asset: { id: string } }>(session, '/storage/assets/initiate', {
        method: 'POST',
        body: JSON.stringify({
          lessonId: selectedLessonId,
          fileName: file.name,
          displayName: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      });

      const formData = new FormData();
      formData.append('file', file);
      await apiRequest(session, `/storage/assets/${initiated.asset.id}/upload`, {
        method: 'POST',
        body: formData,
      });

      await loadLesson(session, selectedLessonId);
      setStatus(`${file.name} uploaded to lesson storage.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload asset');
    } finally {
      setUploading(false);
    }
  }

  if (!hasSession) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <div className="rounded-[36px] border border-white/10 bg-slate-900/70 p-10 shadow-2xl backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">ClassSphere lesson studio</p>
          <h1 className="mt-4 text-5xl font-semibold">Sign in to continue authoring.</h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">
            The studio unlocks tenant-safe version history, template workflows, asset storage, and collaborative editing presence.
          </p>
          <div className="mt-8 flex gap-4">
            <Link href="/login" className="rounded-full bg-cyan-500 px-6 py-3 font-medium text-slate-950">
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
    <main className="mx-auto max-w-[1700px] px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 rounded-[36px] border border-white/10 bg-slate-900/65 p-8 shadow-2xl backdrop-blur xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">ClassSphere SaaS · Delivery 4</p>
          <h1 className="mt-3 text-4xl font-semibold">Lesson Studio</h1>
          <p className="mt-3 max-w-3xl text-slate-300">
            Enterprise lesson authoring with autosave revisions, reusable templates, secure object storage, and live editor presence.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white">
            Command dashboard
          </Link>
          <button
            type="button"
            onClick={() => void saveLesson('manual')}
            disabled={!selectedLessonId || saving || hasInvalidJson}
            className="rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save lesson'}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
        {status ? <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-emerald-200">{status}</span> : null}
        {error ? <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-rose-200">{error}</span> : null}
        {dirty && !saving ? <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-amber-200">Unsaved changes</span> : null}
        {hasInvalidJson ? <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-rose-200">Block JSON must be valid before saving</span> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
        <section className="space-y-6">
          <div className="rounded-[28px] border border-white/10 bg-slate-900/65 p-6 backdrop-blur">
            <h2 className="text-lg font-semibold">Create lesson</h2>
            <div className="mt-4 space-y-3">
              <select
                value={selectedClassRoomId}
                onChange={(event) => setSelectedClassRoomId(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
              >
                {classes.map((classRoom) => (
                  <option key={classRoom.id} value={classRoom.id}>
                    {classRoom.name} · {classRoom.code}
                  </option>
                ))}
              </select>
              <input
                value={createLessonTitle}
                onChange={(event) => setCreateLessonTitle(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
                placeholder="Lesson title"
              />
              <textarea
                value={createLessonDescription}
                onChange={(event) => setCreateLessonDescription(event.target.value)}
                className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
                placeholder="Lesson description"
              />
              <button
                type="button"
                onClick={() => void createLesson()}
                disabled={!createLessonTitle.trim() || loading}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create studio lesson
              </button>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-900/65 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Workspace lessons</h2>
              <span className="text-xs uppercase tracking-[0.25em] text-slate-400">{lessons.length}</span>
            </div>
            <div className="mt-4 space-y-3">
              {lessons.map((lesson) => (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => session && void loadLesson(session, lesson.id)}
                  className={cn(
                    'w-full rounded-3xl border px-4 py-4 text-left transition',
                    selectedLessonId === lesson.id
                      ? 'border-cyan-300/40 bg-cyan-400/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{lesson.title}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">{lesson.classRoom.name}</p>
                    </div>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">v{lesson.version}</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-slate-300">{lesson.description || 'No description provided yet.'}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-900/65 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Template library</h2>
              <span className="text-xs uppercase tracking-[0.25em] text-slate-400">{templates.length}</span>
            </div>
            <div className="mt-4 space-y-3">
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
              <select
                value={templateClassRoomId}
                onChange={(event) => setTemplateClassRoomId(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
              >
                {classes.map((classRoom) => (
                  <option key={classRoom.id} value={classRoom.id}>
                    {classRoom.name} · {classRoom.code}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void instantiateTemplate()}
                disabled={!selectedTemplateId || !templateClassRoomId}
                className="w-full rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Instantiate template into classroom
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-[32px] border border-white/10 bg-slate-900/65 p-6 backdrop-blur">
            {loading ? (
              <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center text-slate-300">Loading studio…</div>
            ) : !selectedLesson ? (
              <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center text-slate-300">
                Create or select a lesson to start authoring.
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                    <label className="text-xs uppercase tracking-[0.25em] text-slate-400">Lesson title</label>
                    <input
                      value={lessonTitle}
                      onChange={(event) => {
                        setLessonTitle(event.target.value);
                        setDirty(true);
                      }}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.25em] text-slate-400">Classroom</label>
                    <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                      {selectedLesson.classRoom.name} · {selectedLesson.classRoom.code}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-xs uppercase tracking-[0.25em] text-slate-400">Teacher notes and description</label>
                  <textarea
                    value={lessonDescription}
                    onChange={(event) => {
                      setLessonDescription(event.target.value);
                      setDirty(true);
                    }}
                    className="mt-2 min-h-[130px] w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none"
                  />
                </div>
                {lessonMetrics ? (
                  <div className="mt-5 grid gap-3 md:grid-cols-4">
                    {[
                      ['Blocks', lessonMetrics.blockCount],
                      ['Assets', lessonMetrics.assetCount],
                      ['Revisions', lessonMetrics.revisionCount],
                      ['Editors', lessonMetrics.activeEditors],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void publishTemplate()}
                    className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-5 py-2.5 text-sm font-semibold text-cyan-100"
                  >
                    Publish to template library
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlockDrafts((current) => [...current, createDefaultBlock()])}
                    className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white"
                  >
                    Add block
                  </button>
                </div>
              </>
            )}
          </div>

          {selectedLesson ? (
            <div className="space-y-4">
              {blockDrafts.map((block, index) => {
                let parseError = false;
                try {
                  JSON.parse(block.contentText);
                } catch {
                  parseError = true;
                }

                return (
                  <motion.div
                    key={block.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-[28px] border border-white/10 bg-slate-900/65 p-5 backdrop-blur"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center">
                      <div className="w-full md:max-w-[180px]">
                        <label className="text-xs uppercase tracking-[0.25em] text-slate-400">Block type</label>
                        <select
                          value={block.type}
                          onChange={(event) => {
                            setBlockDrafts((current) =>
                              current.map((entry) => (entry.id === block.id ? { ...entry, type: event.target.value } : entry)),
                            );
                            setDirty(true);
                          }}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
                        >
                          {LESSON_BLOCK_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type.replaceAll('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-xs uppercase tracking-[0.25em] text-slate-400">Block title</label>
                        <input
                          value={block.title}
                          onChange={(event) => {
                            setBlockDrafts((current) =>
                              current.map((entry) => (entry.id === block.id ? { ...entry, title: event.target.value } : entry)),
                            );
                            setDirty(true);
                          }}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none"
                        />
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center justify-between">
                        <label className="text-xs uppercase tracking-[0.25em] text-slate-400">Block content JSON</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (index === 0) return;
                              setBlockDrafts((current) => {
                                const next = [...current];
                                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                return next;
                              });
                              setDirty(true);
                            }}
                            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white"
                          >
                            Move up
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (index === blockDrafts.length - 1) return;
                              setBlockDrafts((current) => {
                                const next = [...current];
                                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                                return next;
                              });
                              setDirty(true);
                            }}
                            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white"
                          >
                            Move down
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBlockDrafts((current) => current.filter((entry) => entry.id !== block.id));
                              setDirty(true);
                            }}
                            className="rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-100"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={block.contentText}
                        onChange={(event) => {
                          setBlockDrafts((current) =>
                            current.map((entry) => (entry.id === block.id ? { ...entry, contentText: event.target.value } : entry)),
                          );
                          setDirty(true);
                        }}
                        className={cn(
                          'mt-2 min-h-[220px] w-full rounded-2xl border bg-slate-950/90 px-4 py-3 font-mono text-sm text-white outline-none',
                          parseError ? 'border-rose-400/40' : 'border-white/10',
                        )}
                      />
                      {parseError ? <p className="mt-2 text-sm text-rose-300">JSON is invalid. Fix before saving.</p> : null}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="space-y-6">
          <div className="rounded-[28px] border border-white/10 bg-slate-900/65 p-6 backdrop-blur">
            <h2 className="text-lg font-semibold">Collaborative presence</h2>
            <div className="mt-4 space-y-3">
              {(selectedLesson?.editorSessions ?? []).length ? (
                selectedLesson?.editorSessions.map((sessionEntry) => (
                  <div key={sessionEntry.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <p className="font-medium text-white">
                      {sessionEntry.user.firstName} {sessionEntry.user.lastName}
                    </p>
                    <p className="mt-1 text-sm text-slate-300">{sessionEntry.user.email}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-500">
                      Active {formatDate(sessionEntry.lastHeartbeatAt)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 p-5 text-sm text-slate-300">
                  No active collaborators are present in this lesson right now.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-900/65 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Lesson assets</h2>
              <label className="cursor-pointer rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950">
                {uploading ? 'Uploading…' : 'Upload file'}
                <input
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void uploadAsset(file);
                      event.target.value = '';
                    }
                  }}
                />
              </label>
            </div>
            <div className="mt-4 space-y-3">
              {(selectedLesson?.assets ?? []).length ? (
                selectedLesson?.assets.map((asset) => (
                  <button
                    type="button"
                    key={asset.id}
                    onClick={() => void downloadAsset(asset.id)}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 p-4 text-left hover:border-white/20 hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{asset.displayName}</p>
                        <p className="mt-1 text-sm text-slate-300">{asset.mimeType}</p>
                      </div>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-200">
                        {asset.status}
                      </span>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.25em] text-slate-500">Uploaded {formatDate(asset.createdAt)}</p>
                  </button>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 p-5 text-sm text-slate-300">
                  Upload slide decks, worksheets, PDFs, media, and lesson support files into tenant-scoped object storage.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-900/65 p-6 backdrop-blur">
            <h2 className="text-lg font-semibold">Version history</h2>
            <div className="mt-4 space-y-3">
              {(selectedLesson?.revisions ?? []).length ? (
                selectedLesson?.revisions.map((revision) => (
                  <div key={revision.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">v{revision.version}</p>
                        <p className="mt-1 text-sm text-slate-300">{revision.summary || revision.source.replaceAll('_', ' ')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void restoreRevision(revision.id)}
                        className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white"
                      >
                        Restore
                      </button>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.25em] text-slate-500">
                      {revision.source.replaceAll('_', ' ')} · {formatDate(revision.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 p-5 text-sm text-slate-300">
                  Version history will populate after the first autosave or manual save.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
