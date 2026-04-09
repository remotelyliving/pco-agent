'use client';

import { FileSpreadsheet, X } from 'lucide-react';
import { formatFileSize } from '@/lib/files/types';

function truncateName(name: string, max = 30): string {
  if (name.length <= max) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0 && name.length - ext < 8) {
    const extStr = name.slice(ext);
    return name.slice(0, max - extStr.length - 3) + '...' + extStr;
  }
  return name.slice(0, max - 3) + '...';
}

interface FileChipProps {
  name: string;
  size: number;
  progress?: number;
  error?: string;
  onRemove: () => void;
}

export function FileChip({ name, size, progress, error, onRemove }: FileChipProps) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${error ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
      <FileSpreadsheet className="h-4 w-4 shrink-0 text-gray-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-700">{truncateName(name)}</p>
        <p className="text-xs text-gray-500">{formatFileSize(size)}</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {progress !== undefined && !error && (
          <div className="mt-1 h-1 w-full rounded-full bg-gray-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
            <div className="h-1 rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center text-gray-400 hover:text-gray-600"
        aria-label={`Remove ${name}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
