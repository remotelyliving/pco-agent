'use client';

import { FileSpreadsheet, Download } from 'lucide-react';
import { formatFileSize } from '@/lib/files/types';

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
        {sizeBytes > 0 && <p className="text-xs text-gray-500">{formatFileSize(sizeBytes)}</p>}
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
        <p className="text-xs text-gray-500">{formatFileSize(sizeBytes)}</p>
      </div>
      <a
        href={`/api/files/${fileId}`}
        download={filename}
        className="flex min-h-[48px] min-w-[48px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
      >
        <Download className="h-4 w-4" />
        Download
      </a>
    </div>
  );
}
