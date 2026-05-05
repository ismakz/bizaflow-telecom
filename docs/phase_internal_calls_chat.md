# Phase interne - Calls + Chat Bizaflow Telecom

## Objectif

Cette phase stabilise la communication interne Bizaflow Telecom avant toute activation des appels externes vers MTN, Airtel, Telnyx, Twilio ou autres providers.

Les appels internes Bizaflow vers Bizaflow restent separes des appels externes. Par defaut, ils sont gratuits et ne consomment pas les minutes provider.

## Fichiers modifies

- `app/lib/internalTelecom.ts`
- `app/telecom/page.tsx`
- `app/components/BottomNav.tsx`
- `app/lib/firestore.ts`
- `app/ceo/page.tsx`
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

## Tests techniques executes

- `npm run build`

## Limites connues

- La signalisation WebRTC est structuree mais le flux media complet n'est pas encore branche.
- TURN n'est pas configure; certains reseaux mobiles ou NAT stricts pourront bloquer l'audio reel.
- Les statuts `online/offline` dependent de la presence navigateur et peuvent rester imparfaits si un onglet est ferme brutalement.
- Les regles Firestore doivent etre durcies pour garantir cote base qu'un utilisateur ne lit que ses conversations.
- Les messages sont prives fonctionnellement dans l'UI; l'audit CEO affiche seulement les statistiques.

## Prochaine etape

1. Ajouter les regles Firestore de securite pour conversations, messages, presence et appels.
2. Brancher WebRTC complet: `getUserMedia`, offer, answer, ICE candidates.
3. Ajouter TURN server pour fiabilite reseaux mobiles.
4. Ajouter providers externes Telnyx / Africa's Talking apres stabilisation de l'interne.

