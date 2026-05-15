import { cookies } from 'next/headers';
import { createClient } from '@/lib/survey-engine';
import { SurveyEditorClient } from './SurveyEditorClient';
import { notFound } from 'next/navigation';

type Props = { params: Promise<{ id: string }> };

export const revalidate = 0;

export default async function AdminSurveyPage({ params }: Props) {
  const { id } = await params;
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('demo_user')?.value ?? 'admin';
    const client = createClient(userId);
    const survey = await client.surveys.get(id);
    return <SurveyEditorClient survey={survey} />;
  } catch {
    notFound();
  }
}
