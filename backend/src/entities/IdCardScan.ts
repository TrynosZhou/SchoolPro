import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/** One QR scan of a student ID card: arrival or departure. */
@Entity('id_card_scans')
export class IdCardScan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  studentId!: string;

  @Column({ type: 'varchar', length: 16 })
  direction!: string;

  @CreateDateColumn({ type: 'timestamp' })
  scannedAt!: Date;
}
