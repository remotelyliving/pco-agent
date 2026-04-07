import { signIn } from '@/lib/auth';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Planning Center Assistant
          </h1>
          <p className="mt-2 text-gray-600">
            Chat with your church data using AI. Search people, plan services,
            schedule volunteers — all through conversation.
          </p>
        </div>

        <form
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
      </div>
    </div>
  );
}
