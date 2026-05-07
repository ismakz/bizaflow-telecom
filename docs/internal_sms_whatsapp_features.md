# Internal SMS WhatsApp-like Features (Phase 1)

## Fonctionnalites livrees (Phase 1)
- Stabilisation de la messagerie SMS interne existante sans casser les flux actuels.
- UI SMS modernisee (style messagerie moderne) avec:
  - liste conversations + dernier message + heure,
  - compteur non lus,
  - chat plein ecran mobile avec bouton retour,
  - input fixe en bas.
- Messages texte uniquement:
  - envoi/reception temps reel,
  - statuts visuels `sent / delivered / read` pour les messages envoyes,
  - separateur par date (`Aujourd'hui`, `Hier`, date complete).
- Presence et activite:
  - affichage en ligne/hors ligne,
  - affichage `vu ...` via `lastSeenAt`,
  - indicateur `en train d'ecrire...` par conversation active.
- Notifications:
  - conservation de la logique push existante,
  - anti-duplication client maintenu sur `messageId`,
  - son court conserve.

## Fichiers modifies
- `app/telecom/page.tsx`
  - integration delivered/read/typing,
  - auto-scroll messages,
  - enrichissement liste conversations,
  - ajustements UX mobile,
  - pagination progressive (chargement par paliers).
- `app/telecom/components/ConversationList.tsx`
  - composant liste conversations (preview, heure, non-lus, etat presence).
- `app/telecom/components/ChatHeader.tsx`
  - composant en-tete chat (presence + typing + retour mobile).
- `app/telecom/components/MessageList.tsx`
  - composant messages texte (separateurs date + statut + bouton charger ancien).
- `app/telecom/components/MessageComposer.tsx`
  - composant input fixe et envoi texte (sans media/vocal/reaction/reponse).
- `app/lib/internalTelecom.ts`
  - ajout `markConversationMessagesDelivered(...)`,
  - ajout `setTypingState(...)`,
  - ajout `subscribeTypingState(...)`,
  - extension message avec `deliveredAt` et `readAt`,
  - marquage `readAt` dans `markMessageAsRead(...)`.
- `firestore.rules`
  - update `telecom_messages` pour autoriser receiver a mettre `status` a `delivered` ou `read` avec `deliveredAt` / `readAt`.

## Collections utilisees
- `telecom_conversations`
  - reste source pour dernier message, heure, non-lus.
- `telecom_messages`
  - conserve schema existant avec extension progressive:
    - `status` (`sent`, `delivered`, `read`),
    - `deliveredAt` optionnel,
    - `readAt` optionnel.
- `telecom_presence`
  - conserve `presenceStatus` et `lastSeenAt`,
  - ajoute usage `typingInConversationId` et `typingUpdatedAt` (compatibles, non bloquants).

## Regles modifiees
- `firestore.rules`:
  - `telecom_messages/{messageId}` update receiver:
    - champs autorises: `status`, `updatedAt`, `deliveredAt`, `readAt`,
    - statuts autorises: `delivered`, `read`.

## Compatibilite / migration progressive
- Aucune collection remplacee.
- Les nouveaux champs sont optionnels et n'empechent pas la lecture des anciens messages.
- Les anciens documents continuent de fonctionner sans migration destructive.
- Les anciens messages restent lisibles meme sans `deliveredAt/readAt`.

## Limites restantes (hors Phase 1)
- Pas encore de medias/fichiers/vocaux.
- Pas encore de reactions emoji ni reponses message.
- Pas encore de groupes, archivage avance et recherche globale.
- Pas encore de separation appels audio/video (prevu Phase 4).

## Verification phase
- `npm run lint`: OK (warnings non bloquants uniquement).
- `npm run build`: OK.
- Flux cibles verifies en UI: conversations, lecture messages, envoi texte, statuts, presence, typing, mobile.

## Prochaines etapes
- Phase 2: medias (images/docs/vocaux), reactions, reponses.
- Phase 3: groupes, admins, archivage/recherche avances.
- Phase 4: module appels separe (audio/video) + optimisation TURN/STUN.
