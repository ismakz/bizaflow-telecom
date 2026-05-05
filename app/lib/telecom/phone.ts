export type TelecomCountryCode = 'CD' | 'RW' | 'UG' | 'KE' | 'TZ' | 'BI' | 'US' | 'GB' | 'UNKNOWN';

export interface NormalizedPhoneNumber {
  raw: string;
  e164: string;
  countryCode: TelecomCountryCode;
  countryName: string;
  networkName: string;
  isSupportedCountry: boolean;
}

const COUNTRY_RULES: Array<{
  countryCode: TelecomCountryCode;
  countryName: string;
  dialCode: string;
}> = [
  { countryCode: 'CD', countryName: 'RDC', dialCode: '243' },
  { countryCode: 'RW', countryName: 'Rwanda', dialCode: '250' },
  { countryCode: 'UG', countryName: 'Ouganda', dialCode: '256' },
  { countryCode: 'KE', countryName: 'Kenya', dialCode: '254' },
  { countryCode: 'TZ', countryName: 'Tanzanie', dialCode: '255' },
  { countryCode: 'BI', countryName: 'Burundi', dialCode: '257' },
  { countryCode: 'US', countryName: 'Etats-Unis/Canada', dialCode: '1' },
  { countryCode: 'GB', countryName: 'Royaume-Uni', dialCode: '44' },
];

const SUPPORTED_COUNTRIES = new Set<TelecomCountryCode>(['CD', 'RW', 'UG', 'KE', 'TZ', 'BI']);

export function normalizePhoneNumber(raw: string): NormalizedPhoneNumber {
  const input = raw.trim().replace(/[\s().-]/g, '');
  if (!input) throw new Error('TELECOM_EMPTY_DESTINATION');
  if (!/^\+?\d+$/.test(input)) throw new Error('TELECOM_INVALID_DESTINATION');

  let digits = input.startsWith('+') ? input.slice(1) : input;
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('0') && digits.length === 10) {
    digits = `243${digits.slice(1)}`;
  }

  if (digits.length < 9 || digits.length > 15) {
    throw new Error('TELECOM_INVALID_DESTINATION_LENGTH');
  }

  const country = COUNTRY_RULES.find((rule) => digits.startsWith(rule.dialCode));
  const countryCode = country?.countryCode || 'UNKNOWN';
  const countryName = country?.countryName || 'Inconnu';
  const e164 = `+${digits}`;

  return {
    raw,
    e164,
    countryCode,
    countryName,
    networkName: detectNetwork(e164, countryCode),
    isSupportedCountry: SUPPORTED_COUNTRIES.has(countryCode),
  };
}

export function detectNetwork(e164: string, countryCode: TelecomCountryCode): string {
  const digits = e164.replace(/\D/g, '');

  if (countryCode === 'CD') {
    if (/^243(99|97|90)/.test(digits)) return 'Airtel';
    if (/^243(81|82|83)/.test(digits)) return 'Vodacom';
    if (/^243(80|89)/.test(digits)) return 'MTN';
    if (/^243(84|85)/.test(digits)) return 'Orange';
    return 'RDC autre';
  }

  if (countryCode === 'RW') {
    if (/^250(78|79)/.test(digits)) return 'MTN Rwanda';
    if (/^250(72|73)/.test(digits)) return 'Airtel Rwanda';
    return 'Rwanda autre';
  }

  if (countryCode === 'UG') {
    if (/^256(77|78|76)/.test(digits)) return 'MTN Uganda';
    if (/^256(70|75)/.test(digits)) return 'Airtel Uganda';
    return 'Ouganda autre';
  }

  return 'International';
}

