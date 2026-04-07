import type { Metadata } from 'next';
import { signIn } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Sign In — Planning Center Assistant',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <main className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Planning Center Assistant
          </h1>
          <p className="mt-2 text-gray-600">
            Chat with your church data using AI. Search people, plan services,
            schedule volunteers — all through conversation.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
            <p className="font-medium">Unable to sign in</p>
            <p className="mt-1">
              Something went wrong. Please try again or contact your church admin
              if this keeps happening.
            </p>
          </div>
        )}

        <form
          aria-label="Sign in"
          action={async () => {
            'use server';
            await signIn('planning-center', { redirectTo: '/chat' });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-lg font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Sign in with Planning Center
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          Uses your Planning Center account. No separate password needed.
        </p>
      </main>
    </div>
  );
}
