interface TimePattern {
  pattern: RegExp;
  minutes: number;
}

const TIME_PATTERNS: TimePattern[] = [
  { pattern: /\b(quick call|quick chat|quick check|quick email)\b/i, minutes: 15 },
  { pattern: /\b(brief\s*(sync|call|meeting|chat))\b/i, minutes: 30 },
  { pattern: /\b(15[\s-]min(ute)?)\b/i, minutes: 15 },
  { pattern: /\b(30[\s-]min(ute)?|half[\s-]hour)\b/i, minutes: 30 },
  { pattern: /\b(45[\s-]min(ute)?)\b/i, minutes: 45 },
  { pattern: /\b(1[\s-]hour|one[\s-]hour|60[\s-]min(ute)?)\b/i, minutes: 60 },
  { pattern: /\b(2[\s-]hour|two[\s-]hour)\b/i, minutes: 120 },
  { pattern: /\b(meeting|standup|1:1|one-on-one|huddle)\b/i, minutes: 60 },
  { pattern: /\b(standup|daily)\b/i, minutes: 15 },
  { pattern: /\b(review article|read article|read blog|read paper)\b/i, minutes: 30 },
  { pattern: /\b(call|phone|ring)\b/i, minutes: 15 },
  { pattern: /\b(email|reply|send)\b/i, minutes: 5 },
];

export function estimateMinutes(rawText: string): number | undefined {
  for (const { pattern, minutes } of TIME_PATTERNS) {
    if (pattern.test(rawText)) {
      return minutes;
    }
  }
  return undefined;
}
