# Internal Telecom Debug Guide

Ce guide valide le chat interne et les appels Bizaflow vers Bizaflow sans creer un deuxieme systeme.

## Fichiers modifies

- `app/lib/internalTelecom.ts`
  - Creation de conversation si elle n'existe pas.
  - Envoi de message avec compteur non lu cote destinataire.
  - Lecture temps reel des messages avec callback d'erreur `permission-denied`.
  - Creation du document `telecom_call_signals/{callId}` avec `callerId` et `receiverId`.
  - Helpers signaling: offer caller, answer receiver, ICE candidates caller/receiver.
- `app/telecom/page.tsx`
  - WebRTC reel branche: `getUserMedia`, `RTCPeerConnection`, `addTrack`, `ontrack`, offer/answer, ICE.
  - Audio distant via `<audio autoplay playsInline>`.
  - Logs visibles dans l'UI: `Micro OK`, `ICE state`, `Remote stream recu`, offer/answer et ICE candidates.
  - Bouton `Relancer audio` si le navigateur bloque `audio.play()`.
  - Erreurs explicites si Firestore refuse la lecture ou l'ecriture du chat.
  - Toast + son court pour message entrant quand l'app est ouverte.
  - Sonnerie appel entrant en boucle via Web Audio API et bouton `Activer sonnerie` si autoplay est bloque.
- `app/api/telecom/internal-messages/notify/route.ts`
  - Push FCM pour message interne recu.
  - Titre: `Nouveau message Bizaflow`.
  - Corps: `{senderName}: {messagePreview}`.
- `app/firebase-messaging-sw.js/route.ts`
  - Notifications background separees pour `internal_message` et `internal_call`.
  - Clic message ouvre `/telecom?user={senderId}`.
  - Clic appel ouvre `/telecom/call/{callId}`.
- `app/lib/pushNotifications.ts`
  - Payload foreground etendu avec `type`, `messageId`, `conversationId`, `senderId`, `url`.
- `firestore.rules`
  - Correction de compatibilite avec le schema historique `telecom_calls`.
  - Conversations lisibles seulement par participants ou CEO.
  - Messages crees seulement par le sender dans une conversation valide.
  - Receiver seul autorise a accepter/refuser un appel.
  - Caller/receiver autorises a lire le signal WebRTC de leur call.
  - Caller limite a `callerOffer` et `callerCandidates`.
  - Receiver limite a `receiverAnswer`, `receiverCandidates` et `sessionReady`.
  - Presence et settings internes ouverts aux utilisateurs approuves selon leur usage reel.

## Cause du blocage permissions

Les nouvelles regles deployees etaient trop strictes pour le code existant:

- `telecom_calls` utilisait surtout `callerId`, `receiverId`, `userId`.
- Le dialer et l'historique existants ecrivent/lisent aussi:
  - `callerUserId`
  - `targetUserId`
  - `callerTelecomNumber`
  - `targetTelecomNumber`
  - `from`
  - `to`
  - `fromName`
  - `toName`
  - `callType`
  - `direction`
- Les listeners internes lisent aussi `telecom_presence`.
- `getInternalSettings()` lit et peut creer `telecom_internal_settings/default`.
- La lecture temps reel des messages filtre par `conversationId`, donc la regle doit autoriser via la conversation liee, pas seulement via `senderId` ou `receiverId` dans la query.

Les regles supportent maintenant les deux surfaces sans creer une deuxieme structure:

- schema historique `telecom_calls`;
- nouveau schema WebRTC `telecom_internal_calls` + `telecom_call_signals`.

## Collections et champs supportes

- `telecom_calls`
  - Participants par UID: `callerUserId`, `receiverUserId`, `targetUserId`, `callerId`, `receiverId`, `userId`.
  - Participants par numero: `from`, `to`, `callerTelecomNumber`, `targetTelecomNumber`.
- `telecom_users`
  - Self-update limite a `name`, `mustChangePassword`, `currentDocument`, `lastSeen`, `lastSeenAt`, `isOnline`, `updatedAt`, `pushToken`, `fcmToken`.
  - Champs sensibles reserves CEO: `role`, `status`, `balance`, `approvedBy`, `approvedAt`, `telecomNumber`, `uid`, `email`.
- `telecom_conversations`
  - Creation, lecture et mise a jour par participant.
- `telecom_messages`
  - Creation par `senderId == request.auth.uid`.
  - Lecture via participant de la conversation liee.
  - Update `read` par receiver.
- `telecom_internal_calls`
  - Creation par caller.
  - Accept/refuse par receiver.
  - End/missed par caller ou receiver.
- `telecom_call_signals`
  - Lecture par participants du call.
  - Caller ecrit offer/candidates caller.
  - Receiver ecrit answer/candidates receiver/sessionReady.
- `telecom_presence`
  - Lecture par utilisateurs approuves.
  - Ecriture par owner.
- `telecom_directory`
  - Lecture par utilisateurs approuves.
  - Auto-heal compatible pour les entrees publiques approuvees.

## Test manuel avec deux comptes

1. Ouvrir deux sessions separees sur `/telecom`, une avec A et une avec B.
2. Verifier que chaque compte voit l'autre dans la liste interne.
3. Depuis A, selectionner B et envoyer un message.
4. App ouverte cote B: verifier message temps reel, toast interne et son court.
5. App en arriere-plan cote B: verifier notification `Nouveau message Bizaflow`.
6. Si un toast `Permission refusee` apparait, deployer les regles Firestore puis retester.
7. Depuis A, cliquer `Appel audio`.
8. Autoriser le micro cote A.
9. App ouverte cote B: verifier modal appel entrant et sonnerie.
10. Si le navigateur bloque le son, cliquer `Activer sonnerie`.
11. App en arriere-plan cote B: verifier notification appel + vibration si supportee.
12. Cote B, cliquer `Accepter` et autoriser le micro.
13. Verifier que la sonnerie s'arrete.
14. Verifier que la voix sort dans les deux sens.
15. Regarder le panneau WebRTC dans `/telecom`:
    - `Micro: OK`
    - `Remote stream: Recu`
    - `Local tracks > 0`
    - `Remote tracks > 0`
    - `offer created`
    - `offer received`
    - `answer created`
    - `answer received`
    - `ICE candidate sent`
    - `ICE candidate received`
    - `connectionState: connected`
    - `iceConnectionState: connected` ou `completed`
16. Si pas de voix, utiliser les indicateurs:
    - `Remote stream: Non recu` = probleme `ontrack` / SDP.
    - `ICE state: failed` = reseau bloque, TURN requis.
    - `Audio play: Bloquee` = cliquer `Relancer audio`.
    - `Offer written: no` ou `Answer written: no` = probleme signaling Firestore.
    - `Local ICE` ou `Remote ICE` a 0 = candidates absents.

## Deploiement Firestore

Valider sans deployer:

```bash
firebase deploy --only firestore:rules --dry-run
```

Deployer les regles:

```bash
firebase deploy --only firestore:rules
```

Deployer regles + indexes:

```bash
firebase deploy --only firestore
```

## Notes WebRTC

- Les STUN publics suffisent souvent en local ou sur reseaux simples.
- Sur NAT strict, reseau mobile ou entreprise, configurer TURN:

```env
NEXT_PUBLIC_TURN_URL=
NEXT_PUBLIC_TURN_USERNAME=
NEXT_PUBLIC_TURN_CREDENTIAL=
```

- Si l'audio distant ne demarre pas, cliquer une fois dans la page: certains navigateurs bloquent l'autoplay.
- Les notifications push exigent `NEXT_PUBLIC_FIREBASE_VAPID_KEY` et l'autorisation utilisateur.
- Si `ICE state` reste `failed` ou `disconnected` plusieurs secondes, ne pas continuer a modifier WebRTC; preparer TURN:

```env
NEXT_PUBLIC_TURN_URL=
NEXT_PUBLIC_TURN_USERNAME=
NEXT_PUBLIC_TURN_CREDENTIAL=
```

### Checklist voix WebRTC (A <-> B)

Pendant l'appel dans `/telecom`, verifier:

- `Micro local`
- `Local tracks`
- `Offer written`
- `Offer received`
- `Answer written`
- `Answer received`
- `Local ICE`
- `Remote ICE`
- `Remote stream`
- `Remote tracks`
- `ICE state`
- `Connection`
- `Signaling`
- `Audio play`

Attendu pour voix bidirectionnelle:

- A et B ont `Micro local: OK`
- `Offer written/received: yes`
- `Answer written/received: yes`
- `Local ICE > 0` et `Remote ICE > 0`
- `Remote stream: Recu`
- `Remote tracks > 0`
- `Connection: connected`
- `ICE state: connected` ou `completed`
- `Audio play: Lecture OK`

## Verifications executees

```bash
npm run lint
npm run build
firebase deploy --only firestore:rules --dry-run
firebase deploy --only firestore:rules
```

## Notification et sonnerie — test et diagnostic

Objectif de cette phase: corriger uniquement notifications + sonnerie (sans modifier la voix WebRTC ni les regles Firestore).

### Diagnostics a verifier

- Console navigateur:
  - `Notification permission: ...`
  - `Service worker registered`
  - `Push token saved`
  - `Notify API called`
  - `Notify API success/error`
  - `Foreground message received`
- API notify:
  - `POST /api/telecom/internal-messages/notify` appelee apres envoi de message.
  - `POST /api/telecom/internal-calls/notify` appelee apres lancement d'appel.
  - En cas d'echec FCM, logs serveur `[Bizaflow Notify] FCM ... error`.

### Activation obligatoire cote utilisateur B

Sur `/telecom`, cliquer le bouton visible:

- `Activer notifications et sonnerie`

Ce bouton:

- demande la permission Notification,
- enregistre le service worker messaging,
- enregistre le token push dans `telecom_push_tokens`,
- initialise Web Audio (deblocage autoplay),
- joue un bip test,
- affiche `Notifications et sonnerie activées`.

### Sonnerie appel entrant

Quand un appel entrant est detecte:

- `startRingtone()` est lance (son continu),
- vibration declenchee si supportee,
- modal entrant affiche (`Accepter` / `Refuser`),
- arret de sonnerie sur accepter/refuser/manque/fin.

Logs attendus:

- `Incoming call detected`
- `Starting ringtone`
- `Ringtone playing`
- `Ringtone blocked by browser`
- `Stopping ringtone`

### Test obligatoire (sequence)

1. B clique `Activer notifications et sonnerie`.
2. A envoie message a B (app ouverte chez B).
3. B recoit toast interne + son court.
4. A appelle B (app ouverte chez B).
5. B recoit modal appel entrant + sonnerie.
6. B met l'app en arriere-plan.
7. A envoie un message.
8. B recoit notification systeme.
9. A appelle B.
10. B recoit notification systeme appel.
