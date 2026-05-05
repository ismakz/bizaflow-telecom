import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { adminDb } from '@/app/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

type NotifyBody = {
  callId?: string;
};

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return NextResponse.json({ ok: false, error: 'AUTH_REQUIRED' }, { status: 401 });
  }

  const session = await getAuth().verifyIdToken(token).catch(() => null);
  if (!session?.uid) {
    return NextResponse.json({ ok: false, error: 'AUTH_INVALID' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as NotifyBody | null;
  if (!body?.callId) {
    return NextResponse.json({ ok: false, error: 'CALL_ID_REQUIRED' }, { status: 400 });
  }

  const callSnap = await adminDb.collection('telecom_internal_calls').doc(body.callId).get();
  if (!callSnap.exists) {
    return NextResponse.json({ ok: false, error: 'CALL_NOT_FOUND' }, { status: 404 });
  }

  const call = callSnap.data()!;
  if (call.callerId !== session.uid) {
    return NextResponse.json({ ok: false, error: 'CALL_NOTIFY_FORBIDDEN' }, { status: 403 });
  }
  if (call.status !== 'ringing') {
    return NextResponse.json({ ok: false, error: 'CALL_NOT_RINGING' }, { status: 409 });
  }

  const tokensSnap = await adminDb
    .collection('telecom_push_tokens')
    .where('userId', '==', call.receiverId)
    .where('isActive', '==', true)
    .get();

  const tokens = tokensSnap.docs.map((docSnap) => String(docSnap.data().token || '')).filter(Boolean);
  if (tokens.length === 0) {
    return NextResponse.json({ ok: true, delivered: 0, reason: 'NO_ACTIVE_PUSH_TOKEN' });
  }

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: 'Appel Bizaflow Telecom',
      body: `${call.callerName || 'Un contact'} vous appelle`,
    },
    data: {
      type: 'internal_call',
      callId: body.callId,
      callerId: String(call.callerId || ''),
      callerName: String(call.callerName || 'Contact Bizaflow'),
      url: `/telecom/call/${body.callId}`,
    },
    webpush: {
      fcmOptions: {
        link: `/telecom/call/${body.callId}`,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    delivered: response.successCount,
    failed: response.failureCount,
  });
}

