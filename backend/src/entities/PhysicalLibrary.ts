import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('library_books')
export class LibraryBook {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, nullable: true })
  isbn?: string;

  /** Scannable code printed on the catalogue label. */
  @Column({ unique: true })
  barcode!: string;

  @Column()
  title!: string;

  @Column({ nullable: true })
  author?: string;

  @Column({ nullable: true })
  publisher?: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ type: 'int', default: 1 })
  totalCopies!: number;

  @Column({ type: 'int', default: 0 })
  availableCopies!: number;

  @Column({ nullable: true })
  shelfLocation?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('library_loans')
@Index(['bookId', 'status'])
@Index(['borrowerStudentId'])
@Index(['borrowerStaffId'])
export class LibraryLoan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  bookId!: string;

  /** Copy number within the title (1..totalCopies). */
  @Column({ type: 'int', default: 1 })
  copyNumber!: number;

  /** student | staff */
  @Column({ type: 'varchar', length: 16 })
  borrowerType!: string;

  @Column({ nullable: true })
  borrowerStudentId?: string;

  @Column({ nullable: true })
  borrowerStaffId?: string;

  @Column({ nullable: true })
  borrowerName?: string;

  @Column({ type: 'date' })
  issueDate!: string;

  @Column({ type: 'date' })
  dueDate!: string;

  @Column({ type: 'date', nullable: true })
  returnDate?: string;

  /** Calculated on return when late; configurable per book/level later. */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  fineAmount!: number;

  /** issued | returned | lost */
  @Column({ type: 'varchar', length: 16, default: 'issued' })
  status!: string;

  @Column({ nullable: true })
  issuedById?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
