export enum UserRole {
  DIRECTOR = 'director',
  PRINCIPAL = 'principal',
  ADMIN = 'admin',
  TEACHER = 'teacher',
  PARENT = 'parent',
  STUDENT = 'student',
}

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
  EXCUSED = 'excused',
}

export enum PaymentMethod {
  CASH = 'cash',
  BANK = 'bank',
  ECOCASH = 'ecocash',
  ONEMONEY = 'onemoney',
  INNBUCKS = 'innbucks',
  OTHER = 'other',
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PARTIAL = 'partial',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}

export enum StudentType {
  DAY_SCHOLAR = 'day_scholar',
  BOARDER = 'boarder',
}

export enum FeeType {
  TUITION = 'tuition',
  BUS_LEVY = 'bus_levy',
  UNIFORM = 'uniform',
  TUCKSHOP = 'tuckshop',
  EXAM = 'exam',
  SPORTS = 'sports',
  OTHER = 'other',
}

export enum ExamTypeName {
  CONTINUOUS = 'continuous',
  MID_TERM = 'mid_term',
  END_OF_TERM = 'end_of_term',
  FINAL = 'final',
}

export enum CashbookEntryType {
  RECEIPT = 'receipt',
  PAYMENT = 'payment',
  TRANSFER = 'transfer',
}

export enum PayFrequency {
  MONTHLY = 'monthly',
  BIWEEKLY = 'biweekly',
}

export enum PayrollPaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  CASH = 'cash',
  ECOCASH = 'ecocash',
}

export enum PayrollRunStatus {
  DRAFT = 'draft',
  PROCESSED = 'processed',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

export enum PayslipStatus {
  PENDING = 'pending',
  PAID = 'paid',
  EXCLUDED = 'excluded',
}

