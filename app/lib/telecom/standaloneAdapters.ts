import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/app/lib/firebaseAdmin';
import type {
  AuthPort,
  LogInput,
  LogPort,
  NotificationInput,
  NotificationPort,
  TelecomModulePorts,
  TelecomUserIdentity,
  TransactionLogInput,
  WalletBalance,
  WalletCreditInput,
  WalletDebitInput,
  WalletMutationResult,
  WalletPort,
} from '@/app/lib/telecom/ports';
import type { UserRole } from '@/app/lib/types';

type StandaloneAdapterOptions = {
  currency: string;
};

function mapUserDoc(uid: string, data: FirebaseFirestore.DocumentData | undefined): TelecomUserIdentity | null {
  if (!data) return null;
  return {
    uid,
    name: String(data.name || data.email || 'Utilisateur Bizaflow'),
    email: String(data.email || ''),
    role: data.role || 'user',
    status: data.status || 'pending',
    telecomNumber: data.telecomNumber || undefined,
  };
}

class StandaloneAuthAdapter implements AuthPort {
  async getCurrentUser(): Promise<TelecomUserIdentity | null> {
    return null;
  }

  async getUserById(userId: string): Promise<TelecomUserIdentity | null> {
    const snap = await adminDb.collection('telecom_users').doc(userId).get();
    return mapUserDoc(snap.id, snap.data());
  }

  async assertRole(userId: string, allowedRoles: UserRole[]): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user || !allowedRoles.includes(user.role)) {
      throw new Error('TELECOM_FORBIDDEN_ROLE');
    }
  }
}

class StandaloneWalletAdapter implements WalletPort {
  constructor(private readonly currency: string) {}

  async getUserBalance(userId: string): Promise<WalletBalance> {
    const snap = await adminDb.collection('telecom_users').doc(userId).get();
    if (!snap.exists) throw new Error('TELECOM_USER_NOT_FOUND');
    return {
      userId,
      balance: Number(snap.data()?.balance || 0),
      currency: this.currency,
    };
  }

  async debitUserBalance(input: WalletDebitInput): Promise<WalletMutationResult> {
    if (input.amount <= 0) throw new Error('TELECOM_INVALID_AMOUNT');

    return adminDb.runTransaction(async (transaction) => {
      const userRef = adminDb.collection('telecom_users').doc(input.userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error('TELECOM_USER_NOT_FOUND');

      const balanceBefore = Number(userSnap.data()?.balance || 0);
      if (balanceBefore < input.amount) throw new Error('TELECOM_INSUFFICIENT_BALANCE');

      const balanceAfter = Math.round((balanceBefore - input.amount) * 100) / 100;
      transaction.update(userRef, { balance: balanceAfter });

      const txRef = adminDb.collection('telecom_transactions').doc();
      transaction.set(txRef, {
        userId: input.userId,
        type: 'telecom_debit',
        amount: input.amount,
        currency: input.currency,
        status: 'success',
        description: input.reason,
        balanceBefore,
        balanceAfter,
        relatedCallId: input.referenceId || null,
        createdBy: input.userId,
        createdAt: FieldValue.serverTimestamp(),
      });

      return { transactionId: txRef.id, balanceBefore, balanceAfter };
    });
  }

  async creditUserBalance(input: WalletCreditInput): Promise<WalletMutationResult> {
    if (input.amount <= 0) throw new Error('TELECOM_INVALID_AMOUNT');

    return adminDb.runTransaction(async (transaction) => {
      const userRef = adminDb.collection('telecom_users').doc(input.userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error('TELECOM_USER_NOT_FOUND');

      const balanceBefore = Number(userSnap.data()?.balance || 0);
      const balanceAfter = Math.round((balanceBefore + input.amount) * 100) / 100;
      transaction.update(userRef, { balance: balanceAfter });

      const txRef = adminDb.collection('telecom_transactions').doc();
      transaction.set(txRef, {
        userId: input.userId,
        type: 'telecom_credit',
        amount: input.amount,
        currency: input.currency,
        status: 'success',
        description: input.reason,
        balanceBefore,
        balanceAfter,
        relatedCallId: input.referenceId || null,
        createdBy: input.userId,
        createdAt: FieldValue.serverTimestamp(),
      });

      return { transactionId: txRef.id, balanceBefore, balanceAfter };
    });
  }

  async logTransaction(input: TransactionLogInput): Promise<string> {
    const ref = await adminDb.collection('telecom_transactions').add({
      ...input,
      createdAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  }
}

class StandaloneNotificationAdapter implements NotificationPort {
  async sendNotification(input: NotificationInput): Promise<void> {
    await adminDb.collection('telecom_notifications').add({
      ...input,
      status: 'queued',
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

class StandaloneLogAdapter implements LogPort {
  async log(input: LogInput): Promise<void> {
    await adminDb.collection('telecom_logs').add({
      ...input,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

export function createStandaloneTelecomPorts(options: StandaloneAdapterOptions): TelecomModulePorts {
  return {
    auth: new StandaloneAuthAdapter(),
    wallet: new StandaloneWalletAdapter(options.currency),
    notifications: new StandaloneNotificationAdapter(),
    logs: new StandaloneLogAdapter(),
  };
}
