## Bizaflow Telecom

Application Next.js + Firebase avec:
- auth / roles / statuts,
- appels internes temps reel,
- appels externes provider (mock ou API),
- facturation pack -> bonus -> balance,
- dashboards user + CEO.

## Lancement local

```bash
npm install
npm run dev
```

Copier `.env.example` vers `.env.local`, puis renseigner toutes les variables.

## Lancement sur Vercel

### 1) Variables d'environnement

Dans Vercel -> Project Settings -> Environment Variables, configurer:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_VOICE_PROVIDER_MODE` (`mock` ou `api`)
- `NEXT_PUBLIC_VOICE_REAL_ENABLED` (`true` ou `false`)
- `VOICE_PROVIDER_REAL_ENABLED` (`true` ou `false`)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `APP_BASE_URL` (URL publique Vercel)
- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY` (avec `\n`)

### 2) Firestore rules

Publier les regles Firestore en production avant le deploy.

### 3) Callback Twilio

Configurer le callback status:

`https://<ton-domaine-vercel>/api/voice/status`

Events:
- initiated
- ringing
- answered
- completed

### 4) Build et deploy

```bash
npm run build
```

Puis deploy via Vercel (integration Git recommandee).

### 5) Validation post-deploy

- connexion user approved OK
- appels internes entrant/sortant OK
- appels externes mode mock/reel selon env
- historique + transactions coherents
