# @survey-engine/sdk

TypeScript SDK for the [Survey Engine](https://github.com/your-org/survey-engine) API.

Provides a typed HTTP client and shared TypeScript types for survey schemas, logic rules, and API responses.

## Install

```bash
npm install @survey-engine/sdk
```

## Usage

```typescript
import { SurveyEngineClient } from '@survey-engine/sdk';

const client = new SurveyEngineClient({
  baseUrl: 'http://survey-engine:3000',
  userId: currentUser.id, // forwarded as X-User-ID — optional
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

// Publish it (creates an immutable version)
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
  await client.responses.update(response.id, { answersJson: surveyModel.data });
  await client.responses.complete(response.id);
});
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
  // ... etc.
} from '@survey-engine/sdk';
```

## Error handling

```typescript
import { SurveyEngineClient, SurveyEngineError } from '@survey-engine/sdk';

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
