import { http, HttpResponse } from 'msw';

const mockSession = {
  user: {
    agentUserId: 'test-user-id',
    orgId: 'test-org-id',
    role: 'admin',
    name: 'Test User',
    email: 'test@example.com',
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const mockSettings = {
  apiProvider: 'anthropic',
  preferredModel: null,
  hasApiKey: true,
};

const mockRules = {
  rules: [
    { id: 'sys-1', content: 'Be helpful and friendly', ruleType: 'system', category: 'general', visibility: 'org', createdById: null },
    { id: 'org-1', content: 'Always check blockout dates', ruleType: 'org', category: 'scheduling', visibility: 'org', createdById: 'admin-1' },
  ],
  settings: {},
};

const mockMemories = {
  orgMemories: [
    { id: 'mem-1', key: 'pastor_name', value: 'John Smith', source: 'manual', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ],
  userMemories: [],
};

export const handlers = [
  http.get('/api/auth/session', () => HttpResponse.json(mockSession)),
  http.get('/api/settings', () => HttpResponse.json(mockSettings)),
  http.post('/api/settings', () => HttpResponse.json({ success: true })),
  http.get('/api/rules', () => HttpResponse.json(mockRules)),
  http.post('/api/rules', async ({ request }) => {
    const body = await request.json() as Record<string, string>;
    return HttpResponse.json(
      { id: 'new-rule', content: body.content, ruleType: body.ruleType, category: null, visibility: 'org', createdById: 'test-user-id' },
      { status: 201 },
    );
  }),
  http.post('/api/rules/toggle', () => HttpResponse.json({ id: 'setting-1', enabled: true })),
  http.get('/api/memory', () => HttpResponse.json(mockMemories)),
  http.post('/api/chat', () => {
    return new HttpResponse(
      'Hello! I can help you with your Planning Center data.',
      { headers: { 'x-conversation-id': 'test-conv-1', 'Content-Type': 'text/plain' } },
    );
  }),
  http.get('/api/health', () => HttpResponse.json({ status: 'ok', timestamp: new Date().toISOString() })),
];
