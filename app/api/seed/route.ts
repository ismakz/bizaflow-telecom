import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/app/lib/firebaseAdmin';
import { telecomPacks } from '@/app/lib/data';

export const dynamic = 'force-dynamic';

type SeedStep = {
  label: string;
  status: 'success' | 'skip';
  detail?: string;
};

const isProduction = process.env.NODE_ENV === 'production';

function getSeedConfig() {
  return {
    enabled: !isProduction || process.env.SEED_ENABLED === 'true',
    secret: process.env.SEED_SECRET || (!isProduction ? 'BIZAFLOW-SEED-2026' : ''),
    ceoEmail: process.env.CEO_EMAIL || 'ceo@bizaflow.app',
    ceoPassword: process.env.CEO_INITIAL_PASSWORD || (!isProduction ? 'Bizaflow@2026' : ''),
  };
}

async function getNextTelecomNumber(): Promise<string> {
  const counterRef = adminDb.collection('telecom_config').doc('counter');

  return adminDb.runTransaction(async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const nextValue = counterSnap.exists
      ? Number(counterSnap.data()?.lastNumber || 10000) + 1
      : 10001;

    transaction.set(counterRef, { lastNumber: nextValue }, { merge: true });
    return `BZT-${nextValue}`;
  });
}

async function seedTelecomPacksServer(): Promise<number> {
  let upserted = 0;
  const batch = adminDb.batch();

  for (const pack of telecomPacks) {
    batch.set(
      adminDb.collection('telecom_packs').doc(pack.packId),
      {
        ...pack,
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    upserted++;
  }

  await batch.commit();
  return upserted;
}

async function seedTelecomDirectoryServer(): Promise<number> {
  const usersSnap = await adminDb.collection('telecom_users').get();
  const batch = adminDb.batch();
  let synced = 0;

  for (const docSnap of usersSnap.docs) {
    const data = docSnap.data();
    const name = data.name || data.displayName || data.email || 'Utilisateur Bizaflow';
    const telecomNumber = data.telecomNumber || '';

    batch.set(
      adminDb.collection('telecom_directory').doc(docSnap.id),
      {
        uid: docSnap.id,
        name,
        telecomNumber,
        status: data.status || 'pending',
        isCallable: data.status === 'approved',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    synced++;
  }

  await batch.commit();
  return synced;
}

export async function POST(request: Request) {
  const config = getSeedConfig();

  if (!config.enabled) {
    return NextResponse.json({ error: 'Seed endpoint disabled' }, { status: 404 });
  }

  if (!config.secret || !config.ceoPassword) {
    return NextResponse.json(
      { error: 'Seed configuration incomplete. Set SEED_SECRET and CEO_INITIAL_PASSWORD.' },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => null)) as { secret?: string } | null;
  if (!body?.secret || body.secret !== config.secret) {
    return NextResponse.json({ error: 'Cle secrete invalide' }, { status: 403 });
  }

  const steps: SeedStep[] = [];
  const auth = getAuth();

  let uid = '';
  try {
    const existingUser = await auth.getUserByEmail(config.ceoEmail);
    uid = existingUser.uid;
    await auth.updateUser(uid, {
      password: config.ceoPassword,
      displayName: 'CEO Bizaflow',
      emailVerified: true,
      disabled: false,
    });
    steps.push({ label: 'Compte Firebase Auth', status: 'skip', detail: 'Compte existant mis a jour' });
  } catch (error: unknown) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code !== 'auth/user-not-found') throw error;

    const createdUser = await auth.createUser({
      email: config.ceoEmail,
      password: config.ceoPassword,
      displayName: 'CEO Bizaflow',
      emailVerified: true,
    });
    uid = createdUser.uid;
    steps.push({ label: 'Compte Firebase Auth', status: 'success', detail: 'Compte cree' });
  }

  const userRef = adminDb.collection('telecom_users').doc(uid);
  const userSnap = await userRef.get();
  const existingProfile = userSnap.data();
  let telecomNumber = existingProfile?.telecomNumber as string | undefined;

  if (!telecomNumber) {
    telecomNumber = await getNextTelecomNumber();
  }

  await userRef.set(
    {
      uid,
      name: 'CEO Bizaflow',
      email: config.ceoEmail,
      telecomNumber,
      role: 'ceo',
      status: 'approved',
      balance: existingProfile?.balance ?? 1000,
      mustChangePassword: false,
      createdAt: existingProfile?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  steps.push({ label: 'Profil Firestore CEO', status: userSnap.exists ? 'skip' : 'success', detail: telecomNumber });

  const packs = await seedTelecomPacksServer();
  steps.push({ label: 'Packs telecom', status: 'success', detail: `${packs} packs synchronises` });

  const directory = await seedTelecomDirectoryServer();
  steps.push({ label: 'Repertoire telecom', status: 'success', detail: `${directory} entrees synchronisees` });

  return NextResponse.json({
    ok: true,
    ceoEmail: config.ceoEmail,
    temporaryPassword: config.ceoPassword,
    telecomNumber,
    uid,
    steps,
  });
}
