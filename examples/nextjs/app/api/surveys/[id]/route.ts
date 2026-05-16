import { NextRequest } from 'next/server';
import { apiRouteErrorResponse } from '@/lib/survey-engine-error-response';
import { createClient, getUserIdFromRequest } from '@/lib/survey-engine';
import type { UpdateSurveyInput } from 'survey-engine-sdk';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const client = createClient(getUserIdFromRequest(request));
        return Response.json(await client.surveys.get(id));
    } catch (err) {
        return handleError(err);
    }
}

export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const client = createClient(getUserIdFromRequest(request));
        const raw: unknown = await request.json();
        const body = raw as UpdateSurveyInput;
        return Response.json(await client.surveys.update(id, body));
    } catch (err) {
        return handleError(err);
    }
}

export async function DELETE(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const client = createClient(getUserIdFromRequest(request));
        await client.surveys.delete(id);
        return new Response(null, { status: 204 });
    } catch (err) {
        return handleError(err);
    }
}

function handleError(err: unknown): Response {
    return apiRouteErrorResponse(err);
}
