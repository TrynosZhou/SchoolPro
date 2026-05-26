"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FK_SET_NULL = exports.FK_RESTRICT = exports.FK_CASCADE = void 0;
/** Standard referential integrity options for all foreign keys */
exports.FK_CASCADE = { onDelete: 'CASCADE', onUpdate: 'CASCADE' };
exports.FK_RESTRICT = { onDelete: 'RESTRICT', onUpdate: 'CASCADE' };
exports.FK_SET_NULL = { onDelete: 'SET NULL', onUpdate: 'CASCADE' };
