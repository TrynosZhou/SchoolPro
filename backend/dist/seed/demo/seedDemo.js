"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDemoDatabase = seedDemoDatabase;
require("reflect-metadata");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const faker_1 = require("@faker-js/faker");
const demo_data_source_1 = require("../../config/demo-data-source");
const bootstrap_demo_schema_1 = require("../../config/bootstrap-demo-schema");
const tenant_context_1 = require("../../config/tenant-context");
const demo_accounts_1 = require("../../config/demo-accounts");
const role_permissions_service_1 = require("../../services/role-permissions.service");
const entities_1 = require("../../entities");
const enums_1 = require("../../entities/enums");
const CLASSES_PER_FORM = 2;
const STUDENTS_PER_CLASS = 8;
const ATTENDANCE_DAYS_PER_TERM = 15;
const CORE_SUBJECTS = [
    { code: 'MATH', name: 'Mathematics', short: 'Ma' },
    { code: 'ENG', name: 'English Language', short: 'Eng' },
    { code: 'SCI', name: 'Combined Science', short: 'Sci' },
    { code: 'SHONA', name: 'Shona', short: 'Sh' },
    { code: 'HIST', name: 'History', short: 'His' },
    { code: 'GEOG', name: 'Geography', short: 'Geo' },
];
const FEE_CATEGORIES = [
    { code: 'tuition', name: 'Tuition', defaultAmount: 450, icon: '🎓' },
    { code: 'bus_levy', name: 'Transport', defaultAmount: 60, icon: '🚌' },
    { code: 'uniform', name: 'Uniform', defaultAmount: 45, icon: '👕' },
    { code: 'exam', name: 'Exam Fees', defaultAmount: 25, icon: '📝' },
    { code: 'sports', name: 'Sports', defaultAmount: 20, icon: '⚽' },
];
const PERIOD_TIMES = [
    ['07:30', '08:10'],
    ['08:10', '08:50'],
    ['08:50', '09:30'],
    ['09:50', '10:30'],
    ['10:30', '11:10'],
    ['11:10', '11:50'],
    ['12:30', '13:10'],
    ['13:10', '13:50'],
];
const WEEKDAYS = [
    enums_1.DayOfWeek.MONDAY,
    enums_1.DayOfWeek.TUESDAY,
    enums_1.DayOfWeek.WEDNESDAY,
    enums_1.DayOfWeek.THURSDAY,
    enums_1.DayOfWeek.FRIDAY,
];
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
    return arr[randomInt(0, arr.length - 1)];
}
function weightedStatus() {
    const roll = Math.random();
    if (roll < 0.85)
        return enums_1.AttendanceStatus.PRESENT;
    if (roll < 0.91)
        return enums_1.AttendanceStatus.LATE;
    if (roll < 0.96)
        return enums_1.AttendanceStatus.ABSENT;
    return enums_1.AttendanceStatus.EXCUSED;
}
function gradeFor(marks) {
    if (marks >= 80)
        return 'A';
    if (marks >= 70)
        return 'B';
    if (marks >= 60)
        return 'C';
    if (marks >= 50)
        return 'D';
    return 'F';
}
function schoolDaysBetween(start, count) {
    const dates = [];
    const cursor = new Date(start);
    while (dates.length < count) {
        const day = cursor.getDay();
        if (day !== 0 && day !== 6) {
            dates.push(cursor.toISOString().slice(0, 10));
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
}
function refCode(prefix, year) {
    return `${prefix}-${year}-${faker_1.faker.string.alphanumeric({ length: 6, casing: 'upper' })}`;
}
/**
 * Wipes every table this seeder populates (CASCADE picks up any leftover
 * derived rows too — messages, notifications, receipts, etc.) in one shot.
 * Deliberately targets `DemoDataSource` directly, never the tenant-routed
 * `AppDataSource` proxy — a destructive script like this should never depend
 * on ambient request context to know which database it's touching.
 */
async function truncateDemoTables() {
    await demo_data_source_1.DemoDataSource.query(`
    TRUNCATE TABLE
      guardians, student_attendance, exam_marks, exam_types, invoice_lines, payments, invoices,
      students, class_subjects, timetable_slots, teacher_assignments, classes,
      sections, subjects, forms, terms, school_years, staff, parents, school_fees, users
    RESTART IDENTITY CASCADE
  `);
}
async function seedDemoDatabase(opts = {}) {
    await (0, bootstrap_demo_schema_1.ensureDemoSchemaBootstrapped)();
    if (!demo_data_source_1.DemoDataSource.isInitialized) {
        await demo_data_source_1.DemoDataSource.initialize();
    }
    const userRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.User);
    const existing = await userRepo.count();
    if (existing > 0 && !opts.force) {
        console.log('[seed:demo] Demo database already seeded — skipping (pass force:true to reset).');
        return;
    }
    console.log('[seed:demo] Resetting and re-seeding the demo database...');
    await truncateDemoTables();
    // Default SchoolRole rows + permission grants — reuses the same service the
    // production boot path uses, forced into the demo tenant context so it
    // operates against DemoDataSource via the AppDataSource proxy.
    await tenant_context_1.tenantContext.run({ isDemo: true }, () => (0, role_permissions_service_1.ensureDefaultRoles)());
    const filler = await bcryptjs_1.default.hash('DemoFiller@2026', 10);
    const demoHashes = new Map();
    for (const acc of demo_accounts_1.DEMO_ACCOUNTS) {
        demoHashes.set(acc.role, await bcryptjs_1.default.hash(acc.password, 10));
    }
    // --- Academic calendar -----------------------------------------------
    const yearRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.SchoolYear);
    const year = await yearRepo.save(yearRepo.create({ name: '2026', startDate: '2026-01-13', endDate: '2026-12-04', isCurrent: true }));
    const termRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.Term);
    const term1 = await termRepo.save(termRepo.create({
        name: 'Term 1', termNumber: 1, startDate: '2026-01-13', endDate: '2026-04-10',
        isCurrent: false, schoolYearId: year.id,
    }));
    const term2 = await termRepo.save(termRepo.create({
        name: 'Term 2', termNumber: 2, startDate: '2026-05-05', endDate: '2026-08-07',
        isCurrent: true, schoolYearId: year.id,
    }));
    const terms = [term1, term2];
    // --- Forms / sections / classes ---------------------------------------
    const formRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.Form);
    const sectionRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.Section);
    const classRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.SchoolClass);
    const forms = await formRepo.save([1, 2, 3, 4].map((level) => formRepo.create({ name: `Form ${level}`, level })));
    const classesByForm = new Map();
    for (const form of forms) {
        const section = await sectionRepo.save(sectionRepo.create({ name: 'Main', code: 'MAIN', formId: form.id, isActive: true }));
        const classes = [];
        for (let i = 0; i < CLASSES_PER_FORM; i++) {
            const label = String.fromCharCode(65 + i); // A, B, ...
            classes.push(await classRepo.save(classRepo.create({
                name: `${form.name}${label}`,
                formId: form.id,
                sectionId: section.id,
                capacity: 40,
            })));
        }
        classesByForm.set(form.id, classes);
    }
    const allClasses = [...classesByForm.values()].flat();
    // --- Subjects -----------------------------------------------------------
    const subjectRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.Subject);
    const subjects = await subjectRepo.save(CORE_SUBJECTS.map((s) => subjectRepo.create(s)));
    // --- Fee categories -------------------------------------------------------
    const feeRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.SchoolFee);
    const fees = await feeRepo.save(FEE_CATEGORIES.map((f, i) => feeRepo.create({ ...f, isActive: true, sortOrder: i })));
    const feeByCode = new Map(fees.map((f) => [f.code, f]));
    // --- Teachers (Staff + User) ------------------------------------------
    const staffRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.Staff);
    const teachers = [];
    // Fixed demo teacher first, so it can be pinned to a specific class below.
    const demoTeacherAcc = demo_accounts_1.DEMO_ACCOUNTS.find((a) => a.role === enums_1.UserRole.TEACHER);
    const demoTeacherUser = await userRepo.save(userRepo.create({
        email: demoTeacherAcc.email,
        username: demoTeacherAcc.username,
        passwordHash: demoHashes.get(enums_1.UserRole.TEACHER),
        firstName: demoTeacherAcc.firstName,
        lastName: demoTeacherAcc.lastName,
        role: enums_1.UserRole.TEACHER,
        phone: faker_1.faker.phone.number({ style: 'international' }),
    }));
    const demoTeacher = await staffRepo.save(staffRepo.create({
        userId: demoTeacherUser.id,
        employeeNumber: 'DEMO-EMP-0001',
        department: 'Mathematics & Sciences',
        qualification: 'B.Ed (Hons)',
        gender: 'female',
        hireDate: '2022-01-10',
    }));
    teachers.push(demoTeacher);
    const teacherCount = Math.max(subjects.length, allClasses.length);
    for (let i = 0; i < teacherCount; i++) {
        const firstName = faker_1.faker.person.firstName();
        const lastName = faker_1.faker.person.lastName();
        const user = await userRepo.save(userRepo.create({
            email: `teacher${i + 1}@schoolpro.demo`,
            username: `teacher${i + 1}.demo`,
            passwordHash: filler,
            firstName,
            lastName,
            role: enums_1.UserRole.TEACHER,
            phone: faker_1.faker.phone.number({ style: 'international' }),
        }));
        teachers.push(await staffRepo.save(staffRepo.create({
            userId: user.id,
            employeeNumber: `EMP-DEMO-${String(i + 1).padStart(4, '0')}`,
            department: pick(['Sciences', 'Languages', 'Humanities', 'Arts']),
            qualification: pick(['B.Ed', 'B.Sc (Hons)', 'Dip.Ed', 'M.Ed']),
            gender: pick(['male', 'female']),
            hireDate: faker_1.faker.date.past({ years: 8 }).toISOString().slice(0, 10),
        })));
    }
    // Class teachers: demo teacher takes Form 2A; everyone else round-robins.
    const classSubjectRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.ClassSubject);
    const teacherAssignmentRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.TeacherAssignment);
    const timetableSlotRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.TimetableSlot);
    let teacherCursor = 1; // 0 is reserved for the demo teacher, assigned manually below
    const teacherBusy = new Set(); // `${teacherId}-${day}-${period}`
    const classBusy = new Set(); // `${classId}-${day}-${period}`
    let demoTeacherClassId = null;
    for (const form of forms) {
        const classes = classesByForm.get(form.id);
        for (const cls of classes) {
            const isDemoTeacherClass = form.level === 2 && cls.name.endsWith('A');
            const classTeacher = isDemoTeacherClass ? demoTeacher : teachers[teacherCursor++ % teachers.length];
            if (isDemoTeacherClass)
                demoTeacherClassId = cls.id;
            cls.classTeacherId = classTeacher.id;
            await classRepo.save(cls);
            await teacherAssignmentRepo.save(teacherAssignmentRepo.create({
                teacherId: classTeacher.id,
                classId: cls.id,
                role: enums_1.TeacherAssignmentRole.CLASS_TEACHER,
                startDate: year.startDate,
                isActive: true,
                weeklyPeriods: 0,
            }));
            for (const subject of subjects) {
                const isDemoTeacherSubject = isDemoTeacherClass && subject.code === 'MATH';
                const subjectTeacher = isDemoTeacherSubject
                    ? demoTeacher
                    : teachers[teacherCursor++ % teachers.length];
                await classSubjectRepo.save(classSubjectRepo.create({
                    classId: cls.id,
                    subjectId: subject.id,
                    teacherId: subjectTeacher.id,
                    weeklyPeriods: 4,
                }));
                const assignment = await teacherAssignmentRepo.save(teacherAssignmentRepo.create({
                    teacherId: subjectTeacher.id,
                    classId: cls.id,
                    subjectId: subject.id,
                    role: enums_1.TeacherAssignmentRole.SUBJECT_TEACHER,
                    startDate: year.startDate,
                    isActive: true,
                    weeklyPeriods: 4,
                }));
                // Place up to 4 weekly lesson slots for this class/subject, avoiding
                // double-booking the same class or the same teacher in a given slot.
                let placed = 0;
                let attempts = 0;
                while (placed < 4 && attempts < 40) {
                    attempts++;
                    const day = pick(WEEKDAYS);
                    const periodIdx = randomInt(0, PERIOD_TIMES.length - 1);
                    const classKey = `${cls.id}-${day}-${periodIdx}`;
                    const teacherKey = `${subjectTeacher.id}-${day}-${periodIdx}`;
                    if (classBusy.has(classKey) || teacherBusy.has(teacherKey))
                        continue;
                    classBusy.add(classKey);
                    teacherBusy.add(teacherKey);
                    const [startTime, endTime] = PERIOD_TIMES[periodIdx];
                    await timetableSlotRepo.save(timetableSlotRepo.create({
                        teacherAssignmentId: assignment.id,
                        dayOfWeek: day,
                        periodNumber: periodIdx + 1,
                        startTime,
                        endTime,
                    }));
                    placed++;
                }
            }
        }
    }
    // --- Exam types -----------------------------------------------------------
    const examTypeRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.ExamType);
    const examTypes = await examTypeRepo.save([
        examTypeRepo.create({ name: 'Continuous Assessment', code: enums_1.ExamTypeName.CONTINUOUS, weight: 30 }),
        examTypeRepo.create({ name: 'Mid Term Exam', code: enums_1.ExamTypeName.MID_TERM, weight: 30 }),
        examTypeRepo.create({ name: 'End of Term Exam', code: enums_1.ExamTypeName.END_OF_TERM, weight: 40 }),
    ]);
    // --- Students, guardians, attendance, grades, billing ----------------
    const studentRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.Student);
    const parentRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.Parent);
    const guardianRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.Guardian);
    const attendanceRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.StudentAttendance);
    const examMarkRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.ExamMark);
    const invoiceRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.Invoice);
    const paymentRepo = demo_data_source_1.DemoDataSource.getRepository(entities_1.Payment);
    // Admin + accountant users double up as the "recorded by" identity on demo payments.
    const adminAcc = demo_accounts_1.DEMO_ACCOUNTS.find((a) => a.role === enums_1.UserRole.ADMIN);
    const adminUser = await userRepo.save(userRepo.create({
        email: adminAcc.email,
        username: adminAcc.username,
        passwordHash: demoHashes.get(enums_1.UserRole.ADMIN),
        firstName: adminAcc.firstName,
        lastName: adminAcc.lastName,
        role: enums_1.UserRole.ADMIN,
        phone: faker_1.faker.phone.number({ style: 'international' }),
    }));
    const accountantAcc = demo_accounts_1.DEMO_ACCOUNTS.find((a) => a.role === enums_1.UserRole.ACCOUNTANT);
    await userRepo.save(userRepo.create({
        email: accountantAcc.email,
        username: accountantAcc.username,
        passwordHash: demoHashes.get(enums_1.UserRole.ACCOUNTANT),
        firstName: accountantAcc.firstName,
        lastName: accountantAcc.lastName,
        role: enums_1.UserRole.ACCOUNTANT,
        phone: faker_1.faker.phone.number({ style: 'international' }),
    }));
    const demoParentAcc = demo_accounts_1.DEMO_ACCOUNTS.find((a) => a.role === enums_1.UserRole.PARENT);
    const demoParentUser = await userRepo.save(userRepo.create({
        email: demoParentAcc.email,
        username: demoParentAcc.username,
        passwordHash: demoHashes.get(enums_1.UserRole.PARENT),
        firstName: demoParentAcc.firstName,
        lastName: demoParentAcc.lastName,
        role: enums_1.UserRole.PARENT,
        phone: faker_1.faker.phone.number({ style: 'international' }),
    }));
    const demoParent = await parentRepo.save(parentRepo.create({ userId: demoParentUser.id, address: faker_1.faker.location.streetAddress(), receivesWhatsApp: true }));
    const demoStudentAcc = demo_accounts_1.DEMO_ACCOUNTS.find((a) => a.role === enums_1.UserRole.STUDENT);
    let admissionSeq = 1;
    let flagshipStudentCreated = false;
    const attendanceBuffer = [];
    const examMarkBuffer = [];
    for (const form of forms) {
        for (const cls of classesByForm.get(form.id)) {
            const isFlagshipClass = cls.id === demoTeacherClassId;
            for (let i = 0; i < STUDENTS_PER_CLASS; i++) {
                const isFlagship = isFlagshipClass && i === 0 && !flagshipStudentCreated;
                const gender = pick(['Male', 'Female']);
                const firstName = isFlagship ? demoStudentAcc.firstName : faker_1.faker.person.firstName(gender === 'Male' ? 'male' : 'female');
                const lastName = isFlagship ? demoStudentAcc.lastName : faker_1.faker.person.lastName();
                const admissionNumber = isFlagship ? 'DEMO0001' : `DEMO${String(++admissionSeq).padStart(4, '0')}`;
                let studentUser;
                if (isFlagship) {
                    studentUser = await userRepo.save(userRepo.create({
                        email: demoStudentAcc.email,
                        username: demoStudentAcc.username,
                        passwordHash: demoHashes.get(enums_1.UserRole.STUDENT),
                        firstName,
                        lastName,
                        role: enums_1.UserRole.STUDENT,
                        portalPasswordCustomized: true,
                    }));
                }
                const student = await studentRepo.save(studentRepo.create({
                    admissionNumber,
                    userId: studentUser?.id,
                    firstName,
                    lastName,
                    dateOfBirth: faker_1.faker.date.birthdate({ min: 11 + form.level, max: 12 + form.level, mode: 'age' }).toISOString().slice(0, 10),
                    gender,
                    address: faker_1.faker.location.streetAddress(),
                    classId: cls.id,
                    formId: form.id,
                    enrollmentDate: year.startDate,
                }));
                flagshipStudentCreated = flagshipStudentCreated || isFlagship;
                // --- Guardian / parent -------------------------------------------
                if (isFlagship) {
                    await guardianRepo.save(guardianRepo.create({
                        studentId: student.id,
                        parentId: demoParent.id,
                        fullName: `${demoParentAcc.firstName} ${demoParentAcc.lastName}`,
                        relationship: 'Mother',
                        phone: '+263771000099',
                        guardianPhone: '+263771000099',
                        email: demoParentAcc.email,
                        isPrimary: true,
                        isEmergencyContact: true,
                    }));
                }
                else if (Math.random() < 0.85) {
                    const pFirst = faker_1.faker.person.firstName();
                    const pLast = lastName;
                    const parentUser = await userRepo.save(userRepo.create({
                        email: `parent${admissionSeq}@schoolpro.demo`,
                        username: `parent${admissionSeq}.demo`,
                        passwordHash: filler,
                        firstName: pFirst,
                        lastName: pLast,
                        role: enums_1.UserRole.PARENT,
                        phone: faker_1.faker.phone.number({ style: 'international' }),
                    }));
                    const parent = await parentRepo.save(parentRepo.create({ userId: parentUser.id, address: student.address, receivesWhatsApp: true }));
                    await guardianRepo.save(guardianRepo.create({
                        studentId: student.id,
                        parentId: parent.id,
                        fullName: `${pFirst} ${pLast}`,
                        relationship: pick(['Mother', 'Father', 'Guardian']),
                        phone: parentUser.phone,
                        guardianPhone: parentUser.phone,
                        email: parentUser.email,
                        isPrimary: true,
                        isEmergencyContact: true,
                    }));
                }
                // --- Attendance (both terms) --------------------------------------
                for (const term of terms) {
                    const days = schoolDaysBetween(new Date(term.startDate), ATTENDANCE_DAYS_PER_TERM);
                    for (const date of days) {
                        attendanceBuffer.push(attendanceRepo.create({ studentId: student.id, date, status: weightedStatus() }));
                    }
                }
                // --- Exam marks (both terms x 3 exam types x class subjects) -------
                const classSubjects = subjects; // every class teaches the same 6 core subjects
                for (const term of terms) {
                    for (const examType of examTypes) {
                        for (const subject of classSubjects) {
                            const base = randomInt(38, 92);
                            const marks = Math.min(100, Math.max(0, base + randomInt(-5, 5)));
                            examMarkBuffer.push(examMarkRepo.create({
                                studentId: student.id,
                                subjectId: subject.id,
                                examTypeId: examType.id,
                                termId: term.id,
                                classId: cls.id,
                                marks,
                                grade: gradeFor(marks),
                            }));
                        }
                    }
                }
                // --- Billing: tuition + transport invoices for the current term ---
                for (const feeCode of ['tuition', 'bus_levy']) {
                    const fee = feeByCode.get(feeCode);
                    const totalAmount = Number(fee.defaultAmount);
                    const roll = Math.random();
                    // ~30% fully paid, ~40% partially paid, ~30% unpaid — a realistic spread.
                    const paidFraction = roll < 0.3 ? 1 : roll < 0.7 ? Math.random() * 0.7 + 0.1 : 0;
                    const amountPaid = Math.round(totalAmount * paidFraction * 100) / 100;
                    const status = amountPaid <= 0
                        ? enums_1.InvoiceStatus.SENT
                        : amountPaid >= totalAmount
                            ? enums_1.InvoiceStatus.PAID
                            : enums_1.InvoiceStatus.PARTIAL;
                    const invoice = await invoiceRepo.save(invoiceRepo.create({
                        invoiceNumber: refCode('INV', year.name),
                        studentId: student.id,
                        termId: term2.id,
                        feeType: feeCode,
                        description: `${fee.name} — ${term2.name} ${year.name}`,
                        totalAmount,
                        amountPaid,
                        status,
                        dueDate: term2.endDate,
                        issuedDate: term2.startDate,
                    }));
                    if (amountPaid > 0) {
                        await paymentRepo.save(paymentRepo.create({
                            paymentReference: refCode('PAY', year.name),
                            studentId: student.id,
                            invoiceId: invoice.id,
                            amount: amountPaid,
                            method: pick([enums_1.PaymentMethod.CASH, enums_1.PaymentMethod.BANK, enums_1.PaymentMethod.ECOCASH, enums_1.PaymentMethod.ONEMONEY]),
                            feeType: feeCode,
                            label: `${fee.name} payment`,
                            recordedById: adminUser.id,
                        }));
                    }
                }
            }
        }
    }
    await attendanceRepo.save(attendanceBuffer, { chunk: 300 });
    await examMarkRepo.save(examMarkBuffer, { chunk: 300 });
    console.log(`[seed:demo] Done — ${allClasses.length} classes, ${teachers.length} teachers, ` +
        `${admissionSeq} students, ${attendanceBuffer.length} attendance rows, ` +
        `${examMarkBuffer.length} exam marks.`);
    console.log('[seed:demo] Fixed demo accounts:');
    for (const acc of demo_accounts_1.DEMO_ACCOUNTS) {
        console.log(`  ${acc.label.padEnd(11)} ${acc.username} / ${acc.password}`);
    }
}
/** CLI entrypoint: `npm run seed:demo` — always forces a full reset. */
if (require.main === module) {
    seedDemoDatabase({ force: true })
        .then(() => {
        console.log('[seed:demo] Complete.');
        process.exit(0);
    })
        .catch((err) => {
        console.error('[seed:demo] Failed:', err);
        process.exit(1);
    });
}
