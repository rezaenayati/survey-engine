import { NextRequest } from 'next/server';
import { apiRouteErrorResponse } from '@/lib/survey-engine-error-response';
import { createClient, getUserIdFromRequest } from '@/lib/survey-engine';
import type { CreateSurveyInput } from 'survey-engine-sdk';

export async function GET(request: NextRequest) {
    try {
        const client = createClient(getUserIdFromRequest(request));
        const { searchParams } = new URL(request.url);
        const result = await client.surveys.list({
            page: Number(searchParams.get('page') ?? 1),
            limit: Number(searchParams.get('limit') ?? 50),
            sortBy: (searchParams.get('sortBy') as never) ?? 'createdAt',
            sortOrder:
                (searchParams.get('sortOrder') as 'ASC' | 'DESC') ?? 'DESC',
        });
        return Response.json(result);
    } catch (err) {
        return handleError(err);
    }
}

export async function POST(request: NextRequest) {
    try {
        const client = createClient(getUserIdFromRequest(request));
        const raw: unknown = await request.json();
        const body = raw as CreateSurveyInput;
        const survey = await client.surveys.create(body);
        return Response.json(survey, { status: 201 });
    } catch (err) {
        return handleError(err);
    }
}

function handleError(err: unknown): Response {
    return apiRouteErrorResponse(err);
}
