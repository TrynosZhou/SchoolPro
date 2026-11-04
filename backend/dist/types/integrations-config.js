"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEBHOOK_EVENT_OPTIONS = exports.DEFAULT_INTEGRATIONS = exports.SECRET_MASK = void 0;
exports.normalizeIntegrations = normalizeIntegrations;
exports.mergeIntegrations = mergeIntegrations;
exports.maskIntegrations = maskIntegrations;
exports.integrationStatus = integrationStatus;
exports.SECRET_MASK = '********';
exports.DEFAULT_INTEGRATIONS = {
    whatsapp: { enabled: false, accountSid: '', authToken: '', from: '' },
    email: {
        enabled: false,
        host: '',
        port: 587,
        secure: false,
        user: '',
        password: '',
        fromEmail: '',
        fromName: 'School Pro',
    },
    webhook: {
        enabled: false,
        url: '',
        secret: '',
        events: ['student.enrolled', 'payment.received', 'invoice.created'],
    },
    payment: {
        enabled: false,
        provider: 'paynow',
        merchantId: '',
        apiKey: '',
        webhookUrl: '',
    },
    customApi: {
        enabled: false,
        name: '',
        baseUrl: '',
        authType: 'bearer',
        apiKeyHeader: 'X-API-Key',
        apiKey: '',
        username: '',
        password: '',
        timeoutMs: 15000,
    },
};
exports.WEBHOOK_EVENT_OPTIONS = [
    { id: 'student.enrolled', label: 'Student enrolled' },
    { id: 'payment.received', label: 'Payment received' },
    { id: 'invoice.created', label: 'Invoice created' },
    { id: 'attendance.marked', label: 'Attendance marked' },
    { id: 'report_card.published', label: 'Report card published' },
];
function mergeSecret(incoming, existing) {
    if (!incoming || incoming === exports.SECRET_MASK)
        return existing;
    return String(incoming);
}
function normalizeIntegrations(raw) {
    const d = exports.DEFAULT_INTEGRATIONS;
    const w = raw.whatsapp ?? d.whatsapp;
    const e = raw.email ?? d.email;
    const wh = raw.webhook ?? d.webhook;
    const p = raw.payment ?? d.payment;
    const c = raw.customApi ?? d.customApi;
    return {
        whatsapp: {
            enabled: Boolean(w.enabled),
            accountSid: String(w.accountSid || '').trim(),
            authToken: String(w.authToken || ''),
            from: String(w.from || '').trim(),
        },
        email: {
            enabled: Boolean(e.enabled),
            host: String(e.host || '').trim(),
            port: Math.min(65535, Math.max(1, Number(e.port) || 587)),
            secure: Boolean(e.secure),
            user: String(e.user || '').trim(),
            password: String(e.password || ''),
            fromEmail: String(e.fromEmail || '').trim(),
            fromName: String(e.fromName || d.email.fromName).trim(),
        },
        webhook: {
            enabled: Boolean(wh.enabled),
            url: String(wh.url || '').trim(),
            secret: String(wh.secret || ''),
            events: Array.isArray(wh.events) && wh.events.length
                ? wh.events.map((ev) => String(ev))
                : [...d.webhook.events],
        },
        payment: {
            enabled: Boolean(p.enabled),
            provider: ['paynow', 'stripe', 'paypal', 'custom'].includes(String(p.provider))
                ? p.provider
                : 'paynow',
            merchantId: String(p.merchantId || '').trim(),
            apiKey: String(p.apiKey || ''),
            webhookUrl: String(p.webhookUrl || '').trim(),
        },
        customApi: {
            enabled: Boolean(c.enabled),
            name: String(c.name || '').trim(),
            baseUrl: String(c.baseUrl || '').trim().replace(/\/+$/, ''),
            authType: ['none', 'bearer', 'api-key', 'basic'].includes(String(c.authType))
                ? c.authType
                : 'bearer',
            apiKeyHeader: String(c.apiKeyHeader || 'X-API-Key').trim(),
            apiKey: String(c.apiKey || ''),
            username: String(c.username || '').trim(),
            password: String(c.password || ''),
            timeoutMs: Math.min(120000, Math.max(3000, Number(c.timeoutMs) || 15000)),
        },
    };
}
function mergeIntegrations(existing, patch) {
    const next = normalizeIntegrations({ ...existing, ...patch });
    if (patch.whatsapp) {
        next.whatsapp.authToken = mergeSecret(patch.whatsapp.authToken, existing.whatsapp.authToken);
    }
    if (patch.email) {
        next.email.password = mergeSecret(patch.email.password, existing.email.password);
    }
    if (patch.webhook) {
        next.webhook.secret = mergeSecret(patch.webhook.secret, existing.webhook.secret);
    }
    if (patch.payment) {
        next.payment.apiKey = mergeSecret(patch.payment.apiKey, existing.payment.apiKey);
    }
    if (patch.customApi) {
        next.customApi.apiKey = mergeSecret(patch.customApi.apiKey, existing.customApi.apiKey);
        next.customApi.password = mergeSecret(patch.customApi.password, existing.customApi.password);
    }
    return next;
}
function maskIntegrations(config) {
    const mask = (val) => (val ? exports.SECRET_MASK : '');
    return {
        ...config,
        whatsapp: {
            ...config.whatsapp,
            authToken: mask(config.whatsapp.authToken),
            hasAuthToken: !!config.whatsapp.authToken,
        },
        email: {
            ...config.email,
            password: mask(config.email.password),
            hasPassword: !!config.email.password,
        },
        webhook: {
            ...config.webhook,
            secret: mask(config.webhook.secret),
            hasSecret: !!config.webhook.secret,
        },
        payment: {
            ...config.payment,
            apiKey: mask(config.payment.apiKey),
            hasApiKey: !!config.payment.apiKey,
        },
        customApi: {
            ...config.customApi,
            apiKey: mask(config.customApi.apiKey),
            password: mask(config.customApi.password),
            hasApiKey: !!config.customApi.apiKey,
            hasPassword: !!config.customApi.password,
        },
    };
}
function integrationStatus(config) {
    const whatsappOk = config.whatsapp.enabled && config.whatsapp.accountSid && config.whatsapp.authToken && config.whatsapp.from;
    const emailOk = config.email.enabled && config.email.host && config.email.user && config.email.password;
    const webhookOk = config.webhook.enabled && config.webhook.url;
    const paymentOk = config.payment.enabled && config.payment.merchantId && config.payment.apiKey;
    const customOk = config.customApi.enabled && config.customApi.baseUrl;
    return {
        whatsapp: !config.whatsapp.enabled ? 'disabled' : whatsappOk ? 'active' : 'configured',
        email: !config.email.enabled ? 'disabled' : emailOk ? 'active' : 'configured',
        webhook: !config.webhook.enabled ? 'disabled' : webhookOk ? 'active' : 'configured',
        payment: !config.payment.enabled ? 'disabled' : paymentOk ? 'active' : 'configured',
        customApi: !config.customApi.enabled ? 'disabled' : customOk ? 'active' : 'configured',
    };
}
