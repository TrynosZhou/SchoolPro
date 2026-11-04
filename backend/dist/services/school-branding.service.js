"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSchoolBranding = loadSchoolBranding;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
async function loadSchoolBranding() {
    const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({
        where: { id: 'default' },
    });
    return {
        schoolName: settings?.schoolName,
        tagline: settings?.tagline,
        logoUrl: settings?.logoUrl,
        address: settings?.address,
        phone: settings?.phone,
        email: settings?.email,
        website: settings?.website,
        headmasterName: settings?.headmasterName,
        currency: settings?.currency || 'USD',
        bankAccountName: settings?.bankAccountName,
        bankName: settings?.bankName,
        bankBranch: settings?.bankBranch,
        bankAccountNumber: settings?.bankAccountNumber,
        bankPaymentReferenceNote: settings?.bankPaymentReferenceNote,
    };
}
