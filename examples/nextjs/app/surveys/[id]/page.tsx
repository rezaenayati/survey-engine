import { createClient } from '@/lib/survey-engine';
import { TakeSurveyClient } from './TakeSurveyClient';
import { notFound } from 'next/navigation';

type Props = { params: Promise<{ id: string }> };

export default async function TakeSurveyPage({ params }: Props) {
    const { id } = await params;

    try {
        const client = createClient('anonymous');
        const version = await client.surveys.getRuntime(id);
        const survey = await client.surveys.get(id);

        return (
            <div className="max-w-2xl mx-auto px-4 py-8">
                <div className="mb-6">
                    <h1 className="text-xl font-bold text-gray-900">
                        {survey.name}
                    </h1>
                    {survey.description && (
                        <p className="mt-1 text-sm text-gray-500">
                            {survey.description}
                        </p>
                    )}
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <TakeSurveyClient
                        surveyId={id}
                        schema={version.schemaJson}
                    />
                </div>
            </div>
        );
    } catch {
        notFound();
    }
}
