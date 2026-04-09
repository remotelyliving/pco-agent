import type { Metadata } from 'next';
import { SetupWizard } from '@/components/setup/setup-wizard';

export const metadata: Metadata = {
  title: 'Setup — Service Planner',
};

export default function SetupPage() {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <SetupWizard />
    </div>
  );
}
