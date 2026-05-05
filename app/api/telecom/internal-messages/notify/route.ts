import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { adminDb } from '@/app/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

type NotifyBody = {
  messageId?: string;
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
  if (!body?.messageId) {
    return NextResponse.json({ ok: false, error: 'MESSAGE_ID_REQUIRED' }, { status: 400 });
  }

  const messageSnap = await adminDb.collection('telecom_messages').doc(body.messageId).get();
  if (!messageSnap.exists) {
    return NextResponse.json({ ok: false, error: 'MESSAGE_NOT_FOUND' }, { status: 404 });
  }

  const message = messageSnap.data() || {};
  if (message.senderId !== session.uid) {
    return NextResponse.json({ ok: false, error: 'MESSAGE_NOTIFY_FORBIDDEN' }, { status: 403 });
  }

  const receiverId = String(message.receiverId || '');
  if (!receiverId) {
    return NextResponse.json({ ok: false, error: 'MESSAGE_RECEIVER_REQUIRED' }, { status: 400 });
  }

  const senderSnap = await adminDb.collection('telecom_users').doc(session.uid).get();
  const sender = senderSnap.data() || {};
  const senderName = String(sender.name || sender.email || 'Contact Bizaflow');
  const rawBody = String(message.body || '');
  const preview = rawBody.length > 90 ? `${rawBody.slice(0, 87)}...` : rawBody;

  const tokensSnap = await adminDb
    .collection('telecom_push_tokens')
    .where('userId', '==', receiverId)
    .where('isActive', '==', true)
    .get();

  const tokens = tokensSnap.docs.map((docSnap) => String(docSnap.data().token || '')).filter(Boolean);
  if (tokens.length === 0) {
    return NextResponse.json({ ok: true, delivered: 0, reason: 'NO_ACTIVE_PUSH_TOKEN' });
  }

  const url = `/telecom?user=${encodeURIComponent(session.uid)}`;
  const title = 'Nouveau message Bizaflow';
  const notificationBody = `${senderName}: ${preview}`;
  let response;
  try {
    response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title,
        body: notificationBody,
      },
      data: {
        type: 'internal_message',
        title,
        body: notificationBody,
        messageId: body.messageId,
        conversationId: String(message.conversationId || ''),
        senderId: session.uid,
        senderName,
        url,
      },
      webpush: {
        fcmOptions: {
          link: url,
        },
      },
    });
  } catch (error) {
    console.error('[Bizaflow Notify] FCM internal_message error', error);
    return NextResponse.json({ ok: false, error: 'FCM_SEND_FAILED' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    delivered: response.successCount,
    failed: response.failureCount,
  });
}
