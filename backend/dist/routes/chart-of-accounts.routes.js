"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const portal_roles_1 = require("../config/portal-roles");
const auth_1 = require("../middleware/auth");
const ledger_service_1 = require("../services/ledger.service");
const general_ledger_report_service_1 = require("../services/general-ledger-report.service");
const router = (0, express_1.Router)();
const GL_ROLES = portal_roles_1.FINANCE_ROLES;
router.use(auth_1.authenticate);
router.use((0, auth_1.authorize)(...GL_ROLES));
router.get('/', async (_req, res) => {
    await (0, ledger_service_1.ensureChartOfAccountsSeeded)();
    const accounts = await (0, general_ledger_report_service_1.listChartOfAccounts)();
    res.json(accounts);
});
exports.default = router;
