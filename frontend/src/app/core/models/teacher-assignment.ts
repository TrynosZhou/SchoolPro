export type TeacherAssignmentRole = 'class_teacher' | 'subject_teacher';
export type LessonLength = 'single' | 'double' | 'triple';
export type WorkloadStatus = 'underload' | 'balanced' | 'overload';
export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export interface TeacherAssignment {
  id: string;
  teacherId: string;
  classId: string;
  sectionId?: string | null;
  subjectId?: string | null;
  role: TeacherAssignmentRole;
  startDate: string;
  endDate?: string | null;
  isActive: boolean;
  weeklyPeriods: number;
  lessonLength: LessonLength;
  isSharedSplit: boolean;
  notes?: string | null;
  loadOutOfSync?: boolean;
  teacher?: {
    id: string;
    employeeNumber: string;
    user?: { firstName: string; lastName: string };
  };
  schoolClass?: { id: string; name: string; form?: { name: string } };
  section?: { id: string; name: string } | null;
  subject?: { id: string; name: string; code?: string } | null;
}

export interface WorkloadSummaryRow {
  teacherId: string;
  employeeNumber: string;
  teacherName: string;
  totalPeriods: number;
  minThreshold: number;
  maxThreshold: number | null;
  status: WorkloadStatus;
  assignmentCount: number;
}

export interface TimetableSlot {
  id: string;
  teacherAssignmentId: string;
  dayOfWeek: DayOfWeek;
  periodNumber: number;
  startTime: string;
  endTime: string;
  assignment?: TeacherAssignment;
}

export interface TeacherWeeklySchedule {
  assignments: TeacherAssignment[];
  slots: TimetableSlot[];
  timetableRows: {
    id: string;
    classId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    schoolClass?: { name: string };
    subject?: { name: string };
  }[];
}

export interface ClassRoster {
  class: {
    id: string;
    name: string;
    form?: { name: string };
    classTeacher?: { user?: { firstName: string; lastName: string } };
  } | null;
  assignments: TeacherAssignment[];
}

export interface AssignmentFormRow {
  teacherId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
  role: TeacherAssignmentRole;
  weeklyPeriods: number;
  lessonLength: LessonLength;
  isSharedSplit: boolean;
}

export interface StaffOption {
  id: string;
  employeeNumber: string;
  user: { firstName: string; lastName: string; role: string };
}

export interface ClassOption {
  id: string;
  name: string;
  form?: { name: string };
  sectionId?: string | null;
}

export interface SubjectOption {
  id: string;
  name: string;
  code?: string;
}

export interface SectionOption {
  id: string;
  name: string;
  formId: string;
}
