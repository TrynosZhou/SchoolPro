import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/** A certificate or letter issued to a student (transfer, bonafide, testimonial, …). */
@Entity('issued_documents')
export class IssuedDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  referenceCode!: string;

  @Column({ type: 'uuid', nullable: true })
  studentId?: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  recipientName?: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  issuedByName?: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  issuedAt!: Date;
}
