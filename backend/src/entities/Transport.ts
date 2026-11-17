import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('transport_routes')
export class TransportRoute {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  code!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('transport_stops')
@Index(['routeId', 'sequence'])
export class TransportStop {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  routeId!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ type: 'time', nullable: true })
  pickupTime?: string;

  @Column({ type: 'int', default: 0 })
  sequence!: number;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('transport_drivers')
export class TransportDriver {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  licenseNumber?: string;

  @Column({ type: 'date', nullable: true })
  licenseExpiry?: string;

  @Column({ nullable: true })
  userId?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('transport_vehicles')
export class TransportVehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  registration!: string;

  @Column()
  make!: string;

  @Column({ type: 'int', nullable: true })
  capacity?: number;

  @Column({ nullable: true })
  routeId?: string;

  @Column({ nullable: true })
  driverId?: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: string; // active | maintenance | retired

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

/** Student assigned to a route + pickup stop for a term/year. */
@Entity('transport_assignments')
@Index(['studentId'])
export class TransportAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  studentId!: string;

  @Column()
  routeId!: string;

  @Column({ nullable: true })
  stopId?: string;

  @Column({ nullable: true })
  termId?: string;

  @Column({ type: 'date', nullable: true })
  startDate?: string;

  @Column({ type: 'date', nullable: true })
  endDate?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

/** Delay / incident notification on a route. */
@Entity('transport_delays')
@Index(['routeId', 'date'])
export class TransportDelay {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  routeId!: string;

  @Column({ nullable: true })
  vehicleId?: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'time', nullable: true })
  scheduledTime?: string;

  @Column({ type: 'time', nullable: true })
  actualTime?: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ default: false })
  parentsNotified!: boolean;

  @Column({ nullable: true })
  reportedById?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
