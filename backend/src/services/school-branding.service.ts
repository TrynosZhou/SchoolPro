import { AppDataSource } from '../config/data-source';
import { SchoolSettings } from '../entities';
import { SchoolBranding } from '../utils/pdf';

export async function loadSchoolBranding(): Promise<SchoolBranding> {
  const settings = await AppDataSource.getRepository(SchoolSettings).findOne({
    where: { id: 'default' },
  });
  return {
    schoolName: settings?.schoolName,
    tagline: settings?.tagline,
    logoUrl: settings?.logoUrl,
    address: settings?.address,
    phone: settings?.phone,
    email: settings?.email,
    website: settings?.website,
    currency: settings?.currency || 'USD',
    bankAccountName: settings?.bankAccountName,
    bankName: settings?.bankName,
    bankBranch: settings?.bankBranch,
    bankAccountNumber: settings?.bankAccountNumber,
    bankPaymentReferenceNote: settings?.bankPaymentReferenceNote,
  };
}
