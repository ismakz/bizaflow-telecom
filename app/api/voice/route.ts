import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/app/lib/firebaseAdmin';

type VoiceAction = 'placeExternalCall' | 'endExternalCall' | 'getExternalCallStatus';

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const appBaseUrl = process.env.APP_BASE_URL;
  const realEnabled = (process.env.VOICE_PROVIDER_REAL_ENABLED || 'false').toLowerCase() === 'true';
  return { accountSid, authToken, fromNumber, appBaseUrl, realEnabled };
}

function createTwilioClient() {
  const { accountSid, authToken } = getTwilioConfig();
  if (!accountSid || !authToken) return null;
  return twilio(accountSid, authToken);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body?.action as VoiceAction;
    const payload = body?.payload || {};

    if (action === 'placeExternalCall') {
      const config = getTwilioConfig();
      const client = createTwilioClient();
      const to = payload?.targetExternalNumber as string | undefined;
      if (!to) {
        return NextResponse.json({ ok: false, error: 'MISSING_TARGET_NUMBER' }, { status: 400 });
      }

      if (config.realEnabled && client && config.fromNumber) {
        const callbackUrl = config.appBaseUrl
          ? `${config.appBaseUrl}/api/voice/status`
          : undefined;
        const call = await client.calls.create({
          to,
          from: config.fromNumber,
          twiml:
            '<Response><Say language="fr-FR">Bonjour. Ceci est un appel Bizaflow Telecom en mode reel.</Say></Response>',
          statusCallback: callbackUrl,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        });

        await adminDb.collection('telecom_calls').add({
          callerUserId: payload?.callerUserId || null,
          callerTelecomNumber: payload?.callerTelecomNumber || null,
          targetUserId: null,
          targetTelecomNumber: to,
          targetExternalNumber: to,
          from: payload?.callerTelecomNumber || null,
          to,
          fromName: payload?.callerName || 'Bizaflow User',
          toName: 'External',
          type: 'external',
          callType: 'external_call',
          direction: 'outgoing',
          status: 'initiated',
          duration: 0,
          durationSeconds: 0,
          cost: 0,
          billingSource: 'free',
          providerMode: 'api',
          providerName: 'twilio',
          providerCallId: call.sid,
          externalRouteStatus: call.status || 'initiated',
          externalResponse: { source: 'placeExternalCall' },
          isRealTelephony: true,
          billingProcessed: false,
          startedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
          ok: true,
          providerName: 'Twilio',
          providerCallId: call.sid,
          externalRouteStatus: call.status || 'initiated',
          isRealTelephony: true,
          message: 'Real telephony call placed',
          payload,
        });
      }

      return NextResponse.json({
        ok: true,
        providerName: 'ServerMockVoice',
        providerCallId: `svmock-${Date.now()}`,
        externalRouteStatus: 'ringing',
        isRealTelephony: false,
        message: 'Mode test: no real phone will ring',
        payload,
      });
    }

    if (action === 'endExternalCall') {
      const config = getTwilioConfig();
      const client = createTwilioClient();
      if (config.realEnabled && client && payload?.providerCallId) {
        const updated = await client.calls(payload.providerCallId).update({ status: 'completed' });
        await adminDb
          .collection('telecom_calls')
          .where('providerCallId', '==', payload.providerCallId)
          .limit(1)
          .get()
          .then(async (snap) => {
            if (!snap.empty) {
              await snap.docs[0].ref.update({
                externalRouteStatus: updated.status || 'completed',
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          });
        return NextResponse.json({
          ok: true,
          externalRouteStatus: updated.status || 'completed',
          isRealTelephony: true,
        });
      }
      return NextResponse.json({
        ok: true,
        externalRouteStatus: payload?.reason === 'failed' ? 'failed' : 'completed',
        isRealTelephony: false,
      });
    }

    if (action === 'getExternalCallStatus') {
      const config = getTwilioConfig();
      const client = createTwilioClient();
      if (config.realEnabled && client && payload?.providerCallId) {
        const call = await client.calls(payload.providerCallId).fetch();
        return NextResponse.json({
          ok: true,
          externalRouteStatus: call.status || 'initiated',
          isRealTelephony: true,
          providerCallId: payload.providerCallId,
        });
      }
      return NextResponse.json({
        ok: true,
        externalRouteStatus: 'ringing',
        isRealTelephony: false,
        providerCallId: payload?.providerCallId || null,
      });
    }

    return NextResponse.json({ ok: false, error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'VOICE_ROUTE_ERROR', detail: String(error) },
      { status: 500 }
    );
  }
}
