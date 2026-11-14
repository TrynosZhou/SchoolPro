import { validate, ValidationError } from 'class-validator';
import { plainToInstance, ClassConstructor } from 'class-transformer';

export class DtoValidationError extends Error {
  statusCode = 400;
  details: string[];

  constructor(details: string[]) {
    super(details.join('; '));
    this.name = 'DtoValidationError';
    this.details = details;
  }
}

function flattenErrors(errors: ValidationError[]): string[] {
  const out: string[] = [];
  for (const err of errors) {
    if (err.constraints) {
      out.push(...Object.values(err.constraints));
    }
    if (err.children?.length) {
      out.push(...flattenErrors(err.children));
    }
  }
  return out;
}

export async function validateDto<T extends object>(
  cls: ClassConstructor<T>,
  body: unknown,
): Promise<T> {
  const dto = plainToInstance(cls, body);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  if (errors.length) {
    throw new DtoValidationError(flattenErrors(errors));
  }
  return dto;
}
