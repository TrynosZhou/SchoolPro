import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import {
  BulkMessage,
  BulkMessageRecipient,
  Form,
  Guardian,
  SchoolClass,
  Student,
} from '../entities';
import { relations } from '../utils/typeorm-helpers';
import { sendTransactionalEmail } from './email.service';
import { sendSmsMessage } from './whatsapp.service';

export type BulkChannel = 'email' | 'sms';
export type BulkAudienceKind = 'parents' | 'students' | 'both';

export interface BulkAudienceFilter {
  scope: 'class' | 'form' | 'all' | 'custom';
  classId?: string;
  formId?: string;
  studentIds?: string[];
  audience: BulkAudienceKind;
}

export interface AudienceRecipient {
  studentId: string;
  userId?: string;
  name: string;
  type: 'parent' | 'student';
  email?: string;
  phone?: string;
}

function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('0')) return `+263${trimmed.slice(1)}`;
  return `+${trimmed}`;
}

async function resolveStudents(filter: BulkAudienceFilter): Promise<Student[]> {
  const repo = AppDataSource.getRepository(Student);
  if (filter.scope === 'custom') {
    const ids = (filter.studentIds || []).filter(Boolean);
    if (!ids.length) return [];
    return repo.find({ where: { id: In(ids) }, relations: relations('user') });
  }
  if (filter.scope === 'class' && filter.classId) {
    return repo.find({ where: { classId: filter.classId, isActive: true }, relations: relations('user') });
  }
  if (filter.scope === 'form' && filter.formId) {
    return repo.find({ where: { formId: filter.formId, isActive: true }, relations: relations('user') });
  }
  if (filter.scope === 'all') {
    return repo.find({ where: { isActive: true }, relations: relations('user') });
  }
  return [];
}

export async function resolveAudienceRecipients(
  filter: BulkAudienceFilter,
): Promise<AudienceRecipient[]> {
  const students = await resolveStudents(filter);
  if (!students.length) return [];

  const includeParents = filter.audience === 'parents' || filter.audience === 'both';
  const includeStudents = filter.audience === 'students' || filter.audience === 'both';

  const recipients: AudienceRecipient[] = [];
  const seen = new Set<string>();
  const push = (r: AudienceRecipient) => {
    const key = `${r.type}:${(r.email || '').toLowerCase()}|${r.phone || ''}|${r.userId || ''}`;
    if (r.email || r.phone) {
      if (seen.has(key)) return;
      seen.add(key);
    }
    recipients.push(r);
  };

  if (includeStudents) {
    for (const s of students) {
      push({
        studentId: s.id,
        userId: s.userId,
        name: `${s.firstName} ${s.lastName}`.trim(),
        type: 'student',
        email: s.user?.email || undefined,
        phone: s.user?.phone ? normalizePhone(s.user.phone) : undefined,
      });
    }
  }

  if (includeParents) {
    const studentIds = students.map((s) => s.id);
    const studentName = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]));
    const guardians = await AppDataSource.getRepository(Guardian).find({
      where: { studentId: In(studentIds) },
      relations: relations('parent', 'parent.user'),
    });
    for (const g of guardians) {
      const email = g.email || g.parent?.user?.email || undefined;
      const rawPhone = g.phone || g.parent?.user?.phone || undefined;
      const name =
        g.fullName ||
        (g.parent?.user
          ? `${g.parent.user.firstName} ${g.parent.user.lastName}`.trim()
          : `Guardian of ${studentName.get(g.studentId) || ''}`.trim());
      push({
        studentId: g.studentId,
        userId: g.parent?.userId,
        name: name || 'Guardian',
        type: 'parent',
        email,
        phone: rawPhone ? normalizePhone(rawPhone) : undefined,
      });
    }
  }

  return recipients;
}

export async function buildAudienceLabel(filter: BulkAudienceFilter): Promise<string> {
  let scopeLabel = 'All students';
  if (filter.scope === 'class' && filter.classId) {
    const c = await AppDataSource.getRepository(SchoolClass).findOne({ where: { id: filter.classId } });
    scopeLabel = c ? `Class ${c.name}` : 'Class';
  } else if (filter.scope === 'form' && filter.formId) {
    const f = await AppDataSource.getRepository(Form).findOne({ where: { id: filter.formId } });
    scopeLabel = f ? `Form ${f.name}` : 'Form';
  } else if (filter.scope === 'custom') {
    scopeLabel = `${(filter.studentIds || []).length} selected student(s)`;
  }
  const audienceLabel =
    filter.audience === 'both' ? 'Parents & Students' : filter.audience === 'parents' ? 'Parents' : 'Students';
  return `${scopeLabel} · ${audienceLabel}`;
}

export async function previewAudience(filter: BulkAudienceFilter): Promise<{
  total: number;
  parents: number;
  students: number;
  withEmail: number;
  withPhone: number;
  label: string;
  sample: { name: string; type: string; email?: string; phone?: string }[];
}> {
  const recipients = await resolveAudienceRecipients(filter);
  return {
    total: recipients.length,
    parents: recipients.filter((r) => r.type === 'parent').length,
    students: recipients.filter((r) => r.type === 'student').length,
    withEmail: recipients.filter((r) => r.email).length,
    withPhone: recipients.filter((r) => r.phone).length,
    label: await buildAudienceLabel(filter),
    sample: recipients.slice(0, 8).map((r) => ({
      name: r.name,
      type: r.type,
      email: r.email,
      phone: r.phone,
    })),
  };
}

export async function sendBulkMessage(params: {
  senderId?: string;
  subject: string;
  body: string;
  channels: BulkChannel[];
  filter: BulkAudienceFilter;
}): Promise<BulkMessage> {
  const { senderId, subject, body, channels, filter } = params;
  const recipients = await resolveAudienceRecipients(filter);
  const label = await buildAudienceLabel(filter);

  const bulkRepo = AppDataSource.getRepository(BulkMessage);
  const bulk = await bulkRepo.save(
    bulkRepo.create({
      senderId,
      subject,
      body,
      channels,
      audience: filter as unknown as Record<string, unknown>,
      audienceLabel: label,
      totalRecipients: recipients.length,
      sentCount: 0,
      failedCount: 0,
    }),
  );

  const logRepo = AppDataSource.getRepository(BulkMessageRecipient);
  let sentCount = 0;
  let failedCount = 0;

  for (const r of recipients) {
    for (const channel of channels) {
      const destination = channel === 'email' ? r.email : r.phone;
      if (!destination) {
        await logRepo.save(
          logRepo.create({
            bulkMessageId: bulk.id,
            studentId: r.studentId,
            userId: r.userId,
            recipientName: r.name,
            recipientType: r.type,
            channel,
            destination: undefined,
            status: 'skipped',
            error: channel === 'email' ? 'No email address' : 'No phone number',
          }),
        );
        continue;
      }

      let status = 'failed';
      let error: string | undefined;
      try {
        if (channel === 'email') {
          const result = await sendTransactionalEmail({ to: destination, subject, text: body });
          status = result.sent ? 'sent' : result.mock ? 'mock' : 'failed';
          error = result.error;
        } else {
          const ok = await sendSmsMessage(destination, `${subject}\n\n${body}`);
          status = ok ? 'sent' : 'failed';
        }
      } catch (err) {
        status = 'failed';
        error = err instanceof Error ? err.message : 'Send failed';
      }

      if (status === 'failed') failedCount += 1;
      else sentCount += 1;

      await logRepo.save(
        logRepo.create({
          bulkMessageId: bulk.id,
          studentId: r.studentId,
          userId: r.userId,
          recipientName: r.name,
          recipientType: r.type,
          channel,
          destination,
          status,
          error,
        }),
      );
    }
  }

  bulk.sentCount = sentCount;
  bulk.failedCount = failedCount;
  await bulkRepo.save(bulk);
  return bulk;
}
