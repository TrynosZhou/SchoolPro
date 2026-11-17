import { AppDataSource } from '../config/data-source';
import { Invoice, PaymentIntent, User } from '../entities';
import { PaymentMethod, UserRole } from '../entities/enums';
import { getPaynowConfig, isPaynowSuccessStatus, verifyPaynowHash } from './paynow.service';
import { recordFeePayment } from './payment-recording.service';

/** Visa/card checkout has no dedicated enum value; grouped under "other". */
export function mapPaynowMethodToPaymentMethod(method: string): PaymentMethod {
  switch (String(method || '').toLowerCase()) {
    case 'ecocash':
      return PaymentMethod.ECOCASH;
    case 'onemoney':
      return PaymentMethod.ONEMONEY;
    default:
      return PaymentMethod.OTHER;
  }
}

async function resolveIntentFeeType(intent: PaymentIntent): Promise<string> {
  if (intent.invoiceId) {
    const invoice = await AppDataSource.getRepository(Invoice).findOne({
      where: { id: intent.invoiceId },
    });
    if (invoice?.feeType) return String(invoice.feeType);
  }
  return 'tuition';
}

/** GL/ledger entries need an author; fall back to an admin for unattributed online payments. */
async function resolveActorId(preferred?: string): Promise<string | undefined> {
  if (preferred) return preferred;
  const admins = await AppDataSource.getRepository(User).find({
    where: { role: UserRole.ADMIN, isActive: true },
    take: 1,
  });
  return admins[0]?.id;
}

export interface PaynowResultOutcome {
  httpStatus: number;
  message: string;
  intent?: PaymentIntent;
  finalised?: boolean;
}

/**
 * Apply a hash-verified Paynow result payload to its payment intent.
 *
 * Shared by the Paynow webhook and the portal status-poll endpoint so a payment
 * is only ever posted once, whichever path observes the success first. The
 * intent is claimed atomically before posting, which also recovers intents left
 * in "processing" by a previous crash.
 */
export async function applyPaynowResult(
  payload: Record<string, string>,
): Promise<PaynowResultOutcome> {
  const config = await getPaynowConfig();
  if (!config.enabled) {
    console.warn('[paynow] Received result but Paynow is not configured — ignoring');
    return { httpStatus: 200, message: 'ok' };
  }

  if (!verifyPaynowHash(payload, config.integrationKey)) {
    console.warn('[paynow] Rejected result with an invalid hash');
    return { httpStatus: 400, message: 'invalid hash' };
  }

  const reference = String(payload.reference || '').trim();
  const status = String(payload.status || payload.Status || '').trim();
  const paynowReference = String(payload.paynowreference || '').trim();

  if (!reference) {
    console.warn('[paynow] Result missing reference — ignoring');
    return { httpStatus: 400, message: 'reference is required' };
  }

  const intentRepo = AppDataSource.getRepository(PaymentIntent);
  const intent = await intentRepo.findOne({ where: { reference } });
  if (!intent) {
    console.warn(`[paynow] No payment intent found for reference ${reference}`);
    return { httpStatus: 200, message: 'ok' };
  }

  try {
    if (isPaynowSuccessStatus(status)) {
      const claimed = await AppDataSource.query(
        `UPDATE payment_intents
           SET status = 'processing', "updatedAt" = now()
         WHERE id = $1
           AND (status = 'pending'
                OR (status = 'processing' AND "updatedAt" < now() - interval '10 minutes'))
         RETURNING id`,
        [intent.id],
      );
      if (!claimed.length) {
        // Already finalised or being processed concurrently.
        return { httpStatus: 200, message: 'ok', intent, finalised: true };
      }

      const actorId = await resolveActorId(intent.createdById);
      const { payment } = await recordFeePayment({
        studentId: intent.studentId,
        invoiceId: intent.invoiceId,
        amount: Number(intent.amount),
        method: mapPaynowMethodToPaymentMethod(intent.method),
        feeType: await resolveIntentFeeType(intent),
        label: `Online payment (${intent.method})`,
        notes: `Paynow reference ${paynowReference || reference}`,
        recordedById: actorId,
      });

      intent.status = 'paid';
      intent.paymentId = payment.id;
      intent.paynowReference = paynowReference || intent.paynowReference;
      intent.payload = payload;
      await intentRepo.save(intent);

      console.log(
        `[paynow] Finalised ${reference}: payment ${payment.paymentReference} for $${Number(intent.amount).toFixed(2)}`,
      );
      return { httpStatus: 200, message: 'ok', intent, finalised: true };
    }

    const normalised = status.toLowerCase();
    if (['cancelled', 'failed', 'disputed', 'refunded', 'error'].includes(normalised)) {
      intent.status = normalised === 'cancelled' ? 'cancelled' : 'failed';
    } else {
      intent.status = intent.status === 'processing' ? 'pending' : intent.status;
    }
    intent.paynowReference = paynowReference || intent.paynowReference;
    intent.payload = payload;
    await intentRepo.save(intent);
    return { httpStatus: 200, message: 'ok', intent };
  } catch (err) {
    console.error('[paynow] Failed to finalise payment:', err);
    try {
      await intentRepo.update({ id: intent.id }, { status: 'pending', payload });
    } catch {
      // ignore secondary failure
    }
    return { httpStatus: 500, message: 'error', intent };
  }
}
