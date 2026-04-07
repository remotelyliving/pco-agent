'use client';

import type { UIMessage } from 'ai';

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
            return (
              <div
                key={i}
                className="my-2 rounded border border-gray-200 bg-white p-2 text-sm text-gray-600"
              >
                <span className="font-medium">Tool: {part.toolName}</span>
                {part.state === 'output-available' && (
                  <div className="mt-1 text-xs text-gray-500">Done</div>
                )}
              </div>
            );
          }
          // Static tool calls — type is `tool-${toolName}`
          if (part.type.startsWith('tool-')) {
            const toolName = part.type.slice(5);
            const p = part as { type: string; state: string };
            return (
              <div
                key={i}
                className="my-2 rounded border border-gray-200 bg-white p-2 text-sm text-gray-600"
              >
                <span className="font-medium">Tool: {toolName}</span>
                {p.state === 'output-available' && (
                  <div className="mt-1 text-xs text-gray-500">Done</div>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
