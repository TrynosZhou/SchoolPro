/** Standard referential integrity options for all foreign keys */
export const FK_CASCADE = { onDelete: 'CASCADE' as const, onUpdate: 'CASCADE' as const };
export const FK_RESTRICT = { onDelete: 'RESTRICT' as const, onUpdate: 'CASCADE' as const };
export const FK_SET_NULL = { onDelete: 'SET NULL' as const, onUpdate: 'CASCADE' as const };
