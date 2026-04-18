'use client';

import type { UIMessage } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { UploadCard, DownloadCard } from '@/components/chat/file-card';

const TOOL_LABELS: Record<string, string> = {
  'list-people': 'Looking up people...',
  'get-person': 'Getting person details...',
  'search-people': 'Searching people...',
  'list-service-types': 'Checking service types...',
  'list-plans': 'Looking at service plans...',
  'get-plan': 'Getting plan details...',
  'list-team-members': 'Checking team members...',
  'list-songs': 'Looking up songs...',
};

function stripToolMarkup(text: string): string {
  // Strip complete XML-style tool call blocks (e.g. <function_calls>...</function_calls>)
  let cleaned = text.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '');
  // Strip function_response blocks
  cleaned = cleaned.replace(/<function_response>[\s\S]*?<\/function_response>/g, '');
  // Strip partial/unclosed tags that stream mid-sentence
  cleaned = cleaned.replace(/<function_calls>[\s\S]*/g, '');
  cleaned = cleaned.replace(/<function_response>[\s\S]*/g, '');
  // Strip onboarding completion signal (internal protocol, not for display)
  cleaned = cleaned.replace(/ONBOARDING_COMPLETE/g, '');
  // Clean up leftover whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

function getToolLabel(toolName: string, isDone: boolean): string {
  if (isDone) {
    const base = TOOL_LABELS[toolName]?.replace('...', '') || toolName.replace(/-/g, ' ');
    return `✓ ${base.trim()}`;
  }
  return TOOL_LABELS[toolName] || `Working on ${toolName.replace(/-/g, ' ')}...`;
}

export function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            if (isUser) {
              return (
                <div key={i} className="whitespace-pre-wrap">
                  {part.text}
                </div>
              );
            }
            const cleaned = stripToolMarkup(part.text);
            if (!cleaned) return null;
            return (
              <div key={i} className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-table:my-2 prose-code:bg-muted prose-code:px-1 prose-code:rounded">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {cleaned}
                </ReactMarkdown>
              </div>
            );
          }
          if (part.type === 'file') {
            const filePart = part as { type: 'file'; url: string; mediaType: string; filename?: string };
            return (
              <UploadCard
                key={i}
                filename={filePart.filename || 'Uploaded file'}
                sizeBytes={0}
                mediaType={filePart.mediaType}
                imageUrl={filePart.mediaType?.startsWith('image/') ? filePart.url : undefined}
              />
            );
          }
          if (part.type === 'dynamic-tool') {
            const isDone = part.state === 'output-available';
            if (isDone && part.toolName === 'create_file' && part.output) {
              const output = part.output as { fileId?: string; filename?: string; sizeBytes?: number };
              if (output.fileId) {
                return (
                  <DownloadCard key={i} fileId={output.fileId} filename={output.filename || 'download'} sizeBytes={output.sizeBytes || 0} />
                );
              }
            }
            return (
              <div
                key={i}
                className="my-2 rounded border border-border bg-card p-2 text-sm text-muted-foreground"
              >
                <span className="font-medium">{getToolLabel(part.toolName, isDone)}</span>
              </div>
            );
          }
          if (part.type.startsWith('tool-')) {
            const toolName = part.type.slice(5);
            const p = part as { type: string; state: string };
            const isDone = p.state === 'output-available';
            return (
              <div
                key={i}
                className="my-2 rounded border border-border bg-card p-2 text-sm text-muted-foreground"
              >
                <span className="font-medium">{getToolLabel(toolName, isDone)}</span>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
