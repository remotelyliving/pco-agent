import { getAllMemoriesForUser } from '@/lib/memory/queries';

/** Approximate token budget for memory section of system prompt (~4K tokens ≈ 16K chars). */
const MAX_MEMORY_CHARS = 16_000;

/** Boost applied to manual memories so they're prioritized over auto-extracted ones. */
const MANUAL_BOOST = 5;

/** Common English stopwords excluded from keyword matching. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
  'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
  'out', 'off', 'over', 'under', 'again', 'then', 'once', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
  'or', 'if', 'while', 'what', 'which', 'who', 'whom', 'this', 'that',
  'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
  'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their',
]);

/**
 * Tokenize text into lowercase keywords, splitting on non-alphanumeric chars
 * and filtering out stopwords and very short tokens.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Score a memory's relevance to a set of query keywords.
 * Returns a number >= 0. Higher = more relevant.
 * Manual memories receive a boost so they're less likely to be truncated.
 */
export function scoreMemory(
  memoryKey: string,
  memoryValue: string,
  source: string,
  queryKeywords: string[],
): number {
  if (queryKeywords.length === 0) return 0;

  const memoryTokens = new Set(tokenize(`${memoryKey} ${memoryValue}`));
  let hits = 0;
  for (const kw of queryKeywords) {
    if (memoryTokens.has(kw)) hits++;
    // Partial match: query keyword is a substring of a memory token or vice versa
    else {
      for (const mt of memoryTokens) {
        if (mt.includes(kw) || kw.includes(mt)) {
          hits += 0.5;
          break;
        }
      }
    }
  }

  const score = hits / queryKeywords.length;
  return source === 'manual' ? score + MANUAL_BOOST : score;
}

interface ScoredMemory {
  id: string;
  orgId: string;
  userId: string | null;
  key: string;
  value: string;
  source: string;
  score: number;
}

export async function getMemoryPrompt(
  orgId: string,
  userId: string,
  userMessage?: string,
): Promise<string> {
  const memories = await getAllMemoriesForUser(orgId, userId);

  if (memories.length === 0) return '';

  const queryKeywords = userMessage ? tokenize(userMessage) : [];

  // Score and sort by relevance (highest first)
  const scored: ScoredMemory[] = memories.map((m) => ({
    ...m,
    source: m.source as string,
    score: scoreMemory(m.key, m.value, m.source as string, queryKeywords),
  }));

  // When we have query keywords, sort by score descending.
  // When no query (fallback), keep original order (createdAt asc from DB).
  if (queryKeywords.length > 0) {
    scored.sort((a, b) => b.score - a.score);
  }

  // Build prompt with token budget
  const orgLines: string[] = [];
  const userLines: string[] = [];
  let charCount = 0;

  // Reserve space for section headers
  const ORG_HEADER = '## Known facts about this church\n\n';
  const USER_HEADER = '## Your personal notes\n\n';
  // We'll add header lengths once we know sections are non-empty

  for (const m of scored) {
    const line = `- ${m.key}: ${m.value}`;
    const lineChars = line.length + 1; // +1 for newline

    if (charCount + lineChars > MAX_MEMORY_CHARS) break;

    if (m.userId === null) {
      if (orgLines.length === 0) charCount += ORG_HEADER.length;
      orgLines.push(line);
    } else {
      if (userLines.length === 0) charCount += USER_HEADER.length;
      userLines.push(line);
    }
    charCount += lineChars;
  }

  const sections: string[] = [];
  if (orgLines.length > 0) {
    sections.push(`${ORG_HEADER}${orgLines.join('\n')}`);
  }
  if (userLines.length > 0) {
    sections.push(`${USER_HEADER}${userLines.join('\n')}`);
  }

  return sections.join('\n\n');
}
