'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRef, useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageBubble } from '@/components/chat/message-bubble';
import type { UIMessage } from 'ai';

export function ChatInterface({
  conversationId,
  initialMessages,
}: {
  conversationId?: string;
  initialMessages?: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
}) {
  const [convId, setConvId] = useState<string | undefined>(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build initial UIMessages from plain message objects
  const uiInitialMessages = useMemo<UIMessage[] | undefined>(() => {
    if (!initialMessages || initialMessages.length === 0) return undefined;
    return initialMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      parts: [{ type: 'text' as const, text: msg.content }],
      metadata: undefined,
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Custom fetch that captures x-conversation-id from response headers
  const customFetch = useMemo(() => {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, init);
      const newConvId = response.headers.get('x-conversation-id');
      if (newConvId && !convId) {
        setConvId(newConvId);
        window.history.replaceState(null, '', `/chat/${newConvId}`);
      }
      return response;
    };
  }, [convId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: convId ? { conversationId: convId } : undefined,
        fetch: customFetch,
      }),
    [convId, customFetch],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: convId,
    messages: uiInitialMessages,
    transport,
    onFinish: () => {
      // Conversation ID captured in customFetch above
    },
    onError: (err) => {
      console.error('[chat] Error:', err.message);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isStreaming = status === 'streaming' || status === 'submitted';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
    const text = textarea.value.trim();
    if (!text || isStreaming) return;
    textarea.value = '';
    await sendMessage({ text });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.closest('form');
      if (form) form.requestSubmit();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-gray-400">
            <p>Ask anything about your Planning Center data.</p>
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="mb-4 flex justify-start">
            <div className="rounded-lg bg-gray-100 px-4 py-3 text-gray-500">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {error && (
        <div
          className="mx-4 mb-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error.message || 'Something went wrong. Please try again.'}
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            placeholder="Ask about your church data..."
            onKeyDown={handleKeyDown}
            rows={1}
            className="min-h-[44px] flex-1 resize-none"
            disabled={isStreaming}
            aria-label="Chat message"
          />
          <Button type="submit" disabled={isStreaming}>
            {isStreaming ? '...' : 'Send'}
          </Button>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Press Enter to send, Shift+Enter for a new line
        </p>
      </form>
    </div>
  );
}
