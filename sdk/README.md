# survey-engine-sdk

TypeScript SDK for the [Survey Engine](https://github.com/rezaenayati/survey-engine) API.

Provides a typed HTTP client and shared TypeScript types for survey schemas, logic rules, and API responses.

## Install

```bash
npm install survey-engine-sdk
```

## Usage

```typescript
import { SurveyEngineClient } from 'survey-engine-sdk';

const client = new SurveyEngineClient({
    baseUrl: 'http://survey-engine:3000',
    userId: currentUser.id, // forwarded as X-User-ID — optional
    apiKey: process.env.SURVEY_ENGINE_API_KEY, // required when API_KEY is set on the server
});

// Create a survey
const survey = await client.surveys.create({
    name: 'Customer NPS',
    schemaJson: {
        pages: [
            {
                name: 'page1',
                elements: [
                    {
                        name: 'score',
                        type: 'rating',
                        title: 'How likely are you to recommend us?',
                        rateMin: 0,
                        rateMax: 10,
                    },
                    {
                        name: 'reason',
                        type: 'comment',
                        title: 'Why did you give that score?',
                    },
                ],
            },
        ],
    },
});

// Publish it (creates an immutable version snapshot)
await client.surveys.publish(survey.id);

// --- Later, when a user opens the survey ---

// Load the schema into SurveyJS
const version = await client.surveys.getRuntime(survey.id);
const surveyModel = new Survey.Model(version.schemaJson);

// Track their response session
const response = await client.responses.start({ surveyId: survey.id });

// Save progress on page change
surveyModel.onCurrentPageChanged.add(async () => {
    await client.responses.update(response.id, {
        answersJson: surveyModel.data,
    });
});

// Submit on completion
surveyModel.onComplete.add(async () => {
    await client.responses.update(response.id, {
        answersJson: surveyModel.data,
    });
    await client.responses.complete(response.id);
});
```

## File Questions

Upload binary data through the Files API, then store the returned file reference in the response answer.

```typescript
const uploaded = await client.files.upload(file, {
    surveyId: survey.id,
    questionId: 'attachment',
    filename: file.name,
});

await client.responses.update(response.id, {
    answersJson: {
        attachment: {
            fileId: uploaded.id,
            originalName: uploaded.originalName,
            mimeType: uploaded.mimeType,
            size: uploaded.size,
            url: uploaded.url,
        },
    },
});
```

## Webhooks

Configure a webhook URL on a survey to receive signed HTTP events when responses start or complete:

```typescript
await client.surveys.update(survey.id, {
    settings: {
        webhookUrl: 'https://your-service.example.com/webhooks/survey',
        webhookSecret: process.env.WEBHOOK_SECRET, // used to sign the payload
        webhookEvents: ['response.completed'], // omit to receive all events
    },
});
```

Survey Engine POSTs to your endpoint with an `X-Survey-Engine-Signature: sha256=<hmac>` header. Verify it on the receiver:

```typescript
import { createHmac } from 'crypto';

function isValidSignature(
    body: string,
    header: string,
    secret: string,
): boolean {
    const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    return header === expected;
}
```

## Analytics

```typescript
const analytics = await client.surveys.getAnalytics(survey.id, {
    versionMode: 'combined', // aggregate across all versions
    startDate: '2026-01-01',
    endDate: '2026-12-31',
});

// Summary stats
console.log(analytics.summary.completionRate); // e.g. 72.5
console.log(analytics.summary.avgCompletionTime); // seconds

// Completion funnel
console.log(analytics.funnel.started);
console.log(analytics.funnel.completed);
console.log(analytics.funnel.abandonmentRate);

// Per-question breakdowns
for (const q of analytics.questions) {
    console.log(q.questionName, q.choices); // choice distributions for radio/checkbox
    console.log(q.average); // average for rating questions
    console.log(q.wordFrequency); // top words for text/comment questions
}

// Daily and weekly trends
for (const point of analytics.trends.daily) {
    console.log(point.date, point.count, point.completed);
}
```

## Types

All types are exported directly:

```typescript
import type {
    Survey,
    SurveyVersion,
    SurveyResponse,
    SurveySchema,
    LogicSchema,
    CreateSurveyInput,
    SurveyAnalytics,
    // ... etc.
} from 'survey-engine-sdk';
```

## Error handling

```typescript
import { SurveyEngineClient, SurveyEngineError } from 'survey-engine-sdk';

try {
    await client.surveys.get('non-existent-id');
} catch (err) {
    if (err instanceof SurveyEngineError) {
        console.error(err.status, err.body); // 404, { message: 'Survey not found' }
    }
}
```

## Using a custom fetch

Useful for Next.js, Cloudflare Workers, or test mocks:

```typescript
const client = new SurveyEngineClient({
    baseUrl: 'http://survey-engine:3000',
    fetch: myCustomFetch,
});
```
