import 'reflect-metadata';
import bcrypt from 'bcryptjs';
import { faker } from '@faker-js/faker';
import { DemoDataSource } from '../../config/demo-data-source';
import { ensureDemoSchemaBootstrapped } from '../../config/bootstrap-demo-schema';
import { tenantContext } from '../../config/tenant-context';
import { DEMO_ACCOUNTS } from '../../config/demo-accounts';
import { ensureDefaultRoles } from '../../services/role-permissions.service';
import {
  User,
  SchoolYear,
  Term,
  Form,
  Section,
  SchoolClass,
  Subject,
  ClassSubject,
  TeacherAssignment,
  TimetableSlot,
  Staff,
  Parent,
  Student,
  Guardian,
  StudentAttendance,
  ExamType,
  ExamMark,
  SchoolFee,
  Invoice,
  Payment,
} from '../../entities';
import {
  UserRole,
  AttendanceStatus,
  ExamTypeName,
  InvoiceStatus,
  PaymentMethod,
  DayOfWeek,
  TeacherAssignmentRole,
} from '../../entities/enums';

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

const PERIOD_TIMES: Array<[string, string]> = [
  ['07:30', '08:10'],
  ['08:10', '08:50'],
  ['08:50', '09:30'],
  ['09:50', '10:30'],
  ['10:30', '11:10'],
  ['11:10', '11:50'],
  ['12:30', '13:10'],
  ['13:10', '13:50'],
];
const WEEKDAYS: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function weightedStatus(): AttendanceStatus {
  const roll = Math.random();
  if (roll < 0.85) return AttendanceStatus.PRESENT;
  if (roll < 0.91) return AttendanceStatus.LATE;
  if (roll < 0.96) return AttendanceStatus.ABSENT;
  return AttendanceStatus.EXCUSED;
}

function gradeFor(marks: number): string {
  if (marks >= 80) return 'A';
  if (marks >= 70) return 'B';
  if (marks >= 60) return 'C';
  if (marks >= 50) return 'D';
  return 'F';
}

function schoolDaysBetween(start: Date, count: number): string[] {
  const dates: string[] = [];
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

function refCode(prefix: string, year: string): string {
  return `${prefix}-${year}-${faker.string.alphanumeric({ length: 6, casing: 'upper' })}`;
}

/**
 * Wipes every table this seeder populates (CASCADE picks up any leftover
 * derived rows too — messages, notifications, receipts, etc.) in one shot.
 * Deliberately targets `DemoDataSource` directly, never the tenant-routed
 * `AppDataSource` proxy — a destructive script like this should never depend
 * on ambient request context to know which database it's touching.
 */
async function truncateDemoTables(): Promise<void> {
  await DemoDataSource.query(`
    TRUNCATE TABLE
      guardians, student_attendance, exam_marks, exam_types, invoice_lines, payments, invoices,
      students, class_subjects, timetable_slots, teacher_assignments, classes,
      sections, subjects, forms, terms, school_years, staff, parents, school_fees, users
    RESTART IDENTITY CASCADE
  `);
}

export async function seedDemoDatabase(opts: { force?: boolean } = {}): Promise<void> {
  await ensureDemoSchemaBootstrapped();

  if (!DemoDataSource.isInitialized) {
    await DemoDataSource.initialize();
  }

  const userRepo = DemoDataSource.getRepository(User);
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
  await tenantContext.run({ isDemo: true }, () => ensureDefaultRoles());

  const filler = await bcrypt.hash('DemoFiller@2026', 10);
  const demoHashes = new Map<string, string>();
  for (const acc of DEMO_ACCOUNTS) {
    demoHashes.set(acc.role, await bcrypt.hash(acc.password, 10));
  }

  // --- Academic calendar -----------------------------------------------
  const yearRepo = DemoDataSource.getRepository(SchoolYear);
  const year = await yearRepo.save(
    yearRepo.create({ name: '2026', startDate: '2026-01-13', endDate: '2026-12-04', isCurrent: true }),
  );

  const termRepo = DemoDataSource.getRepository(Term);
  const term1 = await termRepo.save(
    termRepo.create({
      name: 'Term 1', termNumber: 1, startDate: '2026-01-13', endDate: '2026-04-10',
      isCurrent: false, schoolYearId: year.id,
    }),
  );
  const term2 = await termRepo.save(
    termRepo.create({
      name: 'Term 2', termNumber: 2, startDate: '2026-05-05', endDate: '2026-08-07',
      isCurrent: true, schoolYearId: year.id,
    }),
  );
  const terms = [term1, term2];

  // --- Forms / sections / classes ---------------------------------------
  const formRepo = DemoDataSource.getRepository(Form);
  const sectionRepo = DemoDataSource.getRepository(Section);
  const classRepo = DemoDataSource.getRepository(SchoolClass);

  const forms = await formRepo.save(
    [1, 2, 3, 4].map((level) => formRepo.create({ name: `Form ${level}`, level })),
  );

  const classesByForm = new Map<string, SchoolClass[]>();
  for (const form of forms) {
    const section = await sectionRepo.save(
      sectionRepo.create({ name: 'Main', code: 'MAIN', formId: form.id, isActive: true }),
    );
    const classes: SchoolClass[] = [];
    for (let i = 0; i < CLASSES_PER_FORM; i++) {
      const label = String.fromCharCode(65 + i); // A, B, ...
      classes.push(
        await classRepo.save(
          classRepo.create({
            name: `${form.name}${label}`,
            formId: form.id,
            sectionId: section.id,
            capacity: 40,
          }),
        ),
      );
    }
    classesByForm.set(form.id, classes);
  }
  const allClasses = [...classesByForm.values()].flat();

  // --- Subjects -----------------------------------------------------------
  const subjectRepo = DemoDataSource.getRepository(Subject);
  const subjects = await subjectRepo.save(CORE_SUBJECTS.map((s) => subjectRepo.create(s)));

  // --- Fee categories -------------------------------------------------------
  const feeRepo = DemoDataSource.getRepository(SchoolFee);
  const fees = await feeRepo.save(
    FEE_CATEGORIES.map((f, i) =>
      feeRepo.create({ ...f, isActive: true, sortOrder: i }),
    ),
  );
  const feeByCode = new Map(fees.map((f) => [f.code, f]));

  // --- Teachers (Staff + User) ------------------------------------------
  const staffRepo = DemoDataSource.getRepository(Staff);
  const teachers: Staff[] = [];

  // Fixed demo teacher first, so it can be pinned to a specific class below.
  const demoTeacherAcc = DEMO_ACCOUNTS.find((a) => a.role === UserRole.TEACHER)!;
  const demoTeacherUser = await userRepo.save(
    userRepo.create({
      email: demoTeacherAcc.email,
      username: demoTeacherAcc.username,
      passwordHash: demoHashes.get(UserRole.TEACHER)!,
      firstName: demoTeacherAcc.firstName,
      lastName: demoTeacherAcc.lastName,
      role: UserRole.TEACHER,
      phone: faker.phone.number({ style: 'international' }),
    }),
  );
  const demoTeacher = await staffRepo.save(
    staffRepo.create({
      userId: demoTeacherUser.id,
      employeeNumber: 'DEMO-EMP-0001',
      department: 'Mathematics & Sciences',
      qualification: 'B.Ed (Hons)',
      gender: 'female',
      hireDate: '2022-01-10',
    }),
  );
  teachers.push(demoTeacher);

  const teacherCount = Math.max(subjects.length, allClasses.length);
  for (let i = 0; i < teacherCount; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const user = await userRepo.save(
      userRepo.create({
        email: `teacher${i + 1}@schoolpro.demo`,
        username: `teacher${i + 1}.demo`,
        passwordHash: filler,
        firstName,
        lastName,
        role: UserRole.TEACHER,
        phone: faker.phone.number({ style: 'international' }),
      }),
    );
    teachers.push(
      await staffRepo.save(
        staffRepo.create({
          userId: user.id,
          employeeNumber: `EMP-DEMO-${String(i + 1).padStart(4, '0')}`,
          department: pick(['Sciences', 'Languages', 'Humanities', 'Arts']),
          qualification: pick(['B.Ed', 'B.Sc (Hons)', 'Dip.Ed', 'M.Ed']),
          gender: pick(['male', 'female']),
          hireDate: faker.date.past({ years: 8 }).toISOString().slice(0, 10),
        }),
      ),
    );
  }

  // Class teachers: demo teacher takes Form 2A; everyone else round-robins.
  const classSubjectRepo = DemoDataSource.getRepository(ClassSubject);
  const teacherAssignmentRepo = DemoDataSource.getRepository(TeacherAssignment);
  const timetableSlotRepo = DemoDataSource.getRepository(TimetableSlot);

  let teacherCursor = 1; // 0 is reserved for the demo teacher, assigned manually below
  const teacherBusy = new Set<string>(); // `${teacherId}-${day}-${period}`
  const classBusy = new Set<string>(); // `${classId}-${day}-${period}`
  let demoTeacherClassId: string | null = null;

  for (const form of forms) {
    const classes = classesByForm.get(form.id)!;
    for (const cls of classes) {
      const isDemoTeacherClass = form.level === 2 && cls.name.endsWith('A');
      const classTeacher = isDemoTeacherClass ? demoTeacher : teachers[teacherCursor++ % teachers.length];
      if (isDemoTeacherClass) demoTeacherClassId = cls.id;

      cls.classTeacherId = classTeacher.id;
      await classRepo.save(cls);

      await teacherAssignmentRepo.save(
        teacherAssignmentRepo.create({
          teacherId: classTeacher.id,
          classId: cls.id,
          role: TeacherAssignmentRole.CLASS_TEACHER,
          startDate: year.startDate,
          isActive: true,
          weeklyPeriods: 0,
        }),
      );

      for (const subject of subjects) {
        const isDemoTeacherSubject = isDemoTeacherClass && subject.code === 'MATH';
        const subjectTeacher = isDemoTeacherSubject
          ? demoTeacher
          : teachers[teacherCursor++ % teachers.length];

        await classSubjectRepo.save(
          classSubjectRepo.create({
            classId: cls.id,
            subjectId: subject.id,
            teacherId: subjectTeacher.id,
            weeklyPeriods: 4,
          }),
        );

        const assignment = await teacherAssignmentRepo.save(
          teacherAssignmentRepo.create({
            teacherId: subjectTeacher.id,
            classId: cls.id,
            subjectId: subject.id,
            role: TeacherAssignmentRole.SUBJECT_TEACHER,
            startDate: year.startDate,
            isActive: true,
            weeklyPeriods: 4,
          }),
        );

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
          if (classBusy.has(classKey) || teacherBusy.has(teacherKey)) continue;
          classBusy.add(classKey);
          teacherBusy.add(teacherKey);
          const [startTime, endTime] = PERIOD_TIMES[periodIdx];
          await timetableSlotRepo.save(
            timetableSlotRepo.create({
              teacherAssignmentId: assignment.id,
              dayOfWeek: day,
              periodNumber: periodIdx + 1,
              startTime,
              endTime,
            }),
          );
          placed++;
        }
      }
    }
  }

  // --- Exam types -----------------------------------------------------------
  const examTypeRepo = DemoDataSource.getRepository(ExamType);
  const examTypes = await examTypeRepo.save([
    examTypeRepo.create({ name: 'Continuous Assessment', code: ExamTypeName.CONTINUOUS, weight: 30 }),
    examTypeRepo.create({ name: 'Mid Term Exam', code: ExamTypeName.MID_TERM, weight: 30 }),
    examTypeRepo.create({ name: 'End of Term Exam', code: ExamTypeName.END_OF_TERM, weight: 40 }),
  ]);

  // --- Students, guardians, attendance, grades, billing ----------------
  const studentRepo = DemoDataSource.getRepository(Student);
  const parentRepo = DemoDataSource.getRepository(Parent);
  const guardianRepo = DemoDataSource.getRepository(Guardian);
  const attendanceRepo = DemoDataSource.getRepository(StudentAttendance);
  const examMarkRepo = DemoDataSource.getRepository(ExamMark);
  const invoiceRepo = DemoDataSource.getRepository(Invoice);
  const paymentRepo = DemoDataSource.getRepository(Payment);

  // Admin + accountant users double up as the "recorded by" identity on demo payments.
  const adminAcc = DEMO_ACCOUNTS.find((a) => a.role === UserRole.ADMIN)!;
  const adminUser = await userRepo.save(
    userRepo.create({
      email: adminAcc.email,
      username: adminAcc.username,
      passwordHash: demoHashes.get(UserRole.ADMIN)!,
      firstName: adminAcc.firstName,
      lastName: adminAcc.lastName,
      role: UserRole.ADMIN,
      phone: faker.phone.number({ style: 'international' }),
    }),
  );
  const accountantAcc = DEMO_ACCOUNTS.find((a) => a.role === UserRole.ACCOUNTANT)!;
  await userRepo.save(
    userRepo.create({
      email: accountantAcc.email,
      username: accountantAcc.username,
      passwordHash: demoHashes.get(UserRole.ACCOUNTANT)!,
      firstName: accountantAcc.firstName,
      lastName: accountantAcc.lastName,
      role: UserRole.ACCOUNTANT,
      phone: faker.phone.number({ style: 'international' }),
    }),
  );

  const demoParentAcc = DEMO_ACCOUNTS.find((a) => a.role === UserRole.PARENT)!;
  const demoParentUser = await userRepo.save(
    userRepo.create({
      email: demoParentAcc.email,
      username: demoParentAcc.username,
      passwordHash: demoHashes.get(UserRole.PARENT)!,
      firstName: demoParentAcc.firstName,
      lastName: demoParentAcc.lastName,
      role: UserRole.PARENT,
      phone: faker.phone.number({ style: 'international' }),
    }),
  );
  const demoParent = await parentRepo.save(
    parentRepo.create({ userId: demoParentUser.id, address: faker.location.streetAddress(), receivesWhatsApp: true }),
  );

  const demoStudentAcc = DEMO_ACCOUNTS.find((a) => a.role === UserRole.STUDENT)!;
  let admissionSeq = 1;
  let flagshipStudentCreated = false;

  const attendanceBuffer: StudentAttendance[] = [];
  const examMarkBuffer: ExamMark[] = [];

  for (const form of forms) {
    for (const cls of classesByForm.get(form.id)!) {
      const isFlagshipClass = cls.id === demoTeacherClassId;
      for (let i = 0; i < STUDENTS_PER_CLASS; i++) {
        const isFlagship = isFlagshipClass && i === 0 && !flagshipStudentCreated;
        const gender = pick(['Male', 'Female']);
        const firstName = isFlagship ? demoStudentAcc.firstName : faker.person.firstName(gender === 'Male' ? 'male' : 'female');
        const lastName = isFlagship ? demoStudentAcc.lastName : faker.person.lastName();
        const admissionNumber = isFlagship ? 'DEMO0001' : `DEMO${String(++admissionSeq).padStart(4, '0')}`;

        let studentUser: User | undefined;
        if (isFlagship) {
          studentUser = await userRepo.save(
            userRepo.create({
              email: demoStudentAcc.email,
              username: demoStudentAcc.username,
              passwordHash: demoHashes.get(UserRole.STUDENT)!,
              firstName,
              lastName,
              role: UserRole.STUDENT,
              portalPasswordCustomized: true,
            }),
          );
        }

        const student = await studentRepo.save(
          studentRepo.create({
            admissionNumber,
            userId: studentUser?.id,
            firstName,
            lastName,
            dateOfBirth: faker.date.birthdate({ min: 11 + form.level, max: 12 + form.level, mode: 'age' }).toISOString().slice(0, 10),
            gender,
            address: faker.location.streetAddress(),
            classId: cls.id,
            formId: form.id,
            enrollmentDate: year.startDate,
          }),
        );
        flagshipStudentCreated = flagshipStudentCreated || isFlagship;

        // --- Guardian / parent -------------------------------------------
        if (isFlagship) {
          await guardianRepo.save(
            guardianRepo.create({
              studentId: student.id,
              parentId: demoParent.id,
              fullName: `${demoParentAcc.firstName} ${demoParentAcc.lastName}`,
              relationship: 'Mother',
              phone: '+263771000099',
              guardianPhone: '+263771000099',
              email: demoParentAcc.email,
              isPrimary: true,
              isEmergencyContact: true,
            }),
          );
        } else if (Math.random() < 0.85) {
          const pFirst = faker.person.firstName();
          const pLast = lastName;
          const parentUser = await userRepo.save(
            userRepo.create({
              email: `parent${admissionSeq}@schoolpro.demo`,
              username: `parent${admissionSeq}.demo`,
              passwordHash: filler,
              firstName: pFirst,
              lastName: pLast,
              role: UserRole.PARENT,
              phone: faker.phone.number({ style: 'international' }),
            }),
          );
          const parent = await parentRepo.save(
            parentRepo.create({ userId: parentUser.id, address: student.address, receivesWhatsApp: true }),
          );
          await guardianRepo.save(
            guardianRepo.create({
              studentId: student.id,
              parentId: parent.id,
              fullName: `${pFirst} ${pLast}`,
              relationship: pick(['Mother', 'Father', 'Guardian']),
              phone: parentUser.phone,
              guardianPhone: parentUser.phone,
              email: parentUser.email,
              isPrimary: true,
              isEmergencyContact: true,
            }),
          );
        }

        // --- Attendance (both terms) --------------------------------------
        for (const term of terms) {
          const days = schoolDaysBetween(new Date(term.startDate), ATTENDANCE_DAYS_PER_TERM);
          for (const date of days) {
            attendanceBuffer.push(
              attendanceRepo.create({ studentId: student.id, date, status: weightedStatus() }),
            );
          }
        }

        // --- Exam marks (both terms x 3 exam types x class subjects) -------
        const classSubjects = subjects; // every class teaches the same 6 core subjects
        for (const term of terms) {
          for (const examType of examTypes) {
            for (const subject of classSubjects) {
              const base = randomInt(38, 92);
              const marks = Math.min(100, Math.max(0, base + randomInt(-5, 5)));
              examMarkBuffer.push(
                examMarkRepo.create({
                  studentId: student.id,
                  subjectId: subject.id,
                  examTypeId: examType.id,
                  termId: term.id,
                  classId: cls.id,
                  marks,
                  grade: gradeFor(marks),
                }),
              );
            }
          }
        }

        // --- Billing: tuition + transport invoices for the current term ---
        for (const feeCode of ['tuition', 'bus_levy']) {
          const fee = feeByCode.get(feeCode)!;
          const totalAmount = Number(fee.defaultAmount);
          const roll = Math.random();
          // ~30% fully paid, ~40% partially paid, ~30% unpaid — a realistic spread.
          const paidFraction = roll < 0.3 ? 1 : roll < 0.7 ? Math.random() * 0.7 + 0.1 : 0;
          const amountPaid = Math.round(totalAmount * paidFraction * 100) / 100;
          const status =
            amountPaid <= 0
              ? InvoiceStatus.SENT
              : amountPaid >= totalAmount
                ? InvoiceStatus.PAID
                : InvoiceStatus.PARTIAL;

          const invoice = await invoiceRepo.save(
            invoiceRepo.create({
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
            }),
          );

          if (amountPaid > 0) {
            await paymentRepo.save(
              paymentRepo.create({
                paymentReference: refCode('PAY', year.name),
                studentId: student.id,
                invoiceId: invoice.id,
                amount: amountPaid,
                method: pick([PaymentMethod.CASH, PaymentMethod.BANK, PaymentMethod.ECOCASH, PaymentMethod.ONEMONEY]),
                feeType: feeCode,
                label: `${fee.name} payment`,
                recordedById: adminUser.id,
              }),
            );
          }
        }
      }
    }
  }

  await attendanceRepo.save(attendanceBuffer, { chunk: 300 });
  await examMarkRepo.save(examMarkBuffer, { chunk: 300 });

  console.log(
    `[seed:demo] Done — ${allClasses.length} classes, ${teachers.length} teachers, ` +
      `${admissionSeq} students, ${attendanceBuffer.length} attendance rows, ` +
      `${examMarkBuffer.length} exam marks.`,
  );
  console.log('[seed:demo] Fixed demo accounts:');
  for (const acc of DEMO_ACCOUNTS) {
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
