import { NextRequest } from 'next/server';
import { apiRouteErrorResponse } from '@/lib/survey-engine-error-response';
import { createClient, getUserIdFromRequest } from '@/lib/survey-engine';
import type { UpdateResponseInput } from 'survey-engine-sdk';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const client = createClient(getUserIdFromRequest(request));
        const raw: unknown = await request.json();
        const body = raw as UpdateResponseInput;
        return Response.json(await client.responses.update(id, body));
    } catch (err) {
        return apiRouteErrorResponse(err);
    }
}
