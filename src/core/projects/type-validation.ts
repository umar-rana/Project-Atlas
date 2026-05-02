const TYPE_REGEX = /^[a-z0-9 -]+$/;
const MAX_LEN = 32;

export function isValidProjectType(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (s.length < 1 || s.length > MAX_LEN) return false;
  return TYPE_REGEX.test(s);
}

export function normalizeProjectType(raw: string): string {
  return raw.trim().toLowerCase();
}

export function capitalizeProjectType(type: string): string {
  return type
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function validateProjectType(raw: string): { valid: boolean; error?: string } {
  const s = raw.trim();
  if (s.length === 0) return { valid: false, error: "Type cannot be empty" };
  if (s.length > MAX_LEN) return { valid: false, error: `Type must be ${MAX_LEN} characters or fewer` };
  if (!/^[a-zA-Z0-9 -]+$/.test(s)) {
    return { valid: false, error: "Only letters, numbers, spaces, and hyphens are allowed" };
  }
  return { valid: true };
}
