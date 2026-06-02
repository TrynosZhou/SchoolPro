"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDatabase = seedDatabase;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const data_source_1 = require("./config/data-source");
const entities_1 = require("./entities");
const enums_1 = require("./entities/enums");
const role_permissions_service_1 = require("./services/role-permissions.service");
async function seedDatabase() {
    await (0, role_permissions_service_1.ensureDefaultRoles)();
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const existing = await userRepo.count();
    if (existing > 0)
        return;
    console.log('Seeding database...');
    const defaultHash = await bcryptjs_1.default.hash('Password123!', 10);
    const adminHash = await bcryptjs_1.default.hash('admin123', 10);
    const director = await userRepo.save(userRepo.create({
        email: 'director@schoolpro.ac.zw',
        username: 'director',
        passwordHash: defaultHash,
        firstName: 'John',
        lastName: 'Director',
        role: enums_1.UserRole.DIRECTOR,
        phone: '+263771000001',
    }));
    await userRepo.save([
        userRepo.create({ email: 'principal@schoolpro.ac.zw', username: 'principal', passwordHash: defaultHash, firstName: 'Mary', lastName: 'Principal', role: enums_1.UserRole.PRINCIPAL, phone: '+263771000002' }),
        userRepo.create({ email: 'admin@schoolpro.ac.zw', username: 'admin', passwordHash: adminHash, firstName: 'Peter', lastName: 'Admin', role: enums_1.UserRole.ADMIN, phone: '+263771000003' }),
    ]);
    const teacherUser = await userRepo.save(userRepo.create({
        email: 'teacher@schoolpro.ac.zw',
        username: 'teacher',
        passwordHash: defaultHash,
        firstName: 'Sarah',
        lastName: 'Moyo',
        role: enums_1.UserRole.TEACHER,
        phone: '+263771000004',
    }));
    const parentUser = await userRepo.save(userRepo.create({
        email: 'parent@schoolpro.ac.zw',
        username: 'parent',
        passwordHash: defaultHash,
        firstName: 'Tendai',
        lastName: 'Chikwanha',
        role: enums_1.UserRole.PARENT,
        phone: '+263771000005',
    }));
    const staffRepo = data_source_1.AppDataSource.getRepository(entities_1.Staff);
    const teacher = await staffRepo.save(staffRepo.create({
        userId: teacherUser.id,
        employeeNumber: 'EMP000001',
        department: 'Sciences',
        qualification: 'B.Ed Science',
    }));
    const parentRepo = data_source_1.AppDataSource.getRepository(entities_1.Parent);
    const parent = await parentRepo.save(parentRepo.create({
        userId: parentUser.id,
        address: '123 Samora Machel Ave, Harare',
        receivesWhatsApp: true,
    }));
    const yearRepo = data_source_1.AppDataSource.getRepository(entities_1.SchoolYear);
    const year = await yearRepo.save(yearRepo.create({
        name: '2026',
        startDate: '2026-01-13',
        endDate: '2026-12-04',
        isCurrent: true,
    }));
    const termRepo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    const term = await termRepo.save(termRepo.create({
        name: 'Term 1',
        termNumber: 1,
        startDate: '2026-01-13',
        endDate: '2026-12-04',
        isCurrent: true,
        schoolYearId: year.id,
    }));
    const formRepo = data_source_1.AppDataSource.getRepository(entities_1.Form);
    const form4 = await formRepo.save(formRepo.create({ name: 'Form 4', level: 4 }));
    const form3 = await formRepo.save(formRepo.create({ name: 'Form 3', level: 3 }));
    const classRepo = data_source_1.AppDataSource.getRepository(entities_1.SchoolClass);
    const class4A = await classRepo.save(classRepo.create({
        name: '4A', formId: form4.id, classTeacherId: teacher.id, capacity: 40,
    }));
    await classRepo.save(classRepo.create({ name: '3B', formId: form3.id, capacity: 35 }));
    const subjectRepo = data_source_1.AppDataSource.getRepository(entities_1.Subject);
    const maths = await subjectRepo.save(subjectRepo.create({ code: 'MATH', name: 'Mathematics' }));
    const english = await subjectRepo.save(subjectRepo.create({ code: 'ENG', name: 'English' }));
    const science = await subjectRepo.save(subjectRepo.create({ code: 'SCI', name: 'Combined Science' }));
    const csRepo = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
    await csRepo.save([
        csRepo.create({ classId: class4A.id, subjectId: maths.id, teacherId: teacher.id }),
        csRepo.create({ classId: class4A.id, subjectId: english.id, teacherId: teacher.id }),
        csRepo.create({ classId: class4A.id, subjectId: science.id, teacherId: teacher.id }),
    ]);
    const examTypeRepo = data_source_1.AppDataSource.getRepository(entities_1.ExamType);
    await examTypeRepo.save([
        examTypeRepo.create({ name: 'Continuous Assessment', code: enums_1.ExamTypeName.CONTINUOUS, weight: 30 }),
        examTypeRepo.create({ name: 'Mid Term Exam', code: enums_1.ExamTypeName.MID_TERM, weight: 30 }),
        examTypeRepo.create({ name: 'End of Term Exam', code: enums_1.ExamTypeName.END_OF_TERM, weight: 40 }),
    ]);
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const student = await studentRepo.save(studentRepo.create({
        admissionNumber: 'SP000001',
        firstName: 'Kudzai',
        lastName: 'Chikwanha',
        dateOfBirth: '2010-05-15',
        gender: 'Male',
        address: '123 Samora Machel Ave, Harare',
        previousSchool: 'Harare Primary School',
        classId: class4A.id,
        enrollmentDate: '2026-01-13',
    }));
    const guardianRepo = data_source_1.AppDataSource.getRepository(entities_1.Guardian);
    await guardianRepo.save(guardianRepo.create({
        studentId: student.id,
        parentId: parent.id,
        fullName: 'Tendai Chikwanha',
        relationship: 'Father',
        phone: '+263771000005',
        email: 'parent@schoolpro.ac.zw',
        isPrimary: true,
        isEmergencyContact: true,
    }));
    const tuckRepo = data_source_1.AppDataSource.getRepository(entities_1.TuckshopItem);
    await tuckRepo.save([
        tuckRepo.create({ name: 'Crisps', unitPrice: 0.50, stockQuantity: 100, reorderLevel: 20 }),
        tuckRepo.create({ name: 'Juice 500ml', unitPrice: 1.00, stockQuantity: 50, reorderLevel: 10 }),
        tuckRepo.create({ name: 'Bottled Water', unitPrice: 0.75, stockQuantity: 80, reorderLevel: 15 }),
    ]);
    console.log('Seed complete. Demo accounts:');
    console.log('  director@schoolpro.ac.zw');
    console.log('  principal@schoolpro.ac.zw');
    console.log('  admin / admin@schoolpro.ac.zw (password: admin123)');
    console.log('  teacher@schoolpro.ac.zw');
    console.log('  parent@schoolpro.ac.zw');
    console.log('  (others use password: Password123!)');
}
