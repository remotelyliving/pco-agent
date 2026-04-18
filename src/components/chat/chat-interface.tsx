'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageBubble } from '@/components/chat/message-bubble';
import { Paperclip } from 'lucide-react';
import { FileChip } from '@/components/chat/file-chip';
import { ALLOWED_EXTENSIONS, DATA_EXTENSIONS, IMAGE_EXTENSIONS, MAX_FILE_SIZE_BYTES, MAX_IMAGE_SIZE_BYTES, MAX_FILES_PER_MESSAGE } from '@/lib/files/types';
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
  onboardingComplete = true,
}: {
  conversationId?: string;
  initialMessages?: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
  onboardingComplete?: boolean;
}) {
  const router = useRouter();
  const convIdRef = useRef<string | undefined>(conversationId);
  const [convId, setConvId] = useState<string | undefined>(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Stable chat instance ID — set once so useChat never resets mid-stream
  const [chatId] = useState(() => conversationId ?? crypto.randomUUID());

  // Build initial UIMessages from plain message objects — only computed once from initial prop
  const [uiInitialMessages] = useState<UIMessage[] | undefined>(() => {
    if (!initialMessages || initialMessages.length === 0) return undefined;
    return initialMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      parts: [{ type: 'text' as const, text: msg.content }],
      metadata: undefined,
    }));
  });

  // Custom fetch that captures x-conversation-id from response headers.
  // Uses a ref for convId so this callback never changes and doesn't reset useChat.
  const customFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, init);
      const newConvId = response.headers.get('x-conversation-id');
      if (newConvId && !convIdRef.current) {
        convIdRef.current = newConvId;
        setConvId(newConvId);
        window.history.replaceState(null, '', `/chat/${newConvId}`);
      }
      return response;
    },
    [],
  );

  // Transport reads convId from ref at call time — no dependency on convId state
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: () => (convIdRef.current ? { conversationId: convIdRef.current } : {}),
        fetch: customFetch,
      }),
    [customFetch],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: chatId,
    messages: uiInitialMessages,
    transport,
    onFinish: () => {
      // Refresh sidebar to show new conversation + auto-generated title
      router.refresh();
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; error?: string; progress?: number }>>([]);
  const [consentDismissed, setConsentDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('file-upload-consent-dismissed') === 'true';
  });

  function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const textarea = e.currentTarget;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const newFiles: typeof pendingFiles = [];
    for (const file of files) {
      if (pendingFiles.length + newFiles.length >= MAX_FILES_PER_MESSAGE) {
        newFiles.push({ file, error: 'You can attach up to 3 files at a time.' });
        break;
      }
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
        newFiles.push({ file, error: "This file type isn't supported. You can upload spreadsheets (CSV, Excel) or images (JPG, PNG)." });
        continue;
      }
      const isImage = (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
      if (isImage && file.size > MAX_IMAGE_SIZE_BYTES) {
        newFiles.push({ file, error: 'This image is too large. The maximum for images is 5 MB.' });
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        newFiles.push({ file, error: 'This file is too large. The maximum is 10 MB.' });
        continue;
      }
      newFiles.push({ file });
    }
    setPendingFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function dismissConsent() {
    setConsentDismissed(true);
    localStorage.setItem('file-upload-consent-dismissed', 'true');
  }

  const uploadFiles = useCallback(async (targetConvId: string): Promise<Array<{ type: 'file'; url: string; mediaType: string; filename: string }>> => {
    const validFiles = pendingFiles.filter((pf) => !pf.error);
    const uploaded: Array<{ type: 'file'; url: string; mediaType: string; filename: string }> = [];
    for (let i = 0; i < validFiles.length; i++) {
      const pf = validFiles[i];
      setPendingFiles((prev) => prev.map((f) => (f.file === pf.file ? { ...f, progress: 0 } : f)));
      const formData = new FormData();
      formData.append('file', pf.file);
      formData.append('conversationId', targetConvId);
      try {
        const res = await fetch('/api/files', { method: 'POST', body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Upload failed' }));
          setPendingFiles((prev) => prev.map((f) => (f.file === pf.file ? { ...f, error: err.error, progress: undefined } : f)));
          continue;
        }
        const data = await res.json();
        setPendingFiles((prev) => prev.map((f) => (f.file === pf.file ? { ...f, progress: 100 } : f)));
        uploaded.push({ type: 'file', url: `/api/files/${data.fileId}`, mediaType: data.mediaType, filename: data.filename });
      } catch {
        setPendingFiles((prev) => prev.map((f) => (f.file === pf.file ? { ...f, error: 'Upload failed. Please try again.', progress: undefined } : f)));
      }
    }
    return uploaded;
  }, [pendingFiles]);

  const [uploading, setUploading] = useState(false);

  const submitText = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming || uploading) return;
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }

    const validFiles = pendingFiles.filter((pf) => !pf.error);

    if (validFiles.length > 0) {
      setUploading(true);
      try {
        // Ensure we have a conversation ID before uploading files
        let targetConvId = convIdRef.current;
        if (!targetConvId) {
          const res = await fetch('/api/conversations', { method: 'POST' });
          if (!res.ok) throw new Error('Failed to create conversation');
          const data = await res.json() as { id: string };
          targetConvId = data.id;
          convIdRef.current = targetConvId;
          setConvId(targetConvId);
          window.history.replaceState(null, '', `/chat/${targetConvId}`);
        }
        const fileRefs = await uploadFiles(targetConvId);
        setPendingFiles([]);
        await sendMessage({ text: text.trim(), files: fileRefs.length > 0 ? fileRefs : undefined });
      } catch {
        setPendingFiles((prev) =>
          prev.map((f, i) => i === 0 ? { ...f, error: 'Could not start conversation. Please try again.' } : f)
        );
      } finally {
        setUploading(false);
      }
    } else {
      setPendingFiles([]);
      await sendMessage({ text: text.trim() });
    }
  }, [isStreaming, uploading, sendMessage, pendingFiles, uploadFiles]);

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
              <h2 className="text-lg font-semibold text-foreground">What can I help with?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Try one of these, or ask your own question.</p>
            </div>
            <div className="grid gap-2 w-full max-w-md">
              {[
                "Who is volunteering this Sunday?",
                "Show me people added in the last month",
                "What songs have we played most recently?",
                "Help me plan next week's service",
                "Upload a screenshot and I'll help you work with it",
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => submitText(prompt)}
                  className="rounded-lg border border-border px-4 py-3 text-left text-sm text-foreground hover:bg-muted hover:border-border transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Available actions depend on your Planning Center modules.
            </p>
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="mb-4 flex justify-start">
            <div className="rounded-lg bg-muted px-4 py-3 text-muted-foreground flex items-center gap-1">
              Thinking
              <span className="flex gap-0.5">
                <span className="animate-bounce [animation-delay:0ms] h-1 w-1 rounded-full bg-muted-foreground" />
                <span className="animate-bounce [animation-delay:150ms] h-1 w-1 rounded-full bg-muted-foreground" />
                <span className="animate-bounce [animation-delay:300ms] h-1 w-1 rounded-full bg-muted-foreground" />
              </span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div
          className="mx-4 mb-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {friendlyErrorMessage(error)}
        </div>
      )}

      {!consentDismissed && pendingFiles.length > 0 && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning-foreground">
          <p className="flex-1">
            Files and images you upload are sent to your AI provider for processing. Avoid sharing images with sensitive personal information. Your data is not used for training. This notice won&apos;t appear again.
          </p>
          <button onClick={dismissConsent} className="shrink-0 min-h-[44px] min-w-[44px] px-3 font-medium text-warning-foreground hover:text-foreground">Got it</button>
        </div>
      )}
      {pendingFiles.length > 0 && (
        <div className="mx-4 mb-2 space-y-1">
          {pendingFiles.map((pf, i) => (
            <FileChip key={`${pf.file.name}-${i}`} name={pf.file.name} size={pf.file.size} progress={pf.progress} error={pf.error} onRemove={() => removeFile(i)} />
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" accept={[...DATA_EXTENSIONS, 'image/png', 'image/jpeg', 'image/webp'].join(',')} multiple className="hidden" onChange={handleFileSelect} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
            aria-label="Attach file or image"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <Textarea
            ref={textareaRef}
            placeholder={onboardingComplete ? "Ask about your church data..." : "Answer above, or just ask me anything to get started..."}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            rows={1}
            className="min-h-[44px] flex-1 resize-none"
            disabled={isStreaming}
            aria-label="Chat message"
          />
          <Button
            type="submit"
            disabled={isStreaming || uploading}
            className="h-[44px] min-w-[44px] shrink-0"
            aria-label="Send message"
          >
            {uploading ? 'Uploading...' : isStreaming ? '...' : 'Send'}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Press Enter to send, Shift+Enter for a new line
        </p>
      </form>
    </div>
  );
}
