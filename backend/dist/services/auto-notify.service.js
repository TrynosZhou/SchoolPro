"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAbsenceAlerts = sendAbsenceAlerts;
exports.runFeeReminderJob = runFeeReminderJob;
const typeorm_1 = require("typeorm");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const email_service_1 = require("./email.service");
const whatsapp_service_1 = require("./whatsapp.service");
const notification_settings_service_1 = require("./notification-settings.service");
function normalizePhone(phone) {
    const trimmed = phone.trim();
    if (!trimmed)
        return '';
    if (trimmed.startsWith('+'))
        return trimmed;
    if (trimmed.startsWith('0'))
        return `+263${trimmed.slice(1)}`;
    return `+${trimmed}`;
}
function fillTemplate(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}
async function getSchoolBrand() {
    const s = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({ where: { id: 'default' } });
    return { name: s?.schoolName || 'School Pro Academy', currency: s?.currency || 'USD' };
}
async function resolveStudentContacts(studentIds) {
    const map = new Map();
    if (!studentIds.length)
        return map;
    const students = await data_source_1.AppDataSource.getRepository(entities_1.Student).find({
        where: { id: (0, typeorm_1.In)(studentIds) },
        relations: (0, typeorm_helpers_1.relations)('user'),
    });
    for (const s of students) {
        const c = {
            studentId: s.id,
            studentName: `${s.firstName} ${s.lastName}`.trim(),
            userIds: new Set(),
            emails: new Set(),
            smsPhones: new Set(),
        };
        if (s.userId)
            c.userIds.add(s.userId);
        if (s.user?.email)
            c.emails.add(s.user.email);
        map.set(s.id, c);
    }
    const guardians = await data_source_1.AppDataSource.getRepository(entities_1.Guardian).find({
        where: { studentId: (0, typeorm_1.In)(studentIds) },
        relations: (0, typeorm_helpers_1.relations)('parent', 'parent.user'),
    });
    for (const g of guardians) {
        const c = map.get(g.studentId);
        if (!c)
            continue;
        const email = g.email || g.parent?.user?.email;
        if (email)
            c.emails.add(email);
        const phone = g.phone || g.parent?.user?.phone;
        if (phone && g.parent?.receivesWhatsApp !== false) {
            const n = normalizePhone(phone);
            if (n)
                c.smsPhones.add(n);
        }
        if (g.parent?.userId)
            c.userIds.add(g.parent.userId);
    }
    return map;
}
async function deliver(channels, opts) {
    const { contact, title, body, subject, type, metadata } = opts;
    if (channels.inApp && contact.userIds.size) {
        const notifRepo = data_source_1.AppDataSource.getRepository(entities_1.Notification);
        for (const userId of contact.userIds) {
            await notifRepo.save(notifRepo.create({ userId, title, message: body, type, metadata }));
        }
    }
    if (channels.email) {
        for (const email of contact.emails) {
            await (0, email_service_1.sendTransactionalEmail)({ to: email, subject, text: body });
        }
    }
    if (channels.sms) {
        for (const phone of contact.smsPhones) {
            await (0, whatsapp_service_1.sendSmsMessage)(phone, body);
        }
    }
}
/** Absence alert — called inline when students are marked absent for a day. */
async function sendAbsenceAlerts(studentIds, date) {
    const unique = [...new Set(studentIds)];
    if (!unique.length)
        return;
    const settings = await (0, notification_settings_service_1.getNotificationSettings)();
    const cfg = settings.absenceAlerts;
    if (!cfg.enabled)
        return;
    const { name: school } = await getSchoolBrand();
    const contacts = await resolveStudentContacts(unique);
    for (const studentId of unique) {
        const c = contacts.get(studentId);
        if (!c)
            continue;
        const body = fillTemplate(cfg.template, { student: c.studentName, date, school });
        await deliver(cfg.channels, {
            contact: c,
            title: 'Absence alert',
            body,
            subject: `${school}: Absence alert`,
            type: 'absence_alert',
            metadata: { studentId, date },
        });
    }
}
function daysBetween(fromISO, to) {
    const due = new Date(`${fromISO}T00:00:00`);
    const today = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((due.getTime() - today.getTime()) / 86400000);
}
/**
 * Daily fee-reminder scan: sends reminders ahead of due dates and for overdue
 * balances (respecting admin-configured timing), and flips past-due invoices
 * to the 'overdue' status.
 */
async function runFeeReminderJob() {
    const settings = await (0, notification_settings_service_1.getNotificationSettings)();
    const cfg = settings.feeReminders;
    if (!cfg.enabled)
        return { processed: 0, reminders: 0 };
    const { name: school, currency } = await getSchoolBrand();
    const now = new Date();
    // Maintenance: mark unpaid past-due invoices as overdue.
    await data_source_1.AppDataSource.query(`
    UPDATE invoices
       SET status = 'overdue'
     WHERE status IN ('sent','partial')
       AND ("totalAmount" - "amountPaid") > 0.005
       AND "dueDate" < CURRENT_DATE
  `);
    const rows = await data_source_1.AppDataSource.query(`
    SELECT i.id, i."studentId", i."dueDate"::text AS "dueDate",
           (i."totalAmount" - i."amountPaid") AS balance
      FROM invoices i
     WHERE i.status IN ('sent','partial','overdue')
       AND (i."totalAmount" - i."amountPaid") > 0.005
  `);
    const pending = [];
    for (const inv of rows) {
        const daysUntil = daysBetween(inv.dueDate, now);
        if (daysUntil >= 0) {
            if (cfg.daysBefore.includes(daysUntil))
                pending.push({ invoice: inv, overdue: false, daysOverdue: 0 });
        }
        else if (cfg.overdueEnabled) {
            const daysOverdue = -daysUntil;
            if (daysOverdue % cfg.overdueEveryDays === 0) {
                pending.push({ invoice: inv, overdue: true, daysOverdue });
            }
        }
    }
    if (!pending.length)
        return { processed: rows.length, reminders: 0 };
    const contacts = await resolveStudentContacts([...new Set(pending.map((p) => p.invoice.studentId))]);
    let reminders = 0;
    for (const p of pending) {
        const c = contacts.get(p.invoice.studentId);
        if (!c)
            continue;
        const amount = `${currency} ${Number(p.invoice.balance).toFixed(2)}`;
        const vars = {
            student: c.studentName,
            amount,
            dueDate: p.invoice.dueDate,
            daysOverdue: String(p.daysOverdue),
            school,
        };
        const body = fillTemplate(p.overdue ? cfg.overdueTemplate : cfg.template, vars);
        await deliver(cfg.channels, {
            contact: c,
            title: p.overdue ? 'Fee overdue' : 'Fee reminder',
            body,
            subject: `${school}: ${p.overdue ? 'Overdue fee balance' : 'Fee reminder'}`,
            type: 'fee_reminder',
            metadata: { invoiceId: p.invoice.id, studentId: p.invoice.studentId, overdue: p.overdue },
        });
        reminders += 1;
    }
    return { processed: rows.length, reminders };
}
