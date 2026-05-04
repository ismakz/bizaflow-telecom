import { createStandaloneTelecomPorts } from '@/app/lib/telecom/standaloneAdapters';
import {
  isTelecomModuleEnabled,
  resolveTelecomCurrency,
  resolveTelecomEnvironment,
  resolveTelecomMode,
} from '@/app/lib/telecom/config';
import type { TelecomModuleConfig, TelecomModulePorts } from '@/app/lib/telecom/ports';

type InitTelecomModuleInput = Partial<Omit<TelecomModuleConfig, 'ports'>> & {
  ports?: Partial<TelecomModulePorts>;
};

let activeConfig: TelecomModuleConfig | null = null;

export function initTelecomModule(config: InitTelecomModuleInput = {}): TelecomModuleConfig {
  const standalonePorts = createStandaloneTelecomPorts({
    currency: config.currency || resolveTelecomCurrency(),
  });

  activeConfig = {
    mode: config.mode || resolveTelecomMode(),
    environment: config.environment || resolveTelecomEnvironment(),
    currency: config.currency || resolveTelecomCurrency(),
    moduleEnabled: config.moduleEnabled ?? isTelecomModuleEnabled(),
    pricingStrategy: 'value_over_raw_operator_price',
    ports: {
      auth: config.ports?.auth || standalonePorts.auth,
      wallet: config.ports?.wallet || standalonePorts.wallet,
      notifications: config.ports?.notifications || standalonePorts.notifications,
      logs: config.ports?.logs || standalonePorts.logs,
    },
  };

  return activeConfig;
}

export function getTelecomModuleConfig(): TelecomModuleConfig {
  return activeConfig || initTelecomModule();
}
