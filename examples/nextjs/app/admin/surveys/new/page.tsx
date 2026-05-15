'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

const STARTER_TEMPLATE = {
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
};

export default function NewSurveyPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/surveys', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          schemaJson: STARTER_TEMPLATE,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Failed to create survey');
      }
      const survey = await res.json();
      router.push(`/admin/surveys/${survey.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/admin" className="text-gray-400 hover:text-gray-600 text-sm">← Admin</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">New Survey</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Survey name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Customer Satisfaction Q2"
              required
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional — visible to respondents"
              rows={2}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
            A starter <strong>Customer Feedback</strong> template will be pre-loaded. You can edit the full JSON schema on the next page.
          </p>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating…' : 'Create Survey →'}
            </button>
            <Link
              href="/admin"
              className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
