import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { FK_CASCADE } from './constraints';
import { ApplicationDocumentType } from './enums';
import { Application } from './Application';

/** A supporting document (birth certificate, report card, photo, ID) uploaded with an application. */
@Entity('application_documents')
export class ApplicationDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  applicationId!: string;

  @ManyToOne(() => Application, (application) => application.documents, { ...FK_CASCADE })
  @JoinColumn({ name: 'applicationId' })
  application!: Application;

  @Column({ type: 'varchar', length: 32, default: ApplicationDocumentType.OTHER })
  docType!: string;

  @Column()
  originalName!: string;

  @Column()
  storedName!: string;

  @Column()
  mimeType!: string;

  @Column({ type: 'int' })
  sizeBytes!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
