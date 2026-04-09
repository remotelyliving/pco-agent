'use client';

import { FileSpreadsheet, Download } from 'lucide-react';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadCardProps {
  filename: string;
  sizeBytes: number;
}

export function UploadCard({ filename, sizeBytes }: UploadCardProps) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 text-sm">
      <FileSpreadsheet className="h-5 w-5 shrink-0 text-green-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-700">{filename}</p>
        <p className="text-xs text-gray-500">{formatSize(sizeBytes)}</p>
      </div>
    </div>
  );
}

interface DownloadCardProps {
  fileId: string;
  filename: string;
  sizeBytes: number;
}

export function DownloadCard({ fileId, filename, sizeBytes }: DownloadCardProps) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
      <FileSpreadsheet className="h-5 w-5 shrink-0 text-blue-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-700">{filename}</p>
        <p className="text-xs text-gray-500">{formatSize(sizeBytes)}</p>
      </div>
      <a
        href={`/api/files/${fileId}`}
        download={filename}
        className="flex min-h-[48px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
      >
        <Download className="h-4 w-4" />
        Download
      </a>
    </div>
  );
}
