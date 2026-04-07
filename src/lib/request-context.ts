import { headers } from 'next/headers';

export async function getRequestId(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get('x-request-id') || 'no-request-id';
}
