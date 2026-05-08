const KEYWORD_TO_CONTEXT: Array<{ keywords: RegExp; contextName: string }> = [
  { keywords: /\b(call|phone|ring|dial|voicemail)\b/i, contextName: "Calls" },
  { keywords: /\b(email|reply|inbox|message|send|forward)\b/i, contextName: "Email" },
  { keywords: /\b(buy|purchase|shop|store|errand|pick\s*up|groceries|order)\b/i, contextName: "Errands" },
  { keywords: /\b(meeting|sync|standup|1:1|one-on-one|huddle|call with|catch up)\b/i, contextName: "Meetings" },
  { keywords: /\b(read|review|article|book|blog|paper|document|report)\b/i, contextName: "Reading" },
  { keywords: /\b(waiting for|waiting on|delegated|asked .+ to|follow\s*up)\b/i, contextName: "Waiting" },
  { keywords: /\b(code|debug|commit|deploy|pr|pull request|branch|fix bug|refactor|script)\b/i, contextName: "Computer" },
  { keywords: /\b(write|draft|document|type up|compose)\b/i, contextName: "Computer" },
  { keywords: /\b(agenda|with |discuss with)\b/i, contextName: "Meetings" },
];

export function inferContextsFromText(
  rawText: string,
  availableContextNames: string[],
): string[] {
  if (availableContextNames.length === 0) return [];

  const normalizedAvailable = availableContextNames.filter(Boolean).map((n) => n.toLowerCase());
  const inferred = new Set<string>();

  for (const { keywords, contextName } of KEYWORD_TO_CONTEXT) {
    if (!keywords.test(rawText)) continue;
    const lower = contextName.toLowerCase();
    const idx = normalizedAvailable.indexOf(lower);
    if (idx !== -1) {
      const actual = availableContextNames[idx];
      if (actual) inferred.add(actual);
    }
  }

  return Array.from(inferred);
}
