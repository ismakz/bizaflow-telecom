import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/app/lib/firebaseAdmin';

const TWILIO_TO_BIZAFLOW: Record<string, string> = {
  queued: 'initiated',
  initiated: 'initiated',
  ringing: 'ringing',
  'in-progress': 'answered',
  completed: 'completed',
  busy: 'failed',
  'no-answer': 'missed',
  canceled: 'cancelled',
  failed: 'failed',
};

function mapTwilioStatus(status: string) {
  return TWILIO_TO_BIZAFLOW[status] || 'failed';
}

export async function POST(req: Request) {
  try {
    const body = await req.formData();
    const providerCallId = String(body.get('CallSid') || '');
    const callStatus = String(body.get('CallStatus') || '');
    const to = String(body.get('To') || '');
    const from = String(body.get('From') || '');
    const durationRaw = String(body.get('CallDuration') || '0');
    const durationSeconds = Number.parseInt(durationRaw, 10) || 0;
    const mappedStatus = mapTwilioStatus(callStatus);

    console.log('webhook received', { providerCallId, callStatus, mappedStatus, to, from, durationSeconds });

    if (!providerCallId) {
      return NextResponse.json({ ok: false, error: 'MISSING_CALL_SID' }, { status: 400 });
    }

    const callSnap = await adminDb
      .collection('telecom_calls')
      .where('providerCallId', '==', providerCallId)
      .limit(1)
      .get();

    if (callSnap.empty) {
      console.log('call matched in Firestore', false, providerCallId);
      return NextResponse.json({ ok: true, ignored: true, reason: 'call_not_found' });
    }

    console.log('call matched in Firestore', true, providerCallId);
    const callRef = callSnap.docs[0].ref;

    await adminDb.runTransaction(async (tx) => {
      const callDoc = await tx.get(callRef);
      const callData = callDoc.data();
      if (!callData) return;

      const isFinal = ['completed', 'failed', 'missed', 'cancelled'].includes(mappedStatus);
      const userId = callData.callerUserId as string | undefined;
      const alreadyProcessed = !!callData.billingProcessed;

      const baseUpdate: Record<string, unknown> = {
        status: mappedStatus,
        externalRouteStatus: callStatus,
        providerMode: 'api',
        providerName: 'twilio',
        isRealTelephony: true,
        updatedAt: FieldValue.serverTimestamp(),
        providerResponse: {
          twilio: {
            providerCallId,
            callStatus,
            mappedStatus,
            to,
            from,
            durationSeconds,
          },
        },
      };

      if (mappedStatus === 'answered') {
        baseUpdate.answeredAt = FieldValue.serverTimestamp();
      }
      if (isFinal) {
        baseUpdate.endedAt = FieldValue.serverTimestamp();
        baseUpdate.duration = durationSeconds;
        baseUpdate.durationSeconds = durationSeconds;
      }

      if (!isFinal || mappedStatus !== 'completed' || !userId) {
        tx.update(callRef, baseUpdate);
        return;
      }

      if (alreadyProcessed) {
        console.log('duplicate ignored', providerCallId);
        tx.update(callRef, baseUpdate);
        return;
      }

      const userRef = adminDb.collection('telecom_users').doc(userId);
      const userDoc = await tx.get(userRef);
      if (!userDoc.exists) {
        tx.update(callRef, { ...baseUpdate, billingProcessed: true, billingSource: 'free', cost: 0 });
        return;
      }

      const userData = userDoc.data() || {};
      const balanceBefore = Number(userData.balance || 0);
      const bonusBefore = Number(userData.bonusBalance || 0);

      const configRef = adminDb.collection('telecom_config').doc('call_rates');
      const configDoc = await tx.get(configRef);
      const rates = (configDoc.exists ? configDoc.data() : {}) || {};
      const externalRatePerMinute = Number(rates.externalCallRatePerMinute || 0.02);
      const billedMinutes = Math.ceil(durationSeconds / 60);
      const initialCost = Math.round(billedMinutes * externalRatePerMinute * 100) / 100;

      let remainingCost = initialCost;
      let billingSource: 'pack' | 'bonus' | 'balance' | 'free' = 'free';
      let balanceAfter = balanceBefore;
      let bonusAfter = bonusBefore;

      const activePackQ = adminDb
        .collection('telecom_user_packs')
        .where('userId', '==', userId)
        .where('status', '==', 'active')
        .limit(1);
      const activePackSnap = await tx.get(activePackQ);
      if (!activePackSnap.empty) {
        const packDoc = activePackSnap.docs[0];
        const packData = packDoc.data() || {};
        const remainingExternal = Number(packData.remainingExternalMinutes || 0);
        if (remainingExternal >= billedMinutes) {
          remainingCost = 0;
          billingSource = 'pack';
          const after = remainingExternal - billedMinutes;
          tx.update(packDoc.ref, {
            remainingExternalMinutes: after,
            status: after <= 0 ? 'exhausted' : 'active',
          });
        }
      }

      if (remainingCost > 0 && bonusAfter > 0) {
        const useBonus = Math.min(remainingCost, bonusAfter);
        bonusAfter = Math.round((bonusAfter - useBonus) * 100) / 100;
        remainingCost = Math.round((remainingCost - useBonus) * 100) / 100;
        if (useBonus > 0) billingSource = remainingCost === 0 ? 'bonus' : 'balance';
      }

      if (remainingCost > 0) {
        const charge = Math.min(remainingCost, balanceAfter);
        balanceAfter = Math.round((balanceAfter - charge) * 100) / 100;
        remainingCost = Math.round((remainingCost - charge) * 100) / 100;
        if (charge > 0) billingSource = 'balance';
      }

      const chargedAmount = Math.round((initialCost - remainingCost) * 100) / 100;

      tx.update(userRef, {
        balance: balanceAfter,
        bonusBalance: bonusAfter,
      });

      if (chargedAmount > 0) {
        const txRef = adminDb.collection('telecom_transactions').doc();
        tx.set(txRef, {
          userId,
          type: 'call_charge',
          amount: chargedAmount,
          currency: 'USD',
          status: 'success',
          description: `Twilio external call ${to} — ${billedMinutes} min`,
          balanceBefore,
          balanceAfter,
          relatedCallId: callRef.id,
          createdBy: userId,
          targetTelecomNumber: to,
          createdAt: FieldValue.serverTimestamp(),
        });
        console.log('billing processed', { providerCallId, chargedAmount, billingSource });
      } else {
        console.log('billing processed', { providerCallId, chargedAmount: 0, billingSource });
      }

      tx.update(callRef, {
        ...baseUpdate,
        cost: chargedAmount,
        billingSource,
        billingProcessed: true,
      });
      console.log('Firestore update success', providerCallId);
    });

    return NextResponse.json({ ok: true, providerCallId, callStatus, mappedStatus });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'VOICE_STATUS_WEBHOOK_ERROR', detail: String(error) },
      { status: 500 }
    );
  }
}
