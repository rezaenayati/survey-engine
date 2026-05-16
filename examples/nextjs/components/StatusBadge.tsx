const styles = {
    draft: 'bg-amber-50  text-amber-700  ring-amber-200',
    published: 'bg-green-50  text-green-700  ring-green-200',
    archived: 'bg-gray-100  text-gray-500   ring-gray-200',
} as const;

export function StatusBadge({ status }: { status: string }) {
    const cls = styles[status as keyof typeof styles] ?? styles.draft;
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${cls}`}
        >
            {status}
        </span>
    );
}
