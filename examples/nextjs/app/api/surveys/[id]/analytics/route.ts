import { NextRequest } from 'next/server';
import { apiRouteErrorResponse } from '@/lib/survey-engine-error-response';
import { createClient, getUserIdFromRequest } from '@/lib/survey-engine';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const client = createClient(getUserIdFromRequest(request));
        return Response.json(await client.surveys.getAnalytics(id));
    } catch (err) {
        return apiRouteErrorResponse(err);
    }
}
