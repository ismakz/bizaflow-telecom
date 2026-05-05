export const dynamic = 'force-dynamic';

export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };

  const js = `
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(config)});
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = payload.notification?.title || 'Appel Bizaflow Telecom';
  const body = payload.notification?.body || (data.callerName ? data.callerName + ' vous appelle' : 'Appel entrant');
  self.registration.showNotification(title, {
    body,
    icon: '/logo_bizaflow.png',
    badge: '/logo_bizaflow.png',
    tag: data.callId || 'bizaflow-call',
    renotify: true,
    requireInteraction: true,
    vibrate: [240, 120, 240, 120, 240],
    data: {
      callId: data.callId || '',
      url: data.callId ? '/telecom/call/' + data.callId : '/telecom',
    },
    actions: [
      { action: 'accept', title: 'Accepter' },
      { action: 'decline', title: 'Refuser' },
    ],
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const callId = event.notification.data?.callId || '';
  const targetUrl = new URL(callId ? '/telecom/call/' + callId : '/telecom', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Service-Worker-Allowed': '/',
    },
  });
}

