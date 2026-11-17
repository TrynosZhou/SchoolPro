import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  contactPerson?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('inventory_items')
@Index(['category'])
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  /** textbook | stationery | equipment | uniform | other */
  @Column({ type: 'varchar', length: 32, default: 'other' })
  category!: string;

  @Column({ nullable: true })
  unit?: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  unitCost!: number;

  @Column({ type: 'int', default: 0 })
  quantity!: number;

  @Column({ type: 'int', default: 0 })
  reorderLevel!: number;

  @Column({ nullable: true })
  location?: string;

  @Column({ nullable: true })
  supplierId?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('stock_movements')
@Index(['itemId', 'date'])
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  itemId!: string;

  /** in | out | adjust */
  @Column({ type: 'varchar', length: 16 })
  type!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  unitCost?: number;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ nullable: true })
  referenceType?: string; // purchase_order | sale | manual

  @Column({ nullable: true })
  referenceId?: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ nullable: true })
  createdById?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('purchase_orders')
@Index(['status'])
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  poNumber!: string;

  @Column()
  supplierId!: string;

  /** draft | ordered | received | cancelled */
  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: string;

  @Column({ type: 'date', nullable: true })
  orderDate?: string;

  @Column({ type: 'date', nullable: true })
  expectedDate?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ nullable: true })
  createdById?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('purchase_order_lines')
export class PurchaseOrderLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  purchaseOrderId!: string;

  @Column()
  itemId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  unitCost!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  lineTotal!: number;
}

@Entity('fixed_assets')
export class FixedAsset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ type: 'date', nullable: true })
  purchaseDate?: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  purchaseCost!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  salvageValue!: number;

  /** Useful life in years. */
  @Column({ type: 'int', default: 5 })
  usefulLifeYears!: number;

  @Column({ nullable: true })
  location?: string;

  @Column({ nullable: true })
  notes?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
