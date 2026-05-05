import { NextResponse } from 'next/server';
import { getTelecomModuleConfig } from '@/app/lib/telecom/init';
import { resolveProviderRoute } from '@/app/lib/telecom/providers';

export const dynamic = 'force-dynamic';

type EstimateRequestBody = {
  receiverNumber?: string;
  durationSeconds?: number;
};

export async function POST(request: Request) {
  const config = getTelecomModuleConfig();

  if (!config.moduleEnabled) {
    return NextResponse.json({ ok: false, error: 'TELECOM_MODULE_DISABLED' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as EstimateRequestBody | null;
  const receiverNumber = body?.receiverNumber?.trim();
  const durationSeconds = Number(body?.durationSeconds || 60);

  if (!receiverNumber) {
    return NextResponse.json({ ok: false, error: 'TELECOM_DESTINATION_REQUIRED' }, { status: 400 });
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 24 * 60 * 60) {
    return NextResponse.json({ ok: false, error: 'TELECOM_INVALID_DURATION' }, { status: 400 });
  }

  try {
    const route = await resolveProviderRoute({
      destination: receiverNumber,
      durationSeconds,
      currency: config.currency,
    });

    const status = route.ok ? 200 : route.reason === 'TELECOM_PROVIDER_NOT_CONFIGURED' ? 503 : 422;
    return NextResponse.json(route, {
      status,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TELECOM_ESTIMATE_FAILED';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

