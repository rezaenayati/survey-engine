'use client';

import { useEffect, useRef, useState } from 'react';
import { SurveyCreator, SurveyCreatorComponent } from 'survey-creator-react';
import 'survey-core/survey-core.min.css';
import 'survey-creator-core/survey-creator-core.min.css';
import { getDemoUser } from '@/lib/api';

interface Props {
    surveyId: string;
    initialSchema: object;
    /** Called after every successful auto-save */
    onSaved?: () => void;
    onSaveError?: () => void;
}

/**
 * Wraps the SurveyJS Creator (drag-and-drop survey builder).
 *
 * Auto-saves to survey-engine on every change via saveSurveyFunc.
 * Built-in tabs: Designer · Preview · Logic · JSON Editor
 */
export function SurveyCreatorWidget({
    surveyId,
    initialSchema,
    onSaved,
    onSaveError,
}: Props) {
    const [creator, setCreator] = useState<SurveyCreator | null>(null);
    const onSavedRef = useRef(onSaved);
    const onSaveErrorRef = useRef(onSaveError);

    useEffect(() => {
        onSavedRef.current = onSaved;
    }, [onSaved]);
    useEffect(() => {
        onSaveErrorRef.current = onSaveError;
    }, [onSaveError]);

    useEffect(() => {
        const c = new SurveyCreator({
            showLogicTab: true,
            showTranslationTab: false,
            showJSONEditorTab: true,
            isAutoSave: true,
        });

        // Load the current draft schema into the Creator
        c.JSON = initialSchema;

        // Hook the Creator's save action into survey-engine's PATCH endpoint
        c.saveSurveyFunc = (
            saveNo: number,
            callback: (no: number, success: boolean) => void,
        ) => {
            fetch(`/api/surveys/${surveyId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-demo-user': getDemoUser(),
                },
                body: JSON.stringify({
                    schemaJson: c.JSON as Record<string, unknown>,
                }),
            })
                .then((r) => {
                    if (r.ok) {
                        callback(saveNo, true);
                        onSavedRef.current?.();
                    } else {
                        callback(saveNo, false);
                        onSaveErrorRef.current?.();
                    }
                })
                .catch(() => {
                    callback(saveNo, false);
                    onSaveErrorRef.current?.();
                });
        };

        setCreator(c);

        return () => {
            setCreator(null);
        };
    }, [surveyId]);

    if (!creator) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return <SurveyCreatorComponent creator={creator} />;
}
