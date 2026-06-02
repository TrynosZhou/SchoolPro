"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTransactionalEmail = sendTransactionalEmail;
const integrations_service_1 = require("./integrations.service");
/** Send transactional email when SMTP is configured; otherwise log to console. */
async function sendTransactionalEmail(params) {
    const config = await (0, integrations_service_1.getIntegrationsConfig)();
    const email = config.email;
    if (!email.enabled || !email.host || !email.user || !email.password) {
        console.log(`[Email] To: ${params.to}\nSubject: ${params.subject}\n\n${params.text}`);
        return { sent: false, mock: true };
    }
    try {
        const nodemailer = await Promise.resolve().then(() => __importStar(require('nodemailer')));
        const transport = nodemailer.createTransport({
            host: email.host,
            port: email.port || 587,
            secure: email.secure,
            auth: {
                user: email.user,
                pass: email.password,
            },
        });
        const from = email.fromEmail
            ? `"${email.fromName || 'School Pro'}" <${email.fromEmail}>`
            : email.user;
        await transport.sendMail({
            from,
            to: params.to,
            subject: params.subject,
            text: params.text,
            html: params.html || params.text.replace(/\n/g, '<br>'),
        });
        return { sent: true, mock: false };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Email send failed';
        console.error('[Email] Send failed:', message);
        console.log(`[Email fallback] To: ${params.to}\nSubject: ${params.subject}\n\n${params.text}`);
        return { sent: false, mock: true, error: message };
    }
}
