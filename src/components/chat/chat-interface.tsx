'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageBubble } from '@/components/chat/message-bubble';
import type { UIMessage } from 'ai';

function friendlyErrorMessage(error: Error): string {
  const msg = error.message?.toLowerCase() || '';
  if (msg.includes('401') || (msg.includes('invalid') && msg.includes('key')) || msg.includes('authentication')) {
    return 'Your API key appears to be invalid. Check your key in Settings.';
  }
  if (msg.includes('429') || msg.includes('rate') || msg.includes('too many')) {
    return 'The AI service is busy — try again in a moment.';
  }
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused')) {
    return "Couldn't reach the AI service. Check your connection.";
  }
  if (msg.includes('expired') || msg.includes('sign out')) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export function ChatInterface({
  conversationId,
  initialMessages,
}: {
  conversationId?: string;
  initialMessages?: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
}) {
  const router = useRouter();
  const [convId, setConvId] = useState<string | undefined>(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        router.refresh(); // Refresh server components (sidebar)
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

  function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const textarea = e.currentTarget;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }

  const submitText = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }
    await sendMessage({ text: text.trim() });
  }, [isStreaming, sendMessage]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const textarea = textareaRef.current;
    if (!textarea) return;
    await submitText(textarea.value);
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
          <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-700">What can I help with?</h2>
              <p className="mt-1 text-sm text-gray-400">Try one of these, or ask your own question.</p>
            </div>
            <div className="grid gap-2 w-full max-w-md">
              {[
                "Who is volunteering this Sunday?",
                "Show me people added in the last month",
                "What songs have we played most recently?",
                "Help me plan next week's service",
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => submitText(prompt)}
                  className="rounded-lg border border-gray-200 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
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
          {friendlyErrorMessage(error)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            placeholder="Ask about your church data..."
            onKeyDown={handleKeyDown}
            onInput={handleInput}
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
