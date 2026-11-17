import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/** Master list of rooms. Timetable lessons refer to a room by its name. */
@Entity('rooms')
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  name!: string;

  /** Optional short code shown in tight grids (e.g. "LAB1"). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  code?: string | null;

  @Column({ type: 'int', nullable: true })
  capacity?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
