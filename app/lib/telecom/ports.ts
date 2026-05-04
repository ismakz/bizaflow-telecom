import type { UserRole, UserStatus } from '@/app/lib/types';

export type TelecomMode = 'standalone' | 'integrated';
export type TelecomEnvironment = 'development' | 'preview' | 'production' | 'test';

export interface TelecomUserIdentity {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  telecomNumber?: string;
}

export interface WalletBalance {
  userId: string;
  balance: number;
  currency: string;
}

export interface WalletDebitInput {
  userId: string;
  amount: number;
  currency: string;
  reason: string;
  referenceId?: string;
}

export type WalletCreditInput = WalletDebitInput;

export interface WalletMutationResult {
  transactionId: string;
  balanceBefore: number;
  balanceAfter: number;
}

export interface TransactionLogInput {
  userId: string;
  type: string;
  amount: number;
  currency: string;
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  description: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationInput {
  userId: string;
  title: string;
  message: string;
  channel?: 'in_app' | 'email' | 'sms' | 'push';
  metadata?: Record<string, unknown>;
}

export interface LogInput {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  scope: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuthPort {
  getCurrentUser(authContext?: unknown): Promise<TelecomUserIdentity | null>;
  getUserById(userId: string): Promise<TelecomUserIdentity | null>;
  assertRole(userId: string, allowedRoles: UserRole[]): Promise<void>;
}

export interface WalletPort {
  getUserBalance(userId: string): Promise<WalletBalance>;
  debitUserBalance(input: WalletDebitInput): Promise<WalletMutationResult>;
  creditUserBalance(input: WalletCreditInput): Promise<WalletMutationResult>;
  logTransaction(input: TransactionLogInput): Promise<string>;
}

export interface NotificationPort {
  sendNotification(input: NotificationInput): Promise<void>;
}

export interface LogPort {
  log(input: LogInput): Promise<void>;
}

export interface TelecomModulePorts {
  auth: AuthPort;
  wallet: WalletPort;
  notifications: NotificationPort;
  logs: LogPort;
}

export interface TelecomModuleConfig {
  mode: TelecomMode;
  environment: TelecomEnvironment;
  currency: string;
  moduleEnabled: boolean;
  pricingStrategy: 'value_over_raw_operator_price';
  ports: TelecomModulePorts;
}
