import { AppDataSource } from '../config/data-source';
import { SchoolSettings, Term } from '../entities';
import { buildTimetableTermVersionLabel, buildTimetableTitleLine } from '../utils/timetable-classic.pdf';
import { loadSchoolBranding } from './school-branding.service';
import { relations } from '../utils/typeorm-helpers';

function normalizeTimetableVersion(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) return '1';
  return value.slice(0, 32);
}

async function ensureSettings(): Promise<SchoolSettings> {
  const repo = AppDataSource.getRepository(SchoolSettings);
  let settings = await repo.findOne({ where: { id: 'default' } });
  if (!settings) {
    settings = repo.create({ id: 'default', timetableVersion: '1' });
    await repo.save(settings);
  }
  if (!settings.timetableVersion) {
    settings.timetableVersion = '1';
    await repo.save(settings);
  }
  return settings;
}

export async function loadTimetableContext() {
  const branding = await loadSchoolBranding();
  const settings = await ensureSettings();
  const term = await AppDataSource.getRepository(Term).findOne({
    where: { isCurrent: true },
    relations: relations('schoolYear'),
  });
  const schoolName = branding.schoolName || 'School Pro Academy';
  const termName = term?.name ?? null;
  const yearName = term?.schoolYear?.name ?? null;
  const timetableVersion = normalizeTimetableVersion(settings.timetableVersion);
  const termVersionLabel = buildTimetableTermVersionLabel(termName, yearName, timetableVersion);
  const titleLine = buildTimetableTitleLine(schoolName, termName, yearName, timetableVersion);
  return {
    branding,
    schoolName,
    termName,
    yearName,
    timetableVersion,
    termVersionLabel,
    titleLine,
    generatedAt: new Date(),
  };
}

export async function saveTimetableVersion(raw: unknown): Promise<string> {
  const version = normalizeTimetableVersion(raw);
  const repo = AppDataSource.getRepository(SchoolSettings);
  const settings = await ensureSettings();
  settings.timetableVersion = version;
  await repo.save(settings);
  return version;
}
