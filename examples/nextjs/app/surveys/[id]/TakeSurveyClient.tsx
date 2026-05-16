'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SurveyWidget } from '@/components/SurveyWidget';
import { apiFetch, jsonStringField } from '@/lib/api';

interface Props {
    surveyId: string;
    schema: object;
}

export function TakeSurveyClient({ surveyId, schema }: Props) {
    const router = useRouter();
    const responseIdRef = useRef<string | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Start a response session on mount
    useEffect(() => {
        apiFetch('/api/responses', {
            method: 'POST',
            body: JSON.stringify({
                surveyId,
                metadata: { source: 'nextjs-example' },
            }),
        })
            .then(async (r) => {
                const raw: unknown = await r.json().catch(() => ({}));
                if (!r.ok) {
                    const msg =
                        jsonStringField(raw, 'message') ??
                        `Could not start session (${r.status})`;
                    throw new Error(msg);
                }
                const id = jsonStringField(raw, 'id');
                if (!id) {
                    throw new Error('Invalid start response payload');
                }
                responseIdRef.current = id;
                setReady(true);
            })
            .catch((e: unknown) =>
                setError(
                    e instanceof Error
                        ? e.message
                        : 'Could not start your session. Please refresh and try again.',
                ),
            );
    }, [surveyId]);

    // Auto-save partial answers when respondent changes page
    const handlePageChange = useCallback(
        async (answers: Record<string, unknown>) => {
            const id = responseIdRef.current;
            if (!id) return;
            await apiFetch(`/api/responses/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ answersJson: answers }),
            }).catch(console.error);
        },
        [],
    );

    // Save final answers and mark as complete
    const handleComplete = useCallback(
        async (answers: Record<string, unknown>) => {
            const id = responseIdRef.current;
            if (!id) return;

            // Save last page of answers, then complete
            await apiFetch(`/api/responses/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ answersJson: answers }),
            }).catch(console.error);

            await apiFetch(`/api/responses/${id}/complete`, {
                method: 'POST',
            }).catch(console.error);

            router.push(`/surveys/${surveyId}/thank-you`);
        },
        [surveyId, router],
    );

    if (error) {
        return (
            <div className="p-8 text-center">
                <p className="text-red-500 text-sm">{error}</p>
            </div>
        );
    }

    if (!ready) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <SurveyWidget
            schema={schema}
            surveyId={surveyId}
            onPageChange={(answers) => {
                void handlePageChange(answers);
            }}
            onComplete={(answers) => {
                void handleComplete(answers);
            }}
        />
    );
}
