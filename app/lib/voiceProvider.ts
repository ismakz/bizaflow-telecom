export type ProviderMode = 'mock' | 'sip' | 'api';

export interface PlaceExternalCallInput {
  callerUserId: string;
  callerTelecomNumber: string;
  callerName?: string;
  targetExternalNumber: string;
}

export interface PlaceExternalCallResult {
  providerMode: ProviderMode;
  providerName: string;
  providerCallId?: string;
  externalRouteStatus: 'initiated' | 'ringing' | 'connected' | 'failed';
  isRealTelephony: boolean;
  rawResponse?: unknown;
}

export interface EndExternalCallInput {
  providerCallId?: string;
  reason: 'completed' | 'missed' | 'cancelled' | 'failed';
}

export interface EndExternalCallResult {
  externalRouteStatus: 'completed' | 'failed' | 'cancelled';
  rawResponse?: unknown;
}

export interface TelecomVoiceProvider {
  mode: ProviderMode;
  name: string;
  isRealTelephony: boolean;
  placeExternalCall(input: PlaceExternalCallInput): Promise<PlaceExternalCallResult>;
  endExternalCall(input: EndExternalCallInput): Promise<EndExternalCallResult>;
  getExternalCallStatus(providerCallId: string): Promise<string>;
}

class MockVoiceProvider implements TelecomVoiceProvider {
  mode: ProviderMode = 'mock';
  name = 'MockVoiceProvider';
  isRealTelephony = false;

  async placeExternalCall(input: PlaceExternalCallInput): Promise<PlaceExternalCallResult> {
    return {
      providerMode: this.mode,
      providerName: this.name,
      providerCallId: `mock-${Date.now()}`,
      externalRouteStatus: 'ringing',
      isRealTelephony: false,
      rawResponse: {
        message: 'Mode test: aucun téléphone réel ne sonnera',
        input,
      },
    };
  }

  async endExternalCall(input: EndExternalCallInput): Promise<EndExternalCallResult> {
    if (input.reason === 'failed') {
      return { externalRouteStatus: 'failed', rawResponse: { message: 'Mock call failed' } };
    }
    if (input.reason === 'cancelled') {
      return { externalRouteStatus: 'cancelled', rawResponse: { message: 'Mock call cancelled' } };
    }
    return { externalRouteStatus: 'completed', rawResponse: { message: 'Mock call completed' } };
  }

  async getExternalCallStatus(_providerCallId: string): Promise<string> {
    return 'ringing';
  }
}

class ApiVoiceProvider implements TelecomVoiceProvider {
  mode: ProviderMode = 'api';
  name = 'ApiVoiceProvider';
  isRealTelephony = (process.env.NEXT_PUBLIC_VOICE_REAL_ENABLED || 'false').toLowerCase() === 'true';

  async placeExternalCall(input: PlaceExternalCallInput): Promise<PlaceExternalCallResult> {
    const res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'placeExternalCall', payload: input }),
    });
    if (!res.ok) throw new Error(`VOICE_API_PLACE_FAILED:${res.status}`);
    const data = await res.json();
    return {
      providerMode: this.mode,
      providerName: data.providerName || this.name,
      providerCallId: data.providerCallId,
      externalRouteStatus: data.externalRouteStatus || 'initiated',
      isRealTelephony: !!data.isRealTelephony,
      rawResponse: data,
    };
  }

  async endExternalCall(input: EndExternalCallInput): Promise<EndExternalCallResult> {
    const res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'endExternalCall', payload: input }),
    });
    if (!res.ok) throw new Error(`VOICE_API_END_FAILED:${res.status}`);
    const data = await res.json();
    return {
      externalRouteStatus: data.externalRouteStatus || 'completed',
      rawResponse: data,
    };
  }

  async getExternalCallStatus(providerCallId: string): Promise<string> {
    const res = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getExternalCallStatus', payload: { providerCallId } }),
    });
    if (!res.ok) throw new Error(`VOICE_API_STATUS_FAILED:${res.status}`);
    const data = await res.json();
    return data.externalRouteStatus || 'initiated';
  }
}

function resolveProviderMode(): ProviderMode {
  const mode = (process.env.NEXT_PUBLIC_VOICE_PROVIDER_MODE || 'mock').toLowerCase();
  if (mode === 'sip' || mode === 'api') return mode;
  return 'mock';
}

function createProvider(): TelecomVoiceProvider {
  const mode = resolveProviderMode();
  if (mode === 'mock') return new MockVoiceProvider();
  if (mode === 'api') return new ApiVoiceProvider();
  return new MockVoiceProvider(); // SIP placeholder for future server-side integration
}

export const voiceProvider = createProvider();

export function getProviderRuntimeInfo() {
  return {
    mode: voiceProvider.mode,
    name: voiceProvider.name,
    isRealTelephony: voiceProvider.isRealTelephony,
  };
}
