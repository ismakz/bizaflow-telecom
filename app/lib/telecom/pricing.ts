export type TelecomPricingModel = 'per_minute' | 'pack_minutes' | 'subscription_included' | 'promotion';
export type TelecomDiscountScope = 'global' | 'role' | 'user' | 'country' | 'network' | 'provider';

export interface TelecomPricingStrategy {
  internalCalls: {
    model: 'free' | 'subscription_included' | 'paid';
    includedInSubscription: boolean;
    fallbackPricePerMinute: number;
  };
  externalCalls: {
    model: TelecomPricingModel;
    optimizeProviderCost: boolean;
    competeOnRawMinutePrice: boolean;
    defaultMarginPercent: number;
    minimumMarginPercent: number;
  };
  valuePositioning: {
    primaryAdvantages: Array<'erp_integration' | 'crm' | 'business_history' | 'automation' | 'team_control' | 'centralized_billing'>;
    message: string;
  };
  promotions: {
    bonusCreditEnabled: boolean;
    cashbackEnabled: boolean;
    rechargeBonusEnabled: boolean;
    userDiscountsEnabled: boolean;
  };
}

export interface TelecomRechargeBonusRule {
  id: string;
  enabled: boolean;
  minRechargeAmount: number;
  bonusPercent: number;
  maxBonusAmount?: number;
  currency: string;
}

export interface TelecomUserDiscountRule {
  id: string;
  enabled: boolean;
  scope: TelecomDiscountScope;
  target: string;
  discountPercent: number;
  startsAt?: string;
  endsAt?: string;
}

export const DEFAULT_TELECOM_PRICING_STRATEGY: TelecomPricingStrategy = {
  internalCalls: {
    model: 'free',
    includedInSubscription: true,
    fallbackPricePerMinute: 0,
  },
  externalCalls: {
    model: 'per_minute',
    optimizeProviderCost: true,
    competeOnRawMinutePrice: false,
    defaultMarginPercent: 25,
    minimumMarginPercent: 10,
  },
  valuePositioning: {
    primaryAdvantages: [
      'erp_integration',
      'crm',
      'business_history',
      'automation',
      'team_control',
      'centralized_billing',
    ],
    message:
      'Bizaflow Telecom vend une valeur entreprise complete, pas seulement des minutes moins cheres que les operateurs.',
  },
  promotions: {
    bonusCreditEnabled: true,
    cashbackEnabled: true,
    rechargeBonusEnabled: true,
    userDiscountsEnabled: true,
  },
};
