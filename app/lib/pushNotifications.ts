import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import app, { db } from '@/app/lib/firebase';

export type PushPlatform = 'web' | 'android' | 'ios' | 'desktop';

export interface PushRegistrationResult {
  ok: boolean;
  permission: NotificationPermission;
  token?: string;
  reason?: string;
}

export async function registerPushToken(userId: string): Promise<PushRegistrationResult> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, permission: 'denied', reason: 'NOTIFICATIONS_NOT_SUPPORTED' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, permission, reason: 'NOTIFICATION_PERMISSION_DENIED' };
  }

  const supported = await isSupported().catch(() => false);
  if (!supported || !('serviceWorker' in navigator)) {
    return { ok: false, permission, reason: 'PUSH_NOT_SUPPORTED' };
  }

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    return { ok: false, permission, reason: 'VAPID_KEY_NOT_CONFIGURED' };
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    return { ok: false, permission, reason: 'PUSH_TOKEN_EMPTY' };
  }

  await setDoc(
    doc(db, 'telecom_push_tokens', token),
    {
      userId,
      token,
      platform: detectPushPlatform(),
      deviceName: getDeviceName(),
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, permission, token };
}

export async function deactivatePushToken(token: string): Promise<void> {
  if (!token) return;
  await deleteDoc(doc(db, 'telecom_push_tokens', token));
}

export async function onForegroundPushMessage(
  handler: (payload: { title: string; body: string; callId?: string; callerName?: string }) => void
) {
  const supported = await isSupported().catch(() => false);
  if (!supported) return () => {};
  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => {
    handler({
      title: payload.notification?.title || 'Appel Bizaflow Telecom',
      body: payload.notification?.body || 'Appel entrant',
      callId: payload.data?.callId,
      callerName: payload.data?.callerName,
    });
  });
}

function detectPushPlatform(): PushPlatform {
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/windows|macintosh|linux/.test(ua)) return 'desktop';
  return 'web';
}

function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Navigateur web';
  return navigator.userAgent.slice(0, 120);
}

