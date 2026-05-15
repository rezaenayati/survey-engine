/**
 * SurveyWidget
 *
 * Loads a published survey from survey-engine, renders it with SurveyJS,
 * and handles progress saving + final submission.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Model } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/defaultV2.min.css';
import { api } from './surveyEngineApi';

interface SurveyWidgetProps {
  surveyId: string;
  onComplete?: (responseId: string) => void;
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; model: Model; responseId: string }
  | { phase: 'done'; responseId: string };

export default function SurveyWidget({ surveyId, onComplete }: SurveyWidgetProps) {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Fetch schema + start session in parallel
        const [schema, { responseId }] = await Promise.all([
          api.getSchema(surveyId),
          api.startResponse(surveyId),
        ]);

        if (cancelled) return;

        // 2. Build SurveyJS model from the schema
        const model = new Model(schema);

        // 3. Save progress on every page change
        model.onCurrentPageChanged.add(async (sender: Model) => {
          try {
            await api.saveProgress(surveyId, responseId, sender.data as Record<string, unknown>);
          } catch (err) {
            console.warn('Progress save failed:', err);
          }
        });

        // 4. Submit on completion
        model.onComplete.add(async (sender: Model) => {
          try {
            await api.submit(surveyId, responseId, sender.data as Record<string, unknown>);
            setState({ phase: 'done', responseId });
            onComplete?.(responseId);
          } catch (err) {
            console.error('Submission failed:', err);
            // SurveyJS completion is already shown; log the error but don't reset
          }
        });

        setState({ phase: 'ready', model, responseId });
      } catch (err) {
        if (!cancelled) {
          setState({ phase: 'error', message: String(err) });
        }
      }
    }

    void init();
    return () => { cancelled = true; };
  }, [surveyId, onComplete]);

  if (state.phase === 'loading') {
    return <p style={{ color: '#888' }}>Loading survey…</p>;
  }

  if (state.phase === 'error') {
    return (
      <div style={{ color: 'red', padding: '1rem', border: '1px solid red', borderRadius: 4 }}>
        <strong>Could not load survey</strong>
        <pre style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>{state.message}</pre>
      </div>
    );
  }

  if (state.phase === 'done') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Thank you!</h2>
        <p style={{ color: '#888', fontSize: '0.85rem' }}>Response ID: {state.responseId}</p>
      </div>
    );
  }

  return <Survey model={state.model} />;
}
