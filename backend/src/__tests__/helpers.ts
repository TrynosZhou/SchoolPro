/** Tiny in-memory stand-in for a TypeORM repository, enough for service-level tests. */
export function makeRepo<T extends Record<string, any>>(seed: T[] = []) {
  const rows: T[] = [...seed];
  let seq = rows.length;
  const matches = (row: any, where: any) =>
    !where || Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && '_type' in (v as any) ? true : row[k] === v));
  return {
    rows,
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (data: any) => {
      const list = Array.isArray(data) ? data : [data];
      for (const item of list) {
        if (!item.id) item.id = `id-${++seq}`;
        if (!rows.includes(item)) rows.push(item);
      }
      return data;
    }),
    findOne: jest.fn(async (opts: any = {}) => rows.find((r) => matches(r, opts.where)) ?? null),
    find: jest.fn(async (opts: any = {}) => {
      let out = rows.filter((r) => matches(r, opts.where));
      if (opts.take) out = out.slice(0, opts.take);
      return out;
    }),
    update: jest.fn(async (where: any, patch: any) => {
      rows.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, patch));
    }),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        select: () => qb,
        addSelect: () => qb,
        leftJoin: () => qb,
        leftJoinAndSelect: () => qb,
        innerJoin: () => qb,
        innerJoinAndSelect: () => qb,
        where: () => qb,
        andWhere: () => qb,
        orWhere: () => qb,
        orderBy: () => qb,
        addOrderBy: () => qb,
        groupBy: () => qb,
        having: () => qb,
        take: () => qb,
        skip: () => qb,
        limit: () => qb,
        offset: () => qb,
        setParameter: () => qb,
        setParameters: () => qb,
        getOne: jest.fn(async () => null),
        getMany: jest.fn(async () => [...rows]),
        getRawOne: jest.fn(async () => null),
        getRawMany: jest.fn(async () => []),
        getCount: jest.fn(async () => rows.length),
      };
      return qb;
    }),
  };
}
