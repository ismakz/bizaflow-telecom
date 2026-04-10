// ============================================
// Bizaflow Telecom — Utility Functions
// ============================================

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format BZT number for display (already formatted: BZT-10001)
 */
export function formatTelecomNumber(number: string): string {
  return number; // BZT-XXXXX is already display-ready
}

/**
 * Format call duration from seconds to readable string
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins.toString().padStart(2, '0')}m`;
}

/**
 * Format cost to display string
 */
export function formatCost(cost: number): string {
  if (cost === 0) return 'Gratuit';
  return `$${cost.toFixed(2)}`;
}

/**
 * Format credit balance
 */
export function formatBalance(balance: number): string {
  return `$${balance.toFixed(2)}`;
}

/**
 * Format timestamp to relative time
 */
export function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins}m`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/**
 * Format timestamp to date string
 */
export function formatDate(isoDate: string | null): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return 'Hier';
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * Format timestamp to time
 */
export function formatTime(isoDate: string | null): string {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Call rate configuration (USD per minute)
 */
export const CALL_RATES = {
  internal: 0,       // BZT → BZT = Free
  airtel: 0.02,      // BZT → Airtel
  mtn: 0.025,        // BZT → MTN
  vodacom: 0.03,     // BZT → Vodacom
  orange: 0.025,     // BZT → Orange
  other: 0.035,      // BZT → Other
};

export type OperatorId = keyof typeof CALL_RATES;

/**
 * Detect operator from phone number
 */
export function detectOperator(number: string): { id: OperatorId; name: string; color: string } {
  const cleaned = number.replace(/\D/g, '');

  if (isBZTNumber(number)) return { id: 'internal', name: 'Bizaflow', color: '#06b6d4' };

  // DRC prefixes (adjust for your market)
  if (/^(099|097|090)/.test(cleaned) || /^243(99|97|90)/.test(cleaned))
    return { id: 'airtel', name: 'Airtel', color: '#ef4444' };
  if (/^(081|082|083)/.test(cleaned) || /^243(81|82|83)/.test(cleaned))
    return { id: 'vodacom', name: 'Vodacom', color: '#ef4444' };
  if (/^(080|089)/.test(cleaned) || /^243(80|89)/.test(cleaned))
    return { id: 'mtn', name: 'MTN', color: '#f59e0b' };
  if (/^(084|085)/.test(cleaned) || /^243(84|85)/.test(cleaned))
    return { id: 'orange', name: 'Orange', color: '#f97316' };

  return { id: 'other', name: 'Externe', color: '#6b7280' };
}

/**
 * Calculate call cost
 */
export function calculateCallCost(durationSeconds: number, isInternal: boolean, number?: string): number {
  if (isInternal) return 0;
  const minutes = Math.ceil(durationSeconds / 60);
  const operator = number ? detectOperator(number) : { id: 'other' as OperatorId };
  const rate = CALL_RATES[operator.id];
  return Math.round(minutes * rate * 100) / 100;
}

/**
 * Estimate call cost for a given duration
 */
export function estimateCallCost(minutes: number, number: string): number {
  const operator = detectOperator(number);
  const rate = CALL_RATES[operator.id];
  return Math.round(minutes * rate * 100) / 100;
}

/**
 * Get initials from full name
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}

/**
 * Generate a random avatar color from a curated palette
 */
export function generateAvatarColor(): string {
  const colors = [
    '#06b6d4', '#14b8a6', '#8b5cf6', '#ec4899',
    '#f59e0b', '#10b981', '#6366f1', '#ef4444',
    '#3b82f6', '#84cc16', '#f97316', '#a855f7',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Search/filter contacts by query
 */
export function filterContacts<T extends { name: string; phone: string }>(contacts: T[], query: string): T[] {
  const q = query.toLowerCase().trim();
  if (!q) return contacts;
  return contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q)
  );
}

/**
 * Check if a string is a Bizaflow Telecom number (BZT-XXXXX)
 */
export function isBZTNumber(number: string): boolean {
  return /^BZT-\d{5,}$/i.test(number.trim());
}

/**
 * Normalize external numbers to international format +<country><number>.
 * Supported inputs:
 * - +243XXXXXXXXX
 * - 243XXXXXXXXX
 * - 07XXXXXXXX (local simplified, converted to +2437XXXXXXXX)
 */
export function normalizeExternalPhoneNumber(raw: string): string | null {
  const input = raw.trim().replace(/\s+/g, '');
  if (!input) return null;
  if (!/^\+?\d+$/.test(input)) return null;
  if ((input.match(/\+/g) || []).length > 1) return null;
  if (input.includes('+') && !input.startsWith('+')) return null;

  // Already international with "+"
  if (input.startsWith('+')) {
    const digits = input.slice(1);
    if (digits.length < 9 || digits.length > 15) return null;
    return `+${digits}`;
  }

  // International without "+"
  if (input.startsWith('243')) {
    if (input.length < 11 || input.length > 15) return null;
    return `+${input}`;
  }

  // Local simplified DRC format: 0XXXXXXXXX
  if (input.startsWith('0') && input.length === 10) {
    return `+243${input.slice(1)}`;
  }

  return null;
}

/**
 * Convert Firestore Timestamp to ISO string
 */
export function timestampToISO(ts: { seconds: number; nanoseconds: number } | null | undefined): string | null {
  if (!ts || !('seconds' in ts)) return null;
  return new Date(ts.seconds * 1000).toISOString();
}
