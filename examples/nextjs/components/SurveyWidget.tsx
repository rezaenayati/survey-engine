'use client';

import { useEffect, useRef, useState } from 'react';
import { Model } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.min.css';

interface SurveyWidgetProps {
  schema: object;
  /** Called with the current answers whenever the respondent advances a page. */
  onPageChange?: (answers: Record<string, unknown>) => void;
  /** Called with the final answers when the respondent submits. */
  onComplete?: (answers: Record<string, unknown>) => void;
}

export function SurveyWidget({ schema, onPageChange, onComplete }: SurveyWidgetProps) {
  const [model, setModel] = useState<Model | null>(null);
  const onPageChangeRef = useRef(onPageChange);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => { onPageChangeRef.current = onPageChange; }, [onPageChange]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const survey = new Model(schema);

    survey.onCurrentPageChanged.add(() => {
      onPageChangeRef.current?.(survey.data as Record<string, unknown>);
    });

    survey.onComplete.add(() => {
      onCompleteRef.current?.(survey.data as Record<string, unknown>);
    });

    setModel(survey);

    return () => {
      // SurveyJS models don't need explicit cleanup, but clear state on unmount
      setModel(null);
    };
  // Re-create the model only when the schema identity changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(schema)]);

  if (!model) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <Survey model={model} />;
}
