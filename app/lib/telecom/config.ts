import type { TelecomEnvironment, TelecomMode } from '@/app/lib/telecom/ports';

export function resolveTelecomMode(): TelecomMode {
  return process.env.TELECOM_MODE === 'integrated' ? 'integrated' : 'standalone';
}

export function resolveTelecomEnvironment(): TelecomEnvironment {
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
  if (env === 'production') return 'production';
  if (env === 'preview') return 'preview';
  if (env === 'test') return 'test';
  return 'development';
}

export function resolveTelecomCurrency() {
  return process.env.TELECOM_DEFAULT_CURRENCY || 'USD';
}

export function isTelecomModuleEnabled() {
  return process.env.TELECOM_MODULE_ENABLED !== 'false';
}
