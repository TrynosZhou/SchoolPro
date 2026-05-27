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
    currency: settings?.currency || 'USD',
  };
}
