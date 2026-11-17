import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Room, Timetable } from '../entities';

export interface RoomInput {
  name?: unknown;
  code?: unknown;
  capacity?: unknown;
}

const MAX_NAME = 64;
const MAX_CODE = 16;

function cleanName(value: unknown): string {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Room name is required.');
  if (name.length > MAX_NAME) throw new Error(`Room name must be ${MAX_NAME} characters or fewer.`);
  return name;
}

function cleanCode(value: unknown): string | null {
  const code = String(value ?? '').trim();
  if (!code) return null;
  if (code.length > MAX_CODE) throw new Error(`Room code must be ${MAX_CODE} characters or fewer.`);
  return code;
}

function cleanCapacity(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1000) {
    throw new Error('Capacity must be a whole number between 1 and 1000.');
  }
  return n;
}

export async function listRooms(): Promise<Room[]> {
  return AppDataSource.getRepository(Room).find({ order: { name: 'ASC' } });
}

export async function createRoom(input: RoomInput): Promise<Room> {
  const repo = AppDataSource.getRepository(Room);
  const name = cleanName(input?.name);
  if (await repo.exists({ where: { name } })) {
    throw new Error(`A room called "${name}" already exists.`);
  }
  return repo.save(
    repo.create({
      name,
      code: cleanCode(input?.code),
      capacity: cleanCapacity(input?.capacity),
    }),
  );
}

/**
 * Updates a room. Renaming also renames the room on every lesson that uses it,
 * so the timetable stays linked to the master list.
 */
export async function updateRoom(id: string, input: RoomInput): Promise<Room> {
  const repo = AppDataSource.getRepository(Room);
  const room = await repo.findOne({ where: { id } });
  if (!room) throw new Error('Room not found.');

  const oldName = room.name;
  const newName = input?.name !== undefined ? cleanName(input.name) : oldName;
  if (newName !== oldName && (await repo.exists({ where: { name: newName } }))) {
    throw new Error(`A room called "${newName}" already exists.`);
  }
  if (input?.code !== undefined) room.code = cleanCode(input.code);
  if (input?.capacity !== undefined) room.capacity = cleanCapacity(input.capacity);
  room.name = newName;

  await AppDataSource.transaction(async (manager) => {
    await manager.save(Room, room);
    if (newName !== oldName) {
      await manager.update(Timetable, { room: oldName }, { room: newName });
    }
  });
  return room;
}

export async function deleteRoom(id: string): Promise<void> {
  const repo = AppDataSource.getRepository(Room);
  const room = await repo.findOne({ where: { id } });
  if (!room) throw new Error('Room not found.');

  const used = await AppDataSource.getRepository(Timetable).count({ where: { room: room.name } });
  if (used > 0) {
    throw new Error(
      `"${room.name}" is used by ${used} lesson${used === 1 ? '' : 's'}. Move those lessons to another room first.`,
    );
  }
  await repo.remove(room);
}

/** Throws unless every name is on the master list. Used when a lesson is given a room. */
export async function assertRoomsExist(names: string[]): Promise<void> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (!unique.length) return;
  const found = await AppDataSource.getRepository(Room).find({ where: { name: In(unique) } });
  const known = new Set(found.map((r) => r.name));
  const missing = unique.filter((n) => !known.has(n));
  if (missing.length) {
    throw new Error(
      `Room not on the master list: ${missing.join(', ')}. Add it under Timetable → Rooms first.`,
    );
  }
}
