import Link from 'next/link';
import { createClient } from '@/lib/survey-engine';
import { notFound } from 'next/navigation';

export const revalidate = 30;
type Props = { params: Promise<{ id: string }> };

export default async function AnalyticsPage({ params }: Props) {
    const { id } = await params;

    try {
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        const userId = cookieStore.get('demo_user')?.value ?? 'admin';
        const client = createClient(userId);
        const [survey, analytics] = await Promise.all([
            client.surveys.get(id),
            client.surveys.getAnalytics(id),
        ]);

        const { summary, funnel, trends, questions } = analytics;

        return (
            <div className="max-w-6xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <Link
                        href="/admin"
                        className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                        ← Admin
                    </Link>
                    <span className="text-gray-300">/</span>
                    <Link
                        href={`/admin/surveys/${id}`}
                        className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                        {survey.name}
                    </Link>
                    <span className="text-gray-300">/</span>
                    <span className="font-semibold text-gray-900">
                        Analytics
                    </span>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
                    <StatCard
                        label="Total Responses"
                        value={summary.totalResponses}
                    />
                    <StatCard
                        label="Completed"
                        value={summary.completedResponses}
                    />
                    <StatCard
                        label="Completion Rate"
                        value={`${summary.completionRate}%`}
                        highlight
                    />
                    <StatCard
                        label="Avg. Time (sec)"
                        value={summary.avgCompletionTime ?? '—'}
                    />
                </div>

                {/* Funnel */}
                <Section title="Response Funnel">
                    <div className="space-y-3">
                        <FunnelBar
                            label="Started"
                            count={funnel.started}
                            total={funnel.total}
                            color="bg-blue-400"
                        />
                        <FunnelBar
                            label="In Progress"
                            count={funnel.inProgress}
                            total={funnel.total}
                            color="bg-indigo-400"
                        />
                        <FunnelBar
                            label="Completed"
                            count={funnel.completed}
                            total={funnel.total}
                            color="bg-green-400"
                        />
                        <FunnelBar
                            label="Abandoned"
                            count={funnel.abandoned}
                            total={funnel.total}
                            color="bg-red-300"
                        />
                    </div>
                    <div className="mt-4 flex gap-6 text-sm text-gray-500">
                        <span>
                            Completion rate:{' '}
                            <strong className="text-gray-900">
                                {funnel.completionRate}%
                            </strong>
                        </span>
                        <span>
                            Drop-off rate:{' '}
                            <strong className="text-gray-900">
                                {funnel.dropOffRate}%
                            </strong>
                        </span>
                        <span>
                            Stale:{' '}
                            <strong className="text-gray-900">
                                {funnel.staleResponses}
                            </strong>
                        </span>
                    </div>
                </Section>

                {/* Daily trend */}
                {trends.daily.length > 0 && (
                    <Section title="Daily Responses">
                        <TrendChart data={trends.daily} />
                    </Section>
                )}

                {/* Question analytics */}
                {questions.length > 0 && (
                    <Section title="Question Breakdown">
                        <div className="space-y-6">
                            {questions.map((q) => (
                                <div key={q.questionId}>
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <p className="font-medium text-sm text-gray-900">
                                                {q.questionTitle}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {q.questionType} ·{' '}
                                                {q.totalAnswers} answered ·{' '}
                                                {q.skipped} skipped
                                                {q.isLegacy ? ' · legacy' : ''}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Choice / boolean distribution */}
                                    {q.distribution &&
                                        q.distribution.length > 0 && (
                                            <div className="space-y-2">
                                                {q.distribution
                                                    .slice(0, 8)
                                                    .map((d) => (
                                                        <div
                                                            key={d.value}
                                                            className="flex items-center gap-3 text-sm"
                                                        >
                                                            <span className="w-28 shrink-0 truncate text-gray-600 text-xs">
                                                                {d.label}
                                                            </span>
                                                            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                                                                <div
                                                                    className="h-2 bg-indigo-400 rounded-full transition-all"
                                                                    style={{
                                                                        width: `${d.percentage}%`,
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="text-xs text-gray-500 w-12 text-right">
                                                                {d.count} (
                                                                {d.percentage}%)
                                                            </span>
                                                        </div>
                                                    ))}
                                            </div>
                                        )}

                                    {/* Rating stats */}
                                    {q.average !== undefined && (
                                        <div className="flex gap-6 text-sm text-gray-500">
                                            <span>
                                                Average:{' '}
                                                <strong className="text-gray-900">
                                                    {q.average}
                                                </strong>
                                            </span>
                                            {q.median !== undefined && (
                                                <span>
                                                    Median:{' '}
                                                    <strong className="text-gray-900">
                                                        {q.median}
                                                    </strong>
                                                </span>
                                            )}
                                            {q.min !== undefined && (
                                                <span>
                                                    Min:{' '}
                                                    <strong className="text-gray-900">
                                                        {q.min}
                                                    </strong>
                                                </span>
                                            )}
                                            {q.max !== undefined && (
                                                <span>
                                                    Max:{' '}
                                                    <strong className="text-gray-900">
                                                        {q.max}
                                                    </strong>
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Word frequency */}
                                    {q.wordFrequency &&
                                        q.wordFrequency.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {q.wordFrequency
                                                    .slice(0, 15)
                                                    .map((w) => (
                                                        <span
                                                            key={w.word}
                                                            className="px-2 py-0.5 text-xs bg-indigo-50 text-indigo-700 rounded-full"
                                                        >
                                                            {w.word}{' '}
                                                            <span className="text-indigo-400">
                                                                ×{w.count}
                                                            </span>
                                                        </span>
                                                    ))}
                                            </div>
                                        )}
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                <p className="text-xs text-gray-400 text-right mt-6">
                    Generated at{' '}
                    {new Date(analytics.generatedAt).toLocaleString()}
                </p>
            </div>
        );
    } catch {
        notFound();
    }
}

function StatCard({
    label,
    value,
    highlight,
}: {
    label: string;
    value: string | number;
    highlight?: boolean;
}) {
    return (
        <div
            className={`rounded-xl border p-4 shadow-sm ${highlight ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200'}`}
        >
            <p
                className={`text-xs font-medium mb-1 ${highlight ? 'text-indigo-200' : 'text-gray-500'}`}
            >
                {label}
            </p>
            <p
                className={`text-2xl font-bold ${highlight ? 'text-white' : 'text-gray-900'}`}
            >
                {value}
            </p>
        </div>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
                {title}
            </h2>
            {children}
        </div>
    );
}

function FunnelBar({
    label,
    count,
    total,
    color,
}: {
    label: string;
    count: number;
    total: number;
    color: string;
}) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 text-gray-600 text-xs">{label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                    className={`h-3 ${color} rounded-full transition-all`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-xs text-gray-500 w-20 text-right">
                {count} ({pct}%)
            </span>
        </div>
    );
}

function TrendChart({
    data,
}: {
    data: { date: string; count: number; completed: number }[];
}) {
    const max = Math.max(...data.map((d) => d.count), 1);
    const W = 600;
    const H = 120;
    const pts = data.map((d, i) => ({
        x: (i / Math.max(data.length - 1, 1)) * W,
        y: H - (d.count / max) * (H - 10),
    }));
    const pathD = pts
        .map(
            (p, i) =>
                `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
        )
        .join(' ');
    const areaD = `${pathD} L ${W} ${H} L 0 ${H} Z`;

    return (
        <div className="overflow-x-auto">
            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                style={{ minWidth: 300 }}
            >
                <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                            offset="0%"
                            stopColor="rgb(99,102,241)"
                            stopOpacity="0.25"
                        />
                        <stop
                            offset="100%"
                            stopColor="rgb(99,102,241)"
                            stopOpacity="0"
                        />
                    </linearGradient>
                </defs>
                <path d={areaD} fill="url(#grad)" />
                <path
                    d={pathD}
                    stroke="rgb(99,102,241)"
                    strokeWidth="2"
                    fill="none"
                    strokeLinejoin="round"
                />
                {pts.map((p, i) => (
                    <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r="3"
                        fill="rgb(99,102,241)"
                    />
                ))}
            </svg>
            <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
                <span>{data[0]?.date}</span>
                <span>{data[data.length - 1]?.date}</span>
            </div>
        </div>
    );
}
