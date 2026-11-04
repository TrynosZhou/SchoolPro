import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { FK_CASCADE } from './constraints';
import { User } from './User';
import { LibraryResource } from './LibraryResource';

@Entity('library_bookmarks')
@Unique(['userId', 'resourceId'])
export class LibraryBookmark {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, FK_CASCADE)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: string;

  @ManyToOne(() => LibraryResource, (r) => r.bookmarks, FK_CASCADE)
  @JoinColumn({ name: 'resourceId' })
  resource!: LibraryResource;

  @Column()
  resourceId!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
