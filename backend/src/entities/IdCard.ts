import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/** One student ID card per student. `code` is printed on the card and encoded in its QR code. */
@Entity('student_id_cards')
export class IdCard {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  studentId!: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  code!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
