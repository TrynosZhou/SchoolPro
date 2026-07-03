export type UserRole = 'director' | 'principal' | 'admin' | 'teacher' | 'parent' | 'student';

export interface User {
  id: string;
  email: string;
  username?: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  schoolRoleId?: string | null;
  schoolRoleName?: string | null;
  permissions?: string[];
  staffId?: string;
  parentId?: string;
  studentId?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Student {
  id: string;
  /** Display label: Student ID (stored as admissionNumber) */
  admissionNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  studentType?: 'day_scholar' | 'boarder';
  classId?: string;
  formId?: string;
  enrollmentDate?: string;
  schoolClass?: { name: string; form?: { name: string } };
  form?: { id: string; name: string; level: number };
  guardians?: Guardian[];
  address?: string;
  previousSchool?: string;
}

export interface Guardian {
  id?: string;
  fullName: string;
  relationship: string;
  phone: string;
  email?: string;
  isPrimary?: boolean;
}

export interface DashboardOverview {
  totalStudents: number;
  boarders: number;
  dayScholars: number;
  totalStaff: number;
  attendanceToday: { status: string; count: string }[];
  monthlyCollections: number;
  totalDebtors: number;
  lowStockItems: number;
}
