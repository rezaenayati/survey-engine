import { NextRequest } from 'next/server';
import { createClient, getUserIdFromRequest } from '@/lib/survey-engine';
import { SurveyEngineError, type UpdateResponseInput } from 'survey-engine-sdk';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const client = createClient(getUserIdFromRequest(request));
        const raw: unknown = await request.json();
        const body = raw as UpdateResponseInput;
        return Response.json(await client.responses.update(id, body));
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
