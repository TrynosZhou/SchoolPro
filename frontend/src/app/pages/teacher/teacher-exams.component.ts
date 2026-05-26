import { Component } from '@angular/core';
import { ExamMarksEntryComponent } from '../exams/exam-marks-entry.component';

/** Teacher route wrapper — shared marks entry UI. */
@Component({
  selector: 'app-teacher-exams',
  standalone: true,
  imports: [ExamMarksEntryComponent],
  template: `<app-exam-marks-entry />`,
})
export class TeacherExamsComponent {}
