import { NextRequest } from 'next/server';
import { surveyEngineErrorToResponse } from '@/lib/survey-engine-error-response';
import { createClient, getUserIdFromRequest } from '@/lib/survey-engine';
import { SurveyEngineError } from 'survey-engine-sdk';

function optionalFormString(form: FormData, key: string): string | undefined {
    const v = form.get(key);
    return typeof v === 'string' ? v : undefined;
}

/**
 * Proxy multipart uploads to survey-engine `POST /files`.
 * The browser talks only to Next.js; credentials stay on the server.
 */
export async function POST(request: NextRequest) {
    try {
        const userId = getUserIdFromRequest(request);
        const client = createClient(userId);
        const form = await request.formData();

        const entry = form.get('file');
        if (!(entry instanceof File)) {
            return Response.json(
                { message: 'Expected multipart field "file"' },
                { status: 400 },
            );
        }

        const surveyId = optionalFormString(form, 'surveyId');
        const questionId = optionalFormString(form, 'questionId');

        const uploaded = await client.files.upload(entry, {
            filename: entry.name,
            surveyId: surveyId || undefined,
            questionId: questionId || undefined,
        });

        return Response.json(uploaded, { status: 201 });
    } catch (err) {
        if (err instanceof SurveyEngineError) {
            return surveyEngineErrorToResponse(err);
        }
        console.error(err);
        return Response.json({ message: 'Upload failed' }, { status: 500 });
    }
}
