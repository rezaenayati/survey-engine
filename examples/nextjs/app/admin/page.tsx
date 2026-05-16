import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/survey-engine';
import { StatusBadge } from '@/components/StatusBadge';

export const revalidate = 0;

export default async function AdminPage() {
    const cookieStore = await cookies();
    const userId = cookieStore.get('demo_user')?.value ?? 'admin';
    const client = createClient(userId);
    const { data: surveys } = await client.surveys.list({
        limit: 100,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
    });

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Survey Management
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {surveys.length} survey{surveys.length !== 1 ? 's' : ''}{' '}
                        total
                    </p>
                </div>
                <Link
                    href="/admin/surveys/new"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                    <span>+</span> New Survey
                </Link>
            </div>

            {surveys.length === 0 ? (
                <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-gray-300">
                    <p className="text-gray-400 text-sm">No surveys yet.</p>
                    <Link
                        href="/admin/surveys/new"
                        className="text-indigo-500 underline text-sm mt-1 block"
                    >
                        Create your first survey →
                    </Link>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left px-5 py-3 font-medium text-gray-500">
                                    Name
                                </th>
                                <th className="text-left px-5 py-3 font-medium text-gray-500">
                                    Status
                                </th>
                                <th className="text-left px-5 py-3 font-medium text-gray-500">
                                    Created
                                </th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {surveys.map((survey) => (
                                <tr
                                    key={survey.id}
                                    className="hover:bg-gray-50 transition-colors"
                                >
                                    <td className="px-5 py-3.5">
                                        <p className="font-medium text-gray-900">
                                            {survey.name}
                                        </p>
                                        {survey.description && (
                                            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                                                {survey.description}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <StatusBadge status={survey.status} />
                                    </td>
                                    <td className="px-5 py-3.5 text-gray-400">
                                        {new Date(
                                            survey.createdAt,
                                        ).toLocaleDateString()}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center justify-end gap-2">
                                            {survey.status === 'published' && (
                                                <Link
                                                    href={`/admin/surveys/${survey.id}/analytics`}
                                                    className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium transition-colors"
                                                >
                                                    Analytics
                                                </Link>
                                            )}
                                            <Link
                                                href={`/admin/surveys/${survey.id}`}
                                                className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium transition-colors"
                                            >
                                                Edit
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
