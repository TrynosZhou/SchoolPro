import { Pipe, PipeTransform } from '@angular/core';
import { formatGenderLabel, formatStudentClassLabel } from '../utils/class-display';

@Pipe({ name: 'studentClass', standalone: true })
export class StudentClassPipe implements PipeTransform {
  transform(className?: string | null): string {
    return formatStudentClassLabel(className);
  }
}

@Pipe({ name: 'studentGender', standalone: true })
export class StudentGenderPipe implements PipeTransform {
  transform(gender?: string | null): string {
    return formatGenderLabel(gender);
  }
}
