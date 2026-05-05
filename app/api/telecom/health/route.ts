import { NextResponse } from 'next/server';
import { getTelecomModuleConfig } from '@/app/lib/telecom/init';
import { listProviderRuntime } from '@/app/lib/telecom/providers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getTelecomModuleConfig();

  return NextResponse.json(
    {
      status: 'ok',
      module: 'bizaflow-telecom',
      mode: config.mode,
      environment: config.environment,
      currency: config.currency,
      moduleEnabled: config.moduleEnabled,
      pricingStrategy: config.pricingStrategy,
      ports: {
        auth: 'configured',
        wallet: 'configured',
        notifications: 'configured',
        logs: 'configured',
      },
      providers: listProviderRuntime(config.currency),
      time: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
