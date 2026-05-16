import { NextRequest } from 'next/server';
import { createClient, getUserIdFromRequest } from '@/lib/survey-engine';
import { SurveyEngineError } from 'survey-engine-sdk';

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    const client = createClient(userId);
    const body = await request.json();
    const response = await client.responses.start({
      surveyId: body.surveyId,
      metadata: body.metadata ?? {},
    });
    return Response.json(response, { status: 201 });
  } catch (err) {
    if (err instanceof SurveyEngineError) {
      return Response.json(err.body, { status: err.status });
    }
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}
