'use client';

import type { UIMessage } from 'ai';

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
          isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <div key={i} className="whitespace-pre-wrap">
                {part.text}
              </div>
            );
          }
          // Dynamic tool calls (e.g. from MCP tools)
          if (part.type === 'dynamic-tool') {
            const isDone = part.state === 'output-available';
            return (
              <div
                key={i}
                className="my-2 rounded border border-gray-200 bg-white p-2 text-sm text-gray-600"
              >
                <span className="font-medium">{getToolLabel(part.toolName, isDone)}</span>
              </div>
            );
          }
          // Static tool calls — type is `tool-${toolName}`
          if (part.type.startsWith('tool-')) {
            const toolName = part.type.slice(5);
            const p = part as { type: string; state: string };
            const isDone = p.state === 'output-available';
            return (
              <div
                key={i}
                className="my-2 rounded border border-gray-200 bg-white p-2 text-sm text-gray-600"
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
