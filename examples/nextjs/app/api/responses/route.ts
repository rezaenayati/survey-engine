import { NextRequest } from 'next/server';
import { apiRouteErrorResponse } from '@/lib/survey-engine-error-response';
import { createClient, getUserIdFromRequest } from '@/lib/survey-engine';
import type { StartResponseInput } from 'survey-engine-sdk';

export async function POST(request: NextRequest) {
    try {
        const userId = getUserIdFromRequest(request);
        const client = createClient(userId);
        const raw: unknown = await request.json();
        const body = raw as StartResponseInput;
        const response = await client.responses.start({
            surveyId: body.surveyId,
            metadata: body.metadata ?? {},
        });
        return Response.json(response, { status: 201 });
    } catch (err) {
        return apiRouteErrorResponse(err);
    }
}
