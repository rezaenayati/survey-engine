'use client';

import { useEffect, useRef, useState } from 'react';
import { Model } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.min.css';
import { apiFetch } from '@/lib/api';
import { publicSurveyEngineUrl } from '@/lib/survey-engine';
import type { FileStorageProvider, UploadedFile } from 'survey-engine-sdk';

function parseUploadedFile(raw: unknown): UploadedFile {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error('Invalid upload response');
    }
    const o = raw as Record<string, unknown>;
    const storageProvider = o.storageProvider as FileStorageProvider;
    if (
        storageProvider !== 'local' &&
        storageProvider !== 's3' &&
        storageProvider !== 'firebase'
    ) {
        throw new Error('Invalid upload response');
    }
    if (typeof o.id !== 'string') throw new Error('Invalid upload response');
    if (typeof o.originalName !== 'string') {
        throw new Error('Invalid upload response');
    }
    if (typeof o.mimeType !== 'string') {
        throw new Error('Invalid upload response');
    }
    if (typeof o.size !== 'number') throw new Error('Invalid upload response');
    if (o.url !== null && typeof o.url !== 'string') {
        throw new Error('Invalid upload response');
    }
    if (typeof o.createdAt !== 'string') {
        throw new Error('Invalid upload response');
    }
    return {
        id: o.id,
        originalName: o.originalName,
        mimeType: o.mimeType,
        size: o.size,
        storageProvider,
        url: o.url,
        createdAt: o.createdAt,
    };
}

interface SurveyWidgetProps {
    schema: object;
    /** Published survey id — required for file uploads through `/api/files`. */
    surveyId?: string;
    /** Called with the current answers whenever the respondent advances a page. */
    onPageChange?: (answers: Record<string, unknown>) => void;
    /** Called with the final answers when the respondent submits. */
    onComplete?: (answers: Record<string, unknown>) => void;
}

export function SurveyWidget({
    schema,
    surveyId,
    onPageChange,
    onComplete,
}: SurveyWidgetProps) {
    const [model, setModel] = useState<Model | null>(null);
    const onPageChangeRef = useRef(onPageChange);
    const onCompleteRef = useRef(onComplete);

    useEffect(() => {
        onPageChangeRef.current = onPageChange;
    }, [onPageChange]);
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    const schemaKey = JSON.stringify(schema);

    useEffect(() => {
        const survey = new Model(schema);

        survey.onCurrentPageChanged.add(() => {
            onPageChangeRef.current?.(survey.data as Record<string, unknown>);
        });

        survey.onComplete.add(() => {
            onCompleteRef.current?.(survey.data as Record<string, unknown>);
        });

        // Store files via survey-engine (local disk / S3 / Firebase), not base64 in JSON.
        if (surveyId) {
            survey.onUploadFiles.add((sender, options) => {
                void (async () => {
                    try {
                        const uploaded: UploadedFile[] = [];
                        const forSurveyJs: { file: File; content: string }[] =
                            [];

                        for (const file of options.files) {
                            const fd = new FormData();
                            fd.append('file', file);
                            fd.append('surveyId', surveyId);
                            fd.append('questionId', options.name);

                            const res = await apiFetch('/api/files', {
                                method: 'POST',
                                body: fd,
                            });
                            if (!res.ok) {
                                const raw: unknown = await res
                                    .json()
                                    .catch(() => ({}));
                                const errBody = raw as { message?: string };
                                throw new Error(
                                    errBody.message ??
                                        `Upload failed (${res.status})`,
                                );
                            }
                            const metaRaw: unknown = await res.json();
                            const meta = parseUploadedFile(metaRaw);
                            uploaded.push(meta);

                            const previewUrl =
                                meta.url ??
                                `${publicSurveyEngineUrl}/files/${meta.id}`;
                            forSurveyJs.push({ file, content: previewUrl });
                        }

                        options.callback('success', forSurveyJs);

                        // Persist engine-safe references (fileId + metadata) for PATCH / complete validation.
                        const enriched = uploaded.map((meta, i) => {
                            const f = options.files[i];
                            const previewUrl =
                                meta.url ??
                                `${publicSurveyEngineUrl}/files/${meta.id}`;
                            return {
                                fileId: meta.id,
                                originalName: meta.originalName,
                                mimeType: meta.mimeType,
                                size: meta.size,
                                url: meta.url,
                                name: f.name,
                                type: f.type,
                                content: previewUrl,
                            };
                        });
                        sender.setValue(options.name, enriched);
                    } catch (e) {
                        options.callback(
                            'error',
                            e instanceof Error ? e.message : 'Upload failed',
                        );
                    }
                })();
            });
        }

        setModel(survey);

        return () => {
            // SurveyJS models don't need explicit cleanup, but clear state on unmount
            setModel(null);
        };
    }, [schemaKey, surveyId]);

    if (!model) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return <Survey model={model} />;
}
