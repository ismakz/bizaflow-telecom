# Phase interne - Calls + Chat Bizaflow Telecom

## Objectif

Cette phase stabilise la communication interne Bizaflow Telecom avant toute activation des appels externes vers MTN, Airtel, Telnyx, Twilio ou autres providers.

Les appels internes Bizaflow vers Bizaflow restent separes des appels externes. Par defaut, ils sont gratuits et ne consomment pas les minutes provider.

## Fichiers modifies

- `app/lib/internalTelecom.ts`
- `app/lib/pushNotifications.ts`
- `app/telecom/page.tsx`
- `app/telecom/call/[callId]/page.tsx`
- `app/components/BottomNav.tsx`
- `app/firebase-messaging-sw.js/route.ts`
- `app/api/telecom/internal-calls/notify/route.ts`
- `app/lib/firestore.ts`
- `app/ceo/page.tsx`
- `next.config.ts`
- `docs/phase_internal_calls_chat.md`

## Collections utilisees

### `telecom_conversations`

- `participantIds`
- `lastMessage`
- `lastMessageAt`
- `unreadCountByUser`
- `createdAt`
- `updatedAt`

### `telecom_messages`

- `conversationId`
- `senderId`
- `receiverId`
- `body`
- `status`: `sent | delivered | read`
- `createdAt`
- `updatedAt`

### `telecom_internal_calls`

- `callerId`
- `receiverId`
- `participants`
- `callerName`
- `receiverName`
- `status`: `ringing | accepted | declined | missed | completed | failed`
- `startedAt`
- `answeredAt`
- `endedAt`
- `durationSeconds`
- `createdAt`
- `updatedAt`

### `telecom_call_signals`

- `callId`
- `callerOffer`
- `receiverAnswer`
- `callerCandidates`
- `receiverCandidates`
- `stunServers`
- `turnConfigured`
- `sessionReady`
- `createdAt`
- `updatedAt`

### `telecom_presence`

- `userId`
- `presenceStatus`: `online | offline | busy | in_call`
- `lastSeenAt`
- `updatedAt`

### `telecom_push_tokens`

- `userId`
- `token`
- `platform`: `web | android | ios | desktop`
- `deviceName`
- `isActive`
- `createdAt`
- `updatedAt`

### `telecom_internal_settings`

Document `default` avec valeurs par defaut:

- `internalCallsEnabled = true`
- `internalMessagesEnabled = true`
- `internalCallsFree = true`
- `callTimeoutSeconds = 30`
- `allowOfflineMessages = true`
- `requireActiveSubscription = true`

## Logique ajoutee

### Contacts internes

La page `/telecom` affiche les utilisateurs Bizaflow approuves, avec recherche par nom, email, numero BZT et role.

Le statut de presence est lu depuis `telecom_presence`.

### Messagerie interne

`sendInternalMessage()` cree ou met a jour une conversation, ajoute un message dans `telecom_messages`, met a jour le dernier message et incremente le compteur non lu du destinataire.

`markMessageAsRead()` passe les messages recus a `read` et remet le compteur non lu de l'utilisateur courant a zero.

### Appels internes

`startInternalCall()` cree un appel `ringing`, cree une entree de signalisation WebRTC et place l'appelant en `in_call`.

`acceptInternalCall()` passe l'appel a `accepted` et marque la session comme prete.

`declineInternalCall()` passe l'appel a `declined`.

`endInternalCall()` termine l'appel et calcule une duree.

`markInternalCallMissed()` passe l'appel a `missed` si personne ne repond.

### Notification d'appel entrant

Quand A appelle B:

1. `startInternalCall()` cree l'appel `ringing`.
2. La page `/telecom` appelle `POST /api/telecom/internal-calls/notify`.
3. L'API verifie le token Firebase Auth du caller.
4. L'API verifie que le `callId` existe, que l'appel est encore `ringing`, et que le caller est bien `callerId`.
5. L'API lit les tokens actifs de B dans `telecom_push_tokens`.
6. Firebase Cloud Messaging envoie une notification web:
   - titre: `Appel Bizaflow Telecom`
   - message: `{nom} vous appelle`
   - lien: `/telecom/call/{callId}`

La notification est best-effort: si B n'a pas encore active les notifications, l'appel temps reel Firestore continue de fonctionner lorsque l'application est ouverte.

### Service worker

Le service worker est servi dynamiquement par:

- `/firebase-messaging-sw.js`

Il gere:

- reception Firebase Messaging en arriere-plan;
- affichage notification persistante;
- vibration si supportee;
- actions visibles `Accepter` / `Refuser`;
- clic notification vers `/telecom/call/{callId}`.

Pour activer le push web, ajouter dans Vercel et `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
```

La cle VAPID se genere dans Firebase Console -> Cloud Messaging -> Web Push certificates.

### Sonnerie locale

Quand l'application est ouverte:

- l'appel entrant declenche une modal/alerte dans `/telecom`;
- une sonnerie douce est generee par Web Audio API;
- le navigateur vibre si `navigator.vibrate` est supporte;
- le bouton `Couper` arrete la sonnerie;
- `Accepter`, `Refuser`, `Terminer` arretent aussi la sonnerie.

Si le navigateur bloque l'audio automatique, la notification push reste la methode principale.

### Signalisation WebRTC

La structure `telecom_call_signals` est prete pour:

- offer
- answer
- ICE candidates
- STUN public par defaut: `stun:stun.l.google.com:19302`

TURN n'est pas encore configure. L'interface affiche donc un etat propre: session audio interne prete, TURN a ajouter ensuite.

### Dashboard CEO

Le dashboard CEO affiche maintenant:

- total messages internes
- appels internes aujourd'hui
- appels internes manques
- duree moyenne
- taux d'echec
- utilisateurs les plus actifs

Le CEO voit des statistiques globales, pas le contenu des messages prives.

## Comment tester

1. Creer ou approuver au moins deux utilisateurs Bizaflow Telecom.
2. Ouvrir `/telecom` avec l'utilisateur A.
3. Selectionner l'utilisateur B dans la liste.
4. Envoyer un message.
5. Ouvrir une autre session navigateur avec l'utilisateur B.
6. Verifier que le message apparait et que le compteur non lu baisse apres ouverture.
7. Depuis A, cliquer `Appel audio`.
8. Depuis B, verifier la notification d'appel entrant.
9. Cliquer `Accepter`, puis `Terminer`.
10. Refaire un appel puis cliquer `Refuser`.
11. Refaire un appel sans reponse et attendre le timeout pour obtenir `missed`.
12. Verifier le journal appels internes sur `/telecom`.
13. Verifier les statistiques dans `/ceo`.
14. Autoriser les notifications, fermer ou mettre l'application en arriere-plan, puis rappeler B.
15. Cliquer la notification et verifier l'ouverture de `/telecom/call/{callId}`.
16. Refuser ou laisser expirer pour verifier `declined` ou `missed`.

## Tests techniques executes

- `npm run build`
- `npm run lint`

## Limites connues

- La signalisation WebRTC est structuree mais le flux media complet n'est pas encore branche.
- Les push notifications web exigent `NEXT_PUBLIC_FIREBASE_VAPID_KEY` et une permission utilisateur.
- Sur navigateur/PWA, un OS peut limiter la sonnerie si l'application est totalement fermee.
- La sonnerie audio complete est fiable surtout quand l'application est ouverte ou reveillee par notification.
- TURN n'est pas configure; certains reseaux mobiles ou NAT stricts pourront bloquer l'audio reel.
- Les statuts `online/offline` dependent de la presence navigateur et peuvent rester imparfaits si un onglet est ferme brutalement.
- Les regles Firestore doivent etre durcies pour garantir cote base qu'un utilisateur ne lit que ses conversations.
- Les messages sont prives fonctionnellement dans l'UI; l'audit CEO affiche seulement les statistiques.

## Prochaine etape

1. Ajouter les regles Firestore de securite pour conversations, messages, presence et appels.
2. Brancher WebRTC complet: `getUserMedia`, offer, answer, ICE candidates.
3. Ajouter TURN server pour fiabilite reseaux mobiles.
4. Prevoir une app mobile native Android/iOS pour une sonnerie type WhatsApp si l'experience PWA est insuffisante.
5. Ajouter providers externes Telnyx / Africa's Talking apres stabilisation de l'interne.
