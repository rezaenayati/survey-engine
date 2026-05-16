import { NextRequest } from 'next/server';
import { getUserIdFromRequest } from '@/lib/survey-engine';
import { SurveyEngineError } from 'survey-engine-sdk';

const SURVEY_ENGINE_URL =
    process.env.SURVEY_ENGINE_URL ?? 'http://localhost:3000';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const userId = getUserIdFromRequest(request);
        const res = await fetch(`${SURVEY_ENGINE_URL}/surveys/${id}/validate`, {
            headers: { 'X-User-ID': userId },
        });
        const data: unknown = await res.json();
        return Response.json(data, { status: res.status });
    } catch (err) {
        if (err instanceof SurveyEngineError) {
            return Response.json(err.body, { status: err.status });
        }
        return Response.json(
            { message: 'Internal server error' },
            { status: 500 },
        );
    }
}
