import Link from 'next/link';
import { createClient } from '@/lib/survey-engine';

export const revalidate = 30;

export default async function SurveyListPage() {
    // No userId → survey-engine returns all published surveys (public listing)
    const client = createClient('');
    const { data: surveys } = await client.surveys.list({
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
    });

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">
                    Available Surveys
                </h1>
                <p className="mt-1 text-gray-500 text-sm">
                    Select a survey below to share your feedback.
                </p>
            </div>

            {surveys.length === 0 ? (
                <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-gray-300">
                    <p className="text-gray-400 text-sm">
                        No published surveys yet.
                    </p>
                    <p className="text-gray-400 text-xs mt-1">
                        Go to{' '}
                        <Link
                            href="/admin"
                            className="text-indigo-500 underline"
                        >
                            Admin
                        </Link>{' '}
                        to create and publish one.
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {surveys.map((survey) => (
                        <div
                            key={survey.id}
                            className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow"
                        >
                            <div>
                                <h2 className="font-semibold text-gray-900">
                                    {survey.name}
                                </h2>
                                {survey.description && (
                                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                                        {survey.description}
                                    </p>
                                )}
                            </div>
                            <div className="mt-auto">
                                <Link
                                    href={`/surveys/${survey.id}`}
                                    className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                                >
                                    Take Survey →
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
