// ============================================
// Bizaflow Telecom — Core Type Definitions
// ============================================

export type UserRole = 'ceo' | 'admin' | 'user' | 'agent' | 'business';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface User {
  uid: string;
  name: string;
  email: string;
  telecomNumber: string; // Format: BZT-10001
  role: UserRole;
  status: UserStatus;
  balance: number;
  mustChangePassword: boolean;
  createdAt: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
}

export interface Contact {
  id: string;
  contactUid?: string;
  name: string;
  phone: string;
  isInternal: boolean;
  avatarColor: string;
  isFavorite: boolean;
  addedAt: string | null;
}

export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'answered'
  | 'missed'
  | 'rejected'
  | 'cancelled'
  | 'completed'
  | 'failed';
export type CallCategory = 'internal_call' | 'external_call';
export type CallDirection = 'outgoing' | 'incoming';
export type BillingSource = 'pack' | 'bonus' | 'balance' | 'free';

export interface CallRecord {
  id: string;
  callerUserId?: string;
  callerTelecomNumber: string;
  targetUserId?: string;
  targetTelecomNumber: string;
  targetExternalNumber?: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  durationSeconds: number;
  type: CallCategory;
  direction: CallDirection;
  status: CallStatus;
  cost: number;
  billingSource: BillingSource;
  providerMode?: 'mock' | 'sip' | 'api' | 'real';
  providerName?: string;
  providerCallId?: string;
  externalRouteStatus?: string;
  isRealTelephony?: boolean;
  startedAt?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  createdAt: string | null;
}

export interface TelecomPack {
  packId: string;
  name: string;
  category: 'starter' | 'standard' | 'premium' | 'agent';
  isActive: boolean;
  durationDays: number;
  internalMinutes: number;
  externalMinutes: number;
  smsCount?: number;
  dataAmount?: number;
  createdAt?: string | null;
  description: string;
  price: number;
  popular?: boolean;
  color: string;
}

export type UserPackStatus = 'active' | 'expired' | 'cancelled' | 'exhausted';

export interface UserPack {
  id: string;
  userId: string;
  telecomNumber: string;
  packId: string;
  packName: string;
  category: TelecomPack['category'];
  status: UserPackStatus;
  price: number;
  startAt: string | null;
  endAt: string | null;
  remainingInternalMinutes: number;
  remainingExternalMinutes: number;
  remainingSmsCount?: number;
  remainingDataAmount?: number;
  createdAt: string | null;
}

export type ActiveTab = 'dialer' | 'history' | 'contacts' | 'credit' | 'profile';

export interface CallSimulationState {
  active: boolean;
  phase: 'ringing' | 'connected' | 'ended';
  contact: Contact | null;
  startTime: number;
  duration: number;
  isInternal: boolean;
  direction?: 'incoming' | 'outgoing';
}

export interface SystemStats {
  totalUsers: number;
  pendingUsers: number;
  approvedUsers: number;
  rejectedUsers: number;
  suspendedUsers: number;
  totalCalls: number;
  totalRevenue: number;
  totalBZTNumbers: number;
  totalPacksSold: number;
  packRevenue: number;
  activePacks: number;
  expiredPacks: number;
  totalInternalCalls: number;
  totalExternalCalls: number;
  missedCalls: number;
  failedCalls: number;
}

export type TransactionType =
  | 'recharge'
  | 'transfer_in'
  | 'transfer_out'
  | 'pack_purchase'
  | 'bonus'
  | 'adjustment'
  | 'call_charge'
  | 'refund';

export type TransactionStatus = 'pending' | 'success' | 'failed' | 'cancelled';

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  description: string;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string | null;
  createdBy?: string;
  // Transfer-specific
  sourceUserId?: string;
  targetUserId?: string;
  sourceTelecomNumber?: string;
  targetTelecomNumber?: string;
  linkedTransactionId?: string;
}
