import 'reflect-metadata';
import dotenv from 'dotenv';
import { AppDataSource } from '../config/data-source';
import { Invoice, InvoiceLine, LedgerEntry, StudentTermBalance, Term } from '../entities';
import { BALANCE_FORWARD_FEE_TYPE, refreshTermClosingBalance, roundMoney } from '../services/term-balance.service';
import { InvoiceStatus } from '../entities/enums';
import { In, Not } from 'typeorm';

dotenv.config();

const EPS = 0.005;

async function recomputeLedgerBalances(studentId: string): Promise<void> {
  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
  const rows = await ledgerRepo.find({
    where: { studentId },
    order: { entryDate: 'ASC', createdAt: 'ASC' },
  });
  let running = 0;
  for (const row of rows) {
    running = roundMoney(running + Number(row.debit) - Number(row.credit));
    row.balance = running;
    await ledgerRepo.save(row);
  }
}

async function supersedePriorTermInvoicesForCarryForward(studentId: string, prevTermId: string): Promise<number> {
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const invoices = await invoiceRepo.find({
    where: {
      studentId,
      termId: prevTermId,
      feeType: Not(BALANCE_FORWARD_FEE_TYPE),
    },
  });

  let superseded = 0;
  for (const inv of invoices) {
    if (inv.status === InvoiceStatus.CANCELLED || inv.status === InvoiceStatus.DRAFT) continue;
    const remaining = roundMoney(Number(inv.totalAmount) - Number(inv.amountPaid));
    if (remaining <= EPS && inv.status === InvoiceStatus.PAID) continue;
    inv.amountPaid = Number(inv.totalAmount);
    inv.status = InvoiceStatus.PAID;
    await invoiceRepo.save(inv);
    superseded += 1;
  }
  return superseded;
}

async function main() {
  await AppDataSource.initialize();
  const termRepo = AppDataSource.getRepository(Term);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const lineRepo = AppDataSource.getRepository(InvoiceLine);
  const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
  const tbRepo = AppDataSource.getRepository(StudentTermBalance);

  const duplicateGroups = await AppDataSource.query(
    `
      SELECT "schoolYearId", "termNumber", array_agg(id ORDER BY "isCurrent" DESC, "createdAt" DESC) AS ids
      FROM terms
      GROUP BY "schoolYearId", "termNumber"
      HAVING COUNT(*) > 1
    `,
  );

  if (!duplicateGroups.length) {
    console.log('No duplicate terms found.');
    await AppDataSource.destroy();
    return;
  }

  const affectedStudents = new Set<string>();
  let removedInvoices = 0;
  let supersededInvoices = 0;

  for (const group of duplicateGroups) {
    const ids: string[] = group.ids;
    const canonicalId = ids[0];
    const duplicateIds = ids.slice(1);
    const canonical = await termRepo.findOne({ where: { id: canonicalId } });
    console.log(`Repairing duplicate term ${canonical?.name} (${canonicalId}); removing ${duplicateIds.length} duplicate term record(s).`);

    for (const duplicateTermId of duplicateIds) {
      const dupCarryForwards = await invoiceRepo.find({
        where: { termId: duplicateTermId, feeType: BALANCE_FORWARD_FEE_TYPE },
      });

      for (const invoice of dupCarryForwards) {
        affectedStudents.add(invoice.studentId);
        await AppDataSource.query(`UPDATE payments SET "invoiceId" = NULL WHERE "invoiceId" = $1`, [invoice.id]);
        await ledgerRepo.delete({ referenceType: 'invoice', referenceId: invoice.id });
        await lineRepo.delete({ invoiceId: invoice.id });
        await tbRepo.update({ carryForwardInvoiceId: invoice.id }, { carryForwardInvoiceId: null });
        await invoiceRepo.remove(invoice);
        removedInvoices += 1;
      }

      await tbRepo.delete({ termId: duplicateTermId });
      await ledgerRepo.delete({ termId: duplicateTermId });
      await termRepo.delete({ id: duplicateTermId });
    }

    const canonicalCarryForwards = await invoiceRepo.find({
      where: { termId: canonicalId, feeType: BALANCE_FORWARD_FEE_TYPE },
    });

    for (const invoice of canonicalCarryForwards) {
      affectedStudents.add(invoice.studentId);
      const prevTerm = await AppDataSource.query(
        `
          SELECT id FROM terms
          WHERE "schoolYearId" = $1 AND "termNumber" = $2
          ORDER BY "isCurrent" DESC, "createdAt" DESC
          LIMIT 1
        `,
        [canonical!.schoolYearId, canonical!.termNumber - 1],
      );
      const prevTermId = prevTerm[0]?.id as string | undefined;
      if (prevTermId) {
        supersededInvoices += await supersedePriorTermInvoicesForCarryForward(invoice.studentId, prevTermId);
      }
    }
  }

  for (const studentId of affectedStudents) {
    await recomputeLedgerBalances(studentId);
    const terms = await termRepo.find({ order: { termNumber: 'ASC' } });
    for (const term of terms) {
      const tb = await tbRepo.findOne({ where: { studentId, termId: term.id } });
      if (tb?.initialized) {
        await refreshTermClosingBalance(studentId, term.id);
      }
    }
  }

  console.log(`Removed ${removedInvoices} duplicate carry-forward invoice(s).`);
  console.log(`Superseded ${supersededInvoices} prior-term invoice(s) already represented by carry-forward.`);
  console.log(`Recomputed balances for ${affectedStudents.size} student(s).`);

  await AppDataSource.destroy();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await AppDataSource.destroy();
  } catch {
    // ignore
  }
  process.exit(1);
});
