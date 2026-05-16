import { NextRequest } from 'next/server';
import { createClient, getUserIdFromRequest } from '@/lib/survey-engine';
import { SurveyEngineError } from 'survey-engine-sdk';

export async function GET(request: NextRequest) {
  try {
    const client = createClient(getUserIdFromRequest(request));
    const { searchParams } = new URL(request.url);
    const result = await client.surveys.list({
      page: Number(searchParams.get('page') ?? 1),
      limit: Number(searchParams.get('limit') ?? 50),
      sortBy: (searchParams.get('sortBy') as never) ?? 'createdAt',
      sortOrder: (searchParams.get('sortOrder') as 'ASC' | 'DESC') ?? 'DESC',
    });
    return Response.json(result);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const client = createClient(getUserIdFromRequest(request));
    const body = await request.json();
    const survey = await client.surveys.create(body);
    return Response.json(survey, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown): Response {
  if (err instanceof SurveyEngineError) {
    return Response.json(err.body, { status: err.status });
  }
  console.error(err);
  return Response.json({ message: 'Internal server error' }, { status: 500 });
}
