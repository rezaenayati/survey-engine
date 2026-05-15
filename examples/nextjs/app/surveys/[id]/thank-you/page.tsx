import Link from 'next/link';

export default function ThankYouPage() {
  return (
    <div className="max-w-md mx-auto px-4 text-center py-20">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Thank you!</h1>
      <p className="text-gray-500 text-sm mb-8">Your response has been recorded successfully.</p>
      <Link
        href="/"
        className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
      >
        ← Back to surveys
      </Link>
    </div>
  );
}
