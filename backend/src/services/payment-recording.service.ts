import { AppDataSource } from '../config/data-source';
import {
  CashbookEntry,
  Guardian,
  Invoice,
  LedgerEntry,
  Message,
  Notification,
  Payment,
  Receipt,
  Student,
} from '../entities';
import { InvoiceStatus, PaymentMethod } from '../entities/enums';
import { generateNumber, today } from '../utils/helpers';
import { generateReceiptPdf } from '../utils/pdf';
import { findLatest, relations } from '../utils/typeorm-helpers';
import { loadSchoolBranding } from './school-branding.service';
import { postFeePaymentToGl } from './gl-posting.service';
import { sendWhatsAppReminder } from './whatsapp.service';
import {
  recordOverpaymentPrepaid,
  refreshTermClosingBalance,
  resolvePaymentTermId,
  roundMoney,
} from './term-balance.service';

export interface RecordFeePaymentInput {
  studentId: string;
  invoiceId?: string;
  amount: number;
  method: PaymentMethod;
  feeType: string;
  label: string;
  notes?: string;
  /** Acting user; used as the ledger/GL author and message sender. */
  recordedById?: string;
}

export interface RecordFeePaymentResult {
  payment: Payment;
  receipt: Receipt;
}

async function fetchStudentInvoiceBalance(
  studentId: string,
  manager = AppDataSource.manager,
): Promise<number> {
  const result = await manager.query(
    `
      SELECT COALESCE(SUM(i."totalAmount" - i."amountPaid"), 0) as owed
      FROM invoices i
      WHERE i."studentId" = $1
        AND (i."totalAmount" - i."amountPaid") > 0.005
        AND i.status NOT IN ('cancelled', 'draft', 'paid')
    `,
    [studentId],
  );
  return roundMoney(Number(result[0]?.owed || 0));
}

async function notifyLinkedParentUsersOfReceipt(
  manager: typeof AppDataSource.manager,
  senderId: string,
  student: Student,
  receipt: Receipt,
  payment: Payment,
): Promise<void> {
  const guardianRepo = manager.getRepository(Guardian);
  const messageRepo = manager.getRepository(Message);

  const guardians = await guardianRepo.find({
    where: { studentId: student.id },
    relations: relations('parent', 'parent.user'),
  });

  const parentUserIds = new Set<string>();
  for (const guardian of guardians) {
    const user = guardian.parent?.user;
    if (guardian.parent?.userId && user?.isActive !== false) {
      parentUserIds.add(guardian.parent.userId);
    }
  }
  // Never message the user who recorded the payment (avoids parent self-messages
  // when the parent pays online).
  if (senderId) parentUserIds.delete(senderId);
  if (!parentUserIds.size) return;

  const amount = Number(payment.amount);
  const subject = `Payment receipt — ${student.firstName} ${student.lastName}`;
  const body =
    `A payment of $${amount.toFixed(2)} was received for ${student.firstName} ${student.lastName}.\n\n` +
    `Receipt number: ${receipt.receiptNumber}\n` +
    `Payment reference: ${payment.paymentReference}\n` +
    `Description: ${payment.label}\n\n` +
    `Open Finance in the Parent Portal to view and download all receipts.`;

  const messages = [...parentUserIds].map((recipientId) =>
    messageRepo.create({
      senderId,
      recipientId,
      studentId: student.id,
      subject,
      body,
      isRead: false,
    }),
  );
  await messageRepo.save(messages);
}

/**
 * Records a fee payment end-to-end: creates the Payment, allocates it against
 * invoices, writes the student ledger + cashbook entries, posts the double-entry
 * general ledger journal, and issues a PDF receipt.
 *
 * Shared by the manual cashier endpoint and the Paynow webhook.
 */
export async function recordFeePayment(
  input: RecordFeePaymentInput,
): Promise<RecordFeePaymentResult> {
  const paymentAmount = Number(input.amount) || 0;
  if (paymentAmount <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }

  const studentRepo = AppDataSource.getRepository(Student);
  const student = await studentRepo.findOne({
    where: { id: input.studentId },
    relations: relations('schoolClass', 'schoolClass.form', 'guardians'),
  });
  if (!student) throw new Error('Student not found');

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const paymentRepo = queryRunner.manager.getRepository(Payment);
    const invoiceRepo = queryRunner.manager.getRepository(Invoice);
    const ledgerRepo = queryRunner.manager.getRepository(LedgerEntry);
    const cashbookRepo = queryRunner.manager.getRepository(CashbookEntry);
    const receiptRepo = queryRunner.manager.getRepository(Receipt);
    const notifRepo = queryRunner.manager.getRepository(Notification);

    const payment = await paymentRepo.save(
      paymentRepo.create({
        paymentReference: generateNumber('PAY'),
        studentId: input.studentId,
        invoiceId: input.invoiceId,
        amount: paymentAmount,
        method: input.method,
        feeType: input.feeType,
        label: input.label,
        notes: input.notes,
        recordedById: input.recordedById,
      }),
    );

    let ledgerTermId: string | undefined;
    let overpaymentRemaining = 0;
    const invoiceId = input.invoiceId;

    if (invoiceId) {
      const invoice = await invoiceRepo.findOne({ where: { id: invoiceId, studentId: input.studentId } });
      if (invoice) {
        ledgerTermId = invoice.termId || undefined;
        const due = Math.max(0, Number(invoice.totalAmount) - Number(invoice.amountPaid));
        const applied = Math.min(due, paymentAmount);
        overpaymentRemaining = roundMoney(paymentAmount - applied);
        invoice.amountPaid = Number(invoice.amountPaid) + applied;
        invoice.status =
          Number(invoice.amountPaid) >= Number(invoice.totalAmount)
            ? InvoiceStatus.PAID
            : InvoiceStatus.PARTIAL;
        await invoiceRepo.save(invoice);
      }
    } else {
      // Auto-allocate payment against outstanding invoices (oldest first).
      let remaining = paymentAmount;
      let primaryInvoiceId: string | undefined;
      const outstanding = await invoiceRepo.find({
        where: { studentId: input.studentId },
        order: { dueDate: 'ASC', createdAt: 'ASC' },
      });
      for (const inv of outstanding) {
        if (remaining <= 0) break;
        const due = Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid));
        if (due <= 0) continue;
        const applied = Math.min(due, remaining);
        inv.amountPaid = Number(inv.amountPaid) + applied;
        inv.status =
          Number(inv.amountPaid) >= Number(inv.totalAmount)
            ? InvoiceStatus.PAID
            : InvoiceStatus.PARTIAL;
        await invoiceRepo.save(inv);
        if (!primaryInvoiceId) primaryInvoiceId = inv.id;
        if (!ledgerTermId && inv.termId) ledgerTermId = inv.termId;
        remaining -= applied;
      }
      overpaymentRemaining = roundMoney(Math.max(0, remaining));
      if (primaryInvoiceId) {
        payment.invoiceId = primaryInvoiceId;
        await paymentRepo.save(payment);
      }
    }

    if (!ledgerTermId) {
      ledgerTermId = await resolvePaymentTermId(input.studentId, invoiceId);
    }

    const lastLedger = await ledgerRepo.findOne({
      where: { studentId: input.studentId },
      order: { createdAt: 'DESC' },
    });
    const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
    await ledgerRepo.save(
      ledgerRepo.create({
        studentId: input.studentId,
        termId: ledgerTermId,
        entryDate: today(),
        description: `Payment - ${input.label}`,
        debit: 0,
        credit: paymentAmount,
        balance: prevBalance - paymentAmount,
        referenceType: 'payment',
        referenceId: payment.id,
      }),
    );

    const lastCash = await findLatest(cashbookRepo);
    const cashBalance = lastCash ? Number(lastCash.balance) : 0;
    await cashbookRepo.save(
      cashbookRepo.create({
        entryDate: today(),
        type: 'receipt' as never,
        description: `${input.label} - ${student.firstName} ${student.lastName}`,
        moneyIn: paymentAmount,
        moneyOut: 0,
        balance: cashBalance + paymentAmount,
        paymentMethod: input.method,
        reference: payment.paymentReference,
        studentId: input.studentId,
        recordedById: input.recordedById,
      }),
    );

    if (input.recordedById) {
      await postFeePaymentToGl(queryRunner.manager, payment, input.recordedById);
    }

    const branding = await loadSchoolBranding();
    const receiptNumber = generateNumber('RCP');
    let linkedInvoiceNumber: string | undefined;
    if (invoiceId) {
      const linkedInv = await invoiceRepo.findOne({ where: { id: invoiceId, studentId: input.studentId } });
      linkedInvoiceNumber = linkedInv?.invoiceNumber;
    }
    const pdfPath = await generateReceiptPdf({
      receiptNumber,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      className: student.schoolClass?.name || 'N/A',
      amount: paymentAmount,
      method: input.method,
      label: input.label,
      paidAt: new Date(),
      paymentReference: payment.paymentReference,
      notes: input.notes || undefined,
      invoiceNumber: linkedInvoiceNumber,
      invoiceBalance: await fetchStudentInvoiceBalance(input.studentId, queryRunner.manager),
      ...branding,
    });

    const receipt = await receiptRepo.save(
      receiptRepo.create({
        receiptNumber,
        paymentId: payment.id,
        pdfPath,
      }),
    );

    if (input.recordedById) {
      await notifyLinkedParentUsersOfReceipt(
        queryRunner.manager,
        input.recordedById,
        student,
        receipt,
        payment,
      );
    }

    await notifRepo.save(
      notifRepo.create({
        title: 'Payment Received',
        message: `${student.firstName} ${student.lastName} (${student.schoolClass?.name}) paid $${paymentAmount} for ${input.label}`,
        type: 'payment',
        metadata: {
          studentId: input.studentId,
          classId: student.classId,
          amount: paymentAmount,
          label: input.label,
        },
      }),
    );

    await queryRunner.commitTransaction();

    if (overpaymentRemaining > 0.005) {
      await recordOverpaymentPrepaid(input.studentId, ledgerTermId, overpaymentRemaining);
    }
    if (ledgerTermId) {
      await refreshTermClosingBalance(input.studentId, ledgerTermId);
    }

    const primaryGuardian = student.guardians?.find((g) => g.isPrimary) || student.guardians?.[0];
    if (primaryGuardian?.phone) {
      try {
        await sendWhatsAppReminder(
          primaryGuardian.phone,
          `Payment received for ${student.firstName}: $${paymentAmount} (${input.label}). Receipt: ${receiptNumber}`,
        );
      } catch {
        // WhatsApp delivery should not rollback successful accounting writes.
      }
    }

    return { payment, receipt };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
