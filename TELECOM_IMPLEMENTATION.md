# Bizaflow Telecom Implementation

## Objectif

Bizaflow Telecom est developpe en mode standalone pour faciliter les tests et la stabilite, mais son architecture doit permettre une integration future dans Bizaflow ERP sans refactor majeur.

Le module doit rester plug-and-play:

- pas de dependance forte au coeur ERP;
- services critiques accessibles via interfaces;
- routes API prefixees `/api/telecom/*` pour les nouvelles surfaces;
- mode `standalone` aujourd'hui, mode `integrated` demain.

## Modes

La variable `TELECOM_MODE` controle le mode actif.

- `standalone`: utilise les adapters locaux Firebase/Firestore du projet actuel.
- `integrated`: utilisera les vrais services Bizaflow ERP injectes via `initTelecomModule(config)`.

Variables:

```env
TELECOM_MODE=standalone
TELECOM_MODULE_ENABLED=true
TELECOM_DEFAULT_CURRENCY=USD
```

## Ports et adapters

Les fonctions critiques passent par des ports dans `app/lib/telecom/ports.ts`.

Ports actuels:

- `AuthPort`
- `WalletPort`
- `NotificationPort`
- `LogPort`

Fonctions clefs:

- `getCurrentUser()`
- `getUserById()`
- `assertRole()`
- `getUserBalance()`
- `debitUserBalance()`
- `creditUserBalance()`
- `logTransaction()`
- `sendNotification()`
- `log()`

Le mode standalone est implemente dans `app/lib/telecom/standaloneAdapters.ts`.

## Initialisation

`app/lib/telecom/init.ts` expose:

```ts
initTelecomModule(config)
getTelecomModuleConfig()
```

Exemple future integration ERP:

```ts
initTelecomModule({
  mode: 'integrated',
  currency: 'USD',
  ports: {
    auth: bizaflowAuthAdapter,
    wallet: bizapayWalletAdapter,
    notifications: bizaflowNotificationAdapter,
    logs: bizaflowLogAdapter,
  },
});
```

## API

Nouvelle convention:

- nouvelles routes Telecom: `/api/telecom/*`
- routes historiques conservees pour compatibilite: `/api/voice`, `/api/voice/status`

Route ajoutee:

- `GET /api/telecom/health`
- `POST /api/telecom/calls/estimate`

Le healthcheck expose le mode actif, l'etat des ports et les providers disponibles sans exposer de secret.

Exemple estimation:

```http
POST /api/telecom/calls/estimate
Content-Type: application/json

{
  "receiverNumber": "+243990000000",
  "durationSeconds": 60
}
```

La reponse choisit un provider configure si possible. Si aucun provider reel n'est encore configure, la route repond proprement `TELECOM_PROVIDER_NOT_CONFIGURED` avec les candidats et les prix estimes.

## Provider strategy

`TelecomProviderAdapter` est cree cote serveur dans `app/lib/telecom/providers.ts`.

Chaque provider devra implementer:

- `initiateCall()`
- `getCallStatus()`
- `handleWebhook()`
- `estimateCost()`
- `normalizePhoneNumber()`
- `validateDestination()`
- `getProviderName()`
- `isConfigured()`

Providers cibles:

- Twilio
- Telnyx
- Plivo
- Vonage
- Africa's Talking
- Termii
- Provider local futur

La normalisation telephone est centralisee dans `app/lib/telecom/phone.ts`.

Le routage actuel:

- normalise le numero en E.164;
- identifie pays et reseau quand possible;
- filtre les providers capables de traiter la destination;
- privilegie les providers africains quand ils sont configures;
- estime cout provider, prix de vente Bizaflow et marge;
- retourne un fallback quand disponible.

## Facturation

Regle:

- le frontend ne doit jamais decider le prix final;
- toute verification de solde et deduction doit passer par le serveur;
- reservation, debit, remboursement et logs doivent passer par `WalletPort`;
- les webhooks provider doivent etre verifies avant toute facturation finale.

## Strategie prix

Bizaflow Telecom ne cherche pas a battre directement MTN, Airtel, Vodacom ou Orange sur le prix brut des minutes.

Positionnement:

- les appels internes Bizaflow vers Bizaflow sont gratuits ou inclus dans un abonnement;
- les appels externes sont optimises par provider et vendus avec une marge saine;
- le prix externe peut etre competitif, mais la valeur principale est l'integration ERP;
- l'avantage client vient du CRM, de l'historique, de la supervision, de l'automatisation et de la facturation centralisee.

Le CEO doit pouvoir configurer:

- prix par minute;
- packs de minutes;
- bonus de recharge;
- cashback;
- promotions;
- reductions par utilisateur, role, pays, reseau ou provider.

La strategie par defaut est codee dans:

- `app/lib/telecom/pricing.ts`

Principe:

```ts
pricingStrategy: 'value_over_raw_operator_price'
```

Le systeme doit vendre une valeur globale superieure aux operateurs, meme si le prix a la minute n'est pas toujours le plus bas.

## Collections futures

Creer seulement si elles n'existent pas deja:

- `telecom_providers`
- `telecom_rates`
- `telecom_settings`
- `telecom_numbers`
- `telecom_wallet_logs`
- `telecom_logs`
- `telecom_notifications`
- `telecom_promotions`
- `telecom_bonus_rules`
- `telecom_user_discounts`

## Ordre de migration recommande

1. Garder les routes actuelles stables.
2. Ajouter `TelecomProviderAdapter`.
3. Creer un service serveur `telecomCallService`.
4. Faire pointer `/api/voice` vers ce service sans casser le dialer.
5. Ajouter `/api/telecom/calls/initiate`.
6. Ajouter `/api/telecom/providers`.
7. Ajouter UI CEO providers/rates/logs.
8. Migrer progressivement le dialer vers les routes `/api/telecom/*`.

## Etat actuel

Deja en place:

- auth Firebase;
- roles locaux;
- wallet simplifie via `balance`;
- transactions Firestore;
- appels internes;
- appels externes mock/API;
- Twilio partiel;
- CEO dashboard;
- packs telecom.

Nouvelle fondation ajoutee:

- ports Telecom;
- adapters standalone;
- init module;
- config mode;
- `/api/telecom/health`.
