# Refonte UI SMS

## Objectif
Séparer clairement la messagerie interne (SMS/chat) de la logique d'appels audio.

## Elements deplaces
- La section de navigation `Interne` est renommee en `SMS` dans `app/components/BottomNav.tsx`.
- Le flux principal `app/telecom/page.tsx` devient un ecran SMS uniquement:
  - liste des conversations/contacts a gauche,
  - zone de messages a droite,
  - input d'envoi fixe en bas.

## Elements retires de la section SMS
- Toute la logique d'appels internes et WebRTC:
  - etats d'appel entrant/en cours,
  - boutons `Appel audio`, `Accepter`, `Refuser`, `Terminer`,
  - debug WebRTC (ICE, signaling, remote stream, logs),
  - controle audio distant et sonnerie d'appel.
- Historique des appels internes retire de l'ecran SMS.

## Ce qui est conserve (non regressif)
- Collections Firestore existantes non modifiees.
- Envoi/reception de messages internes conserve.
- Suivi des conversations et compteur non lus conserves.
- Notifications push de nouveaux messages conservees.

## UX / responsive mobile
- Sur mobile, la liste des conversations prend tout l'ecran.
- A la selection d'une conversation, l'ecran bascule en plein ecran conversation.
- Bouton `Retour` pour revenir a la liste des conversations.

## Separation future appels/audio
- `app/telecom/page.tsx` est desormais limite au module SMS/chat.
- La logique appels/audio sera implementee dans une section dediee (module appels) sans re-melanger les usages dans l'ecran SMS.
