/**
 * Seed script: creates and publishes a demo survey in survey-engine.
 * Run once before starting the example backend:
 *   ts-node src/seed.ts
 */

import { SurveyEngineClient } from '@survey-engine/sdk';

const client = new SurveyEngineClient({
  baseUrl: process.env.SURVEY_ENGINE_URL ?? 'http://localhost:3000',
  userId: 'seed-script',
});

async function seed() {
  console.log('Creating survey…');
  const survey = await client.surveys.create({
    name: 'Customer Feedback',
    description: 'Quick satisfaction survey',
    schemaJson: {
      pages: [
        {
          name: 'page1',
          title: 'About your experience',
          elements: [
            {
              name: 'score',
              type: 'rating',
              title: 'How satisfied are you overall?',
              rateMin: 1,
              rateMax: 10,
              isRequired: true,
            },
            {
              name: 'reason',
              type: 'comment',
              title: 'Why did you give that score?',
            },
          ],
        },
        {
          name: 'page2',
          title: 'About you',
          elements: [
            {
              name: 'role',
              type: 'radiogroup',
              title: 'What is your role?',
              isRequired: true,
              choices: [
                { value: 'developer', text: 'Developer' },
                { value: 'manager', text: 'Manager' },
                { value: 'designer', text: 'Designer' },
                { value: 'other', text: 'Other' },
              ],
            },
          ],
        },
      ],
    },
  });

  console.log(`  Created: ${survey.id} (${survey.name})`);

  console.log('Publishing…');
  const published = await client.surveys.publish(survey.id);
  console.log(`  Status:  ${published.status}`);
  console.log(`  Version: ${published.activeVersionId}`);

  console.log(`\nDone. Use this survey ID in your requests:\n  ${survey.id}`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
