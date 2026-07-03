"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DtoValidationError = void 0;
exports.validateDto = validateDto;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class DtoValidationError extends Error {
    constructor(details) {
        super(details.join('; '));
        this.statusCode = 400;
        this.name = 'DtoValidationError';
        this.details = details;
    }
}
exports.DtoValidationError = DtoValidationError;
function flattenErrors(errors) {
    const out = [];
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
async function validateDto(cls, body) {
    const dto = (0, class_transformer_1.plainToInstance)(cls, body);
    const errors = await (0, class_validator_1.validate)(dto, { whitelist: true, forbidNonWhitelisted: false });
    if (errors.length) {
        throw new DtoValidationError(flattenErrors(errors));
    }
    return dto;
}
