"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const dotenv_1 = __importDefault(require("dotenv"));
const data_source_1 = require("../config/data-source");
const invoice_lookup_service_1 = require("../services/invoice-lookup.service");
dotenv_1.default.config();
async function main() {
    await data_source_1.AppDataSource.initialize();
    const studentId = '5a389523-5828-40b9-adea-4914baa0d329';
    const invoice = await (0, invoice_lookup_service_1.resolveStudentInvoiceForLookup)(studentId);
    console.log(invoice
        ? {
            invoiceNumber: invoice.invoiceNumber,
            description: invoice.description,
            termName: invoice.term?.name,
            status: invoice.status,
        }
        : null);
    await data_source_1.AppDataSource.destroy();
}
main().catch(async (e) => {
    console.error(e);
    try {
        await data_source_1.AppDataSource.destroy();
    }
    catch {
        // ignore
    }
    process.exit(1);
});
