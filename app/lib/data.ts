// ============================================
// Bizaflow Telecom — Static Data
// ============================================

import type { TelecomPack } from './types';

// ── Telecom Packs (static, not user-specific) ──
export const telecomPacks: TelecomPack[] = [
  {
    packId: 'starter',
    name: 'Starter',
    category: 'starter',
    description: 'Pack entrée de gamme pour démarrer',
    price: 3.5,
    durationDays: 30,
    internalMinutes: 60,
    externalMinutes: 20,
    smsCount: 30,
    dataAmount: 512,
    isActive: true,
    color: '#06b6d4',
  },
  {
    packId: 'standard',
    name: 'Standard',
    category: 'standard',
    description: 'Équilibré pour usage quotidien',
    price: 8.99,
    durationDays: 30,
    internalMinutes: 240,
    externalMinutes: 80,
    smsCount: 120,
    dataAmount: 2048,
    isActive: true,
    popular: true,
    color: '#8b5cf6',
  },
  {
    packId: 'premium',
    name: 'Premium',
    category: 'premium',
    description: 'Très haut volume pour professionnels',
    price: 18.99,
    durationDays: 30,
    internalMinutes: 10000,
    externalMinutes: 220,
    smsCount: 400,
    dataAmount: 12288,
    isActive: true,
    color: '#f59e0b',
  },
  {
    packId: 'agent',
    name: 'Agent',
    category: 'agent',
    description: 'Pack agent à coût réduit avec bonus communication',
    price: 6.5,
    durationDays: 30,
    internalMinutes: 300,
    externalMinutes: 120,
    smsCount: 150,
    dataAmount: 1024,
    isActive: true,
    color: '#10b981',
  },
];
