import React, { useState } from 'react';
import SurveyWidget from './SurveyWidget';

/**
 * Set SURVEY_ID to the ID returned by the seed script:
 *   cd examples/express-backend && npm run seed
 */
const SURVEY_ID = import.meta.env.VITE_SURVEY_ID ?? 'REPLACE_WITH_SURVEY_ID';

export default function App() {
  const [completedResponseId, setCompletedResponseId] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 4 }}>Survey Engine — React Example</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: '0.9rem' }}>
        Survey ID: <code>{SURVEY_ID}</code>
        &nbsp;·&nbsp;
        Set your user ID:{' '}
        <button
          style={{ fontSize: '0.85rem', cursor: 'pointer' }}
          onClick={() => {
            const id = prompt('Enter user ID (stored as auth token in this demo):');
            if (id) localStorage.setItem('userId', id);
          }}
        >
          {localStorage.getItem('userId') ?? '(anonymous)'}
        </button>
      </p>

      {completedResponseId ? (
        <div>
          <p style={{ color: 'green' }}>
            Submitted! Response ID: <code>{completedResponseId}</code>
          </p>
          <button onClick={() => setCompletedResponseId(null)}>Take it again</button>
        </div>
      ) : (
        <SurveyWidget
          surveyId={SURVEY_ID}
          onComplete={(responseId) => setCompletedResponseId(responseId)}
        />
      )}
    </div>
  );
}
