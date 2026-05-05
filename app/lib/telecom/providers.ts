import { DEFAULT_TELECOM_PRICING_STRATEGY } from '@/app/lib/telecom/pricing';
import { normalizePhoneNumber, type NormalizedPhoneNumber, type TelecomCountryCode } from '@/app/lib/telecom/phone';

export type TelecomProviderName =
  | 'twilio'
  | 'telnyx'
  | 'plivo'
  | 'vonage'
  | 'africas_talking'
  | 'termii'
  | 'local_provider';

export type TelecomProviderCallStatus =
  | 'initiated'
  | 'ringing'
  | 'answered'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'no_answer';

export interface ProviderDestinationValidation {
  allowed: boolean;
  reason?: string;
  normalized: NormalizedPhoneNumber;
}

export interface ProviderCostEstimate {
  provider: TelecomProviderName;
  destination: NormalizedPhoneNumber;
  durationSeconds: number;
  billingIncrementSeconds: number;
  billedSeconds: number;
  providerCost: number;
  salePrice: number;
  marginAmount: number;
  marginPercent: number;
  currency: string;
  configured: boolean;
}

export interface ProviderInitiateCallInput {
  fromUserId: string;
  fromNumber?: string;
  toNumber: string;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderInitiateCallResult {
  provider: TelecomProviderName;
  providerCallId: string;
  status: TelecomProviderCallStatus;
  configured: boolean;
  raw?: unknown;
}

export interface TelecomProviderAdapter {
  initiateCall(input: ProviderInitiateCallInput): Promise<ProviderInitiateCallResult>;
  getCallStatus(providerCallId: string): Promise<TelecomProviderCallStatus>;
  handleWebhook(payload: unknown, headers?: Headers): Promise<Record<string, unknown>>;
  estimateCost(destination: string, durationSeconds: number): Promise<ProviderCostEstimate>;
  normalizePhoneNumber(destination: string): NormalizedPhoneNumber;
  validateDestination(destination: string): ProviderDestinationValidation;
  getProviderName(): TelecomProviderName;
  isConfigured(): boolean;
}

type ProviderDefinition = {
  name: TelecomProviderName;
  envKeys: string[];
  priority: number;
  supportsVoice: boolean;
  supportsSms: boolean;
  supportsAfrica: boolean;
  preferredCountries: TelecomCountryCode[];
  billingIncrementSeconds: number;
  baseCostPerMinute: number;
};

const PROVIDERS: ProviderDefinition[] = [
  {
    name: 'africas_talking',
    envKeys: ['AFRICASTALKING_USERNAME', 'AFRICASTALKING_API_KEY'],
    priority: 10,
    supportsVoice: true,
    supportsSms: true,
    supportsAfrica: true,
    preferredCountries: ['CD', 'RW', 'UG', 'KE', 'TZ'],
    billingIncrementSeconds: 60,
    baseCostPerMinute: 0.045,
  },
  {
    name: 'telnyx',
    envKeys: ['TELNYX_API_KEY', 'TELNYX_CONNECTION_ID'],
    priority: 20,
    supportsVoice: true,
    supportsSms: true,
    supportsAfrica: true,
    preferredCountries: ['CD', 'RW', 'UG', 'KE', 'TZ', 'BI'],
    billingIncrementSeconds: 60,
    baseCostPerMinute: 0.05,
  },
  {
    name: 'plivo',
    envKeys: ['PLIVO_AUTH_ID', 'PLIVO_AUTH_TOKEN'],
    priority: 30,
    supportsVoice: true,
    supportsSms: true,
    supportsAfrica: true,
    preferredCountries: ['CD', 'RW', 'UG', 'KE', 'TZ', 'BI'],
    billingIncrementSeconds: 60,
    baseCostPerMinute: 0.052,
  },
  {
    name: 'twilio',
    envKeys: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    priority: 40,
    supportsVoice: true,
    supportsSms: true,
    supportsAfrica: true,
    preferredCountries: ['CD', 'RW', 'UG', 'KE', 'TZ', 'BI', 'US', 'GB'],
    billingIncrementSeconds: 60,
    baseCostPerMinute: 0.065,
  },
  {
    name: 'vonage',
    envKeys: ['VONAGE_API_KEY', 'VONAGE_API_SECRET'],
    priority: 50,
    supportsVoice: true,
    supportsSms: true,
    supportsAfrica: true,
    preferredCountries: ['CD', 'RW', 'UG', 'KE', 'TZ', 'BI', 'US', 'GB'],
    billingIncrementSeconds: 60,
    baseCostPerMinute: 0.06,
  },
  {
    name: 'local_provider',
    envKeys: ['LOCAL_TELECOM_PROVIDER_API_KEY'],
    priority: 60,
    supportsVoice: true,
    supportsSms: false,
    supportsAfrica: true,
    preferredCountries: ['CD', 'RW', 'UG'],
    billingIncrementSeconds: 60,
    baseCostPerMinute: 0.04,
  },
  {
    name: 'termii',
    envKeys: ['TERMII_API_KEY'],
    priority: 90,
    supportsVoice: false,
    supportsSms: true,
    supportsAfrica: true,
    preferredCountries: ['CD', 'RW', 'UG', 'KE', 'TZ', 'BI'],
    billingIncrementSeconds: 60,
    baseCostPerMinute: 0,
  },
];

class ConfiguredProviderAdapter implements TelecomProviderAdapter {
  constructor(private readonly definition: ProviderDefinition, private readonly currency: string) {}

  getProviderName(): TelecomProviderName {
    return this.definition.name;
  }

  isConfigured(): boolean {
    return this.definition.envKeys.every((key) => Boolean(process.env[key]?.trim()));
  }

  normalizePhoneNumber(destination: string): NormalizedPhoneNumber {
    return normalizePhoneNumber(destination);
  }

  validateDestination(destination: string): ProviderDestinationValidation {
    const normalized = this.normalizePhoneNumber(destination);
    if (!this.definition.supportsVoice) {
      return { allowed: false, reason: 'TELECOM_PROVIDER_VOICE_NOT_SUPPORTED', normalized };
    }
    if (!normalized.isSupportedCountry) {
      return { allowed: false, reason: 'TELECOM_COUNTRY_NOT_SUPPORTED', normalized };
    }
    if (!this.definition.preferredCountries.includes(normalized.countryCode)) {
      return { allowed: false, reason: 'TELECOM_PROVIDER_COUNTRY_NOT_SUPPORTED', normalized };
    }
    return { allowed: true, normalized };
  }

  async estimateCost(destination: string, durationSeconds: number): Promise<ProviderCostEstimate> {
    const normalized = this.normalizePhoneNumber(destination);
    const billingIncrementSeconds = this.definition.billingIncrementSeconds;
    const billedSeconds = Math.max(
      billingIncrementSeconds,
      Math.ceil(Math.max(1, durationSeconds) / billingIncrementSeconds) * billingIncrementSeconds
    );
    const billedMinutes = billedSeconds / 60;
    const providerCost = roundMoney(billedMinutes * this.definition.baseCostPerMinute);
    const marginPercent = DEFAULT_TELECOM_PRICING_STRATEGY.externalCalls.defaultMarginPercent;
    const salePrice = roundMoney(providerCost * (1 + marginPercent / 100));

    return {
      provider: this.definition.name,
      destination: normalized,
      durationSeconds,
      billingIncrementSeconds,
      billedSeconds,
      providerCost,
      salePrice,
      marginAmount: roundMoney(salePrice - providerCost),
      marginPercent,
      currency: this.currency,
      configured: this.isConfigured(),
    };
  }

  async initiateCall(): Promise<ProviderInitiateCallResult> {
    if (!this.isConfigured()) {
      throw new Error('TELECOM_PROVIDER_NOT_CONFIGURED');
    }
    throw new Error('TELECOM_PROVIDER_CALL_NOT_IMPLEMENTED');
  }

  async getCallStatus(): Promise<TelecomProviderCallStatus> {
    if (!this.isConfigured()) return 'failed';
    return 'initiated';
  }

  async handleWebhook(): Promise<Record<string, unknown>> {
    if (!this.isConfigured()) {
      throw new Error('TELECOM_PROVIDER_NOT_CONFIGURED');
    }
    return { provider: this.definition.name, handled: false };
  }
}

export function createProviderAdapters(currency: string): TelecomProviderAdapter[] {
  return PROVIDERS.map((definition) => new ConfiguredProviderAdapter(definition, currency));
}

export function listProviderRuntime(currency: string) {
  return createProviderAdapters(currency).map((adapter) => {
    const definition = PROVIDERS.find((item) => item.name === adapter.getProviderName())!;
    return {
      name: definition.name,
      configured: adapter.isConfigured(),
      priority: definition.priority,
      supportsVoice: definition.supportsVoice,
      supportsSms: definition.supportsSms,
      supportsAfrica: definition.supportsAfrica,
      preferredCountries: definition.preferredCountries,
    };
  });
}

export async function resolveProviderRoute(input: {
  destination: string;
  durationSeconds: number;
  currency: string;
  allowUnconfigured?: boolean;
}) {
  const adapters = createProviderAdapters(input.currency)
    .filter((adapter) => {
      const validation = adapter.validateDestination(input.destination);
      return validation.allowed;
    })
    .sort((a, b) => {
      const left = PROVIDERS.find((item) => item.name === a.getProviderName())!;
      const right = PROVIDERS.find((item) => item.name === b.getProviderName())!;
      return left.priority - right.priority;
    });

  if (adapters.length === 0) {
    const normalized = normalizePhoneNumber(input.destination);
    return {
      ok: false as const,
      reason: normalized.isSupportedCountry ? 'TELECOM_NO_PROVIDER_FOR_DESTINATION' : 'TELECOM_COUNTRY_NOT_SUPPORTED',
      destination: normalized,
      candidates: [],
    };
  }

  const estimates = await Promise.all(
    adapters.map((adapter) => adapter.estimateCost(input.destination, input.durationSeconds))
  );
  const configured = estimates.filter((estimate) => estimate.configured);
  const usable = configured.length > 0 ? configured : input.allowUnconfigured ? estimates : [];

  if (usable.length === 0) {
    return {
      ok: false as const,
      reason: 'TELECOM_PROVIDER_NOT_CONFIGURED',
      destination: estimates[0].destination,
      candidates: estimates,
    };
  }

  const selected = usable.reduce((best, current) => (current.salePrice < best.salePrice ? current : best), usable[0]);
  const fallback = usable.find((estimate) => estimate.provider !== selected.provider) || null;

  return {
    ok: true as const,
    selected,
    fallback,
    candidates: estimates,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000;
}

