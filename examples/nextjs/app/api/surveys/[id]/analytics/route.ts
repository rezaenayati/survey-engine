import { NextRequest } from 'next/server';
import { createClient, getUserIdFromRequest } from '@/lib/survey-engine';
import { SurveyEngineError } from 'survey-engine-sdk';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const client = createClient(getUserIdFromRequest(request));
        return Response.json(await client.surveys.getAnalytics(id));
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
