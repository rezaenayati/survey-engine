'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch, jsonStringField } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';

// SurveyJS Creator uses browser-only APIs — must be loaded client-side only
const SurveyCreatorWidget = dynamic(
    () =>
        import('@/components/SurveyCreatorWidget').then(
            (m) => m.SurveyCreatorWidget,
        ),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
        ),
    },
);

interface Survey {
    id: string;
    name: string;
    description?: string | null;
    status: string;
    draftSchemaJson?: object | null;
    settings?: object | null;
}

interface ValidationResult {
    schemaValid: boolean;
    logicValid: boolean;
    schemaErrors: unknown[];
    logicErrors: string[];
}

function parseValidationResult(raw: unknown): ValidationResult {
    if (typeof raw !== 'object' || raw === null) {
        return {
            schemaValid: false,
            logicValid: false,
            schemaErrors: [],
            logicErrors: ['Invalid validation response'],
        };
    }
    const o = raw as Record<string, unknown>;
    const logicErrorsRaw = o.logicErrors;
    const logicErrors =
        Array.isArray(logicErrorsRaw) &&
        logicErrorsRaw.every((x): x is string => typeof x === 'string')
            ? logicErrorsRaw
            : [];
    const schemaErrors = Array.isArray(o.schemaErrors) ? o.schemaErrors : [];
    return {
        schemaValid: Boolean(o.schemaValid),
        logicValid: Boolean(o.logicValid),
        schemaErrors,
        logicErrors,
    };
}

export function SurveyEditorClient({ survey }: { survey: Survey }) {
    const router = useRouter();
    const [name, setName] = useState(survey.name);
    const [description, setDescription] = useState(survey.description ?? '');
    const [webhookUrl, setWebhookUrl] = useState(
        (survey.settings as { webhookUrl?: string } | undefined)?.webhookUrl ??
            '',
    );
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [validating, setValidating] = useState(false);
    const [validation, setValidation] = useState<ValidationResult | null>(null);
    const [toast, setToast] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);

    function showToast(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    }

    async function saveMeta() {
        setSaving(true);
        try {
            const res = await apiFetch(`/api/surveys/${survey.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    name,
                    description: description || undefined,
                    ...(webhookUrl ? { settings: { webhookUrl } } : {}),
                }),
            });
            if (!res.ok) {
                const raw: unknown = await res.json();
                throw new Error(
                    jsonStringField(raw, 'message') ??
                        `Save failed (${res.status})`,
                );
            }
            showToast('Saved ✓');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    async function validateDraft() {
        setValidating(true);
        setValidation(null);
        try {
            const res = await apiFetch(`/api/surveys/${survey.id}/validate`);
            const raw: unknown = await res.json();
            setValidation(parseValidationResult(raw));
        } catch {
            showToast('Validation request failed');
        } finally {
            setValidating(false);
        }
    }

    async function publish() {
        if (
            !confirm(
                'Publish this survey? Respondents will be able to take it immediately.',
            )
        )
            return;
        setPublishing(true);
        try {
            const res = await apiFetch(`/api/surveys/${survey.id}/publish`, {
                method: 'POST',
            });
            if (!res.ok) {
                const raw: unknown = await res.json();
                throw new Error(
                    jsonStringField(raw, 'message') ??
                        `Publish failed (${res.status})`,
                );
            }
            showToast('Survey published!');
            router.refresh();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Publish failed');
        } finally {
            setPublishing(false);
        }
    }

    async function deleteSurvey() {
        if (
            !confirm(
                'Delete this survey permanently? All responses will be lost.',
            )
        )
            return;
        setDeleting(true);
        try {
            await apiFetch(`/api/surveys/${survey.id}`, { method: 'DELETE' });
            router.push('/admin');
        } catch {
            showToast('Delete failed');
            setDeleting(false);
        }
    }

    return (
        // Full-viewport layout so the Creator fills the available screen
        <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
            {/* ── Top bar ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
                <div className="flex items-center gap-3">
                    <Link
                        href="/admin"
                        className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                        ← Admin
                    </Link>
                    <span className="text-gray-300">/</span>
                    <span className="font-semibold text-gray-900 text-sm">
                        {survey.name}
                    </span>
                    <StatusBadge status={survey.status} />
                </div>
                <div className="flex items-center gap-2">
                    {survey.status === 'published' && (
                        <>
                            <Link
                                href={`/surveys/${survey.id}`}
                                target="_blank"
                                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                View live ↗
                            </Link>
                            <Link
                                href={`/admin/surveys/${survey.id}/analytics`}
                                className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                            >
                                Analytics
                            </Link>
                        </>
                    )}
                </div>
            </div>

            {/* ── Body ────────────────────────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <aside className="w-64 shrink-0 bg-white border-r border-gray-200 overflow-y-auto flex flex-col gap-4 p-4">
                    {/* Details */}
                    <section>
                        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                            Details
                        </h2>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Name
                                </label>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Description
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) =>
                                        setDescription(e.target.value)
                                    }
                                    rows={2}
                                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                />
                            </div>
                            <button
                                onClick={() => {
                                    void saveMeta();
                                }}
                                disabled={saving}
                                className="w-full py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                            >
                                {saving ? 'Saving…' : 'Save Details'}
                            </button>
                        </div>
                    </section>

                    {/* Actions */}
                    <section>
                        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                            Actions
                        </h2>
                        <div className="space-y-2">
                            <button
                                onClick={() => {
                                    void validateDraft();
                                }}
                                disabled={validating}
                                className="w-full py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                            >
                                {validating ? 'Validating…' : 'Validate Schema'}
                            </button>
                            {survey.status !== 'published' && (
                                <button
                                    onClick={() => {
                                        void publish();
                                    }}
                                    disabled={publishing}
                                    className="w-full py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                >
                                    {publishing ? 'Publishing…' : 'Publish →'}
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    void deleteSurvey();
                                }}
                                disabled={deleting}
                                className="w-full py-1.5 text-xs font-medium text-red-500 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                            >
                                {deleting ? 'Deleting…' : 'Delete Survey'}
                            </button>
                        </div>
                    </section>

                    {/* Validation result */}
                    {validation && (
                        <section
                            className={`rounded-xl border p-3 text-xs ${validation.schemaValid && validation.logicValid ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}
                        >
                            <p className="font-semibold mb-1">
                                {validation.schemaValid && validation.logicValid
                                    ? '✓ Schema is valid'
                                    : '✗ Validation failed'}
                            </p>
                            {validation.schemaErrors.map((e, i) => (
                                <p key={i}>• {String(e)}</p>
                            ))}
                            {validation.logicErrors.map((e, i) => (
                                <p key={i}>• {e}</p>
                            ))}
                        </section>
                    )}

                    {/* Settings (webhook) */}
                    <section>
                        <button
                            onClick={() => setSettingsOpen((o) => !o)}
                            className="flex items-center justify-between w-full text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"
                        >
                            <span>Webhook</span>
                            <span>{settingsOpen ? '▲' : '▼'}</span>
                        </button>
                        {settingsOpen && (
                            <div className="mt-3 space-y-2">
                                <input
                                    type="url"
                                    value={webhookUrl}
                                    onChange={(e) =>
                                        setWebhookUrl(e.target.value)
                                    }
                                    placeholder="https://your-app.com/hook"
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <p className="text-xs text-gray-400">
                                    survey-engine signs each{' '}
                                    <code className="bg-gray-100 px-0.5 rounded">
                                        response.completed
                                    </code>{' '}
                                    payload with HMAC-SHA256.
                                </p>
                                <button
                                    onClick={() => {
                                        void saveMeta();
                                    }}
                                    disabled={saving}
                                    className="w-full py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                >
                                    Save Webhook
                                </button>
                            </div>
                        )}
                    </section>

                    <p className="mt-auto text-xs text-gray-300 text-center pb-2">
                        The Creator auto-saves schema changes to survey-engine.
                    </p>
                </aside>

                {/* SurveyJS Creator — fills the remaining space */}
                <div className="flex-1 overflow-hidden">
                    <SurveyCreatorWidget
                        surveyId={survey.id}
                        initialSchema={survey.draftSchemaJson ?? {}}
                        onSaved={() => showToast('Schema auto-saved ✓')}
                        onSaveError={() =>
                            showToast(
                                'Auto-save failed — check survey-engine connection',
                            )
                        }
                    />
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50">
                    {toast}
                </div>
            )}
        </div>
    );
}
