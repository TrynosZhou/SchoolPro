"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatStudentClassLabel = formatStudentClassLabel;
exports.reportCardClassValue = reportCardClassValue;
exports.isALevelForm = isALevelForm;
exports.isALevelClassOption = isALevelClassOption;
exports.formatGenderLabel = formatGenderLabel;
/** Display enrolled class as "Class 1A" (never "Form 2 2B"). */
function formatStudentClassLabel(className) {
    const name = String(className || '').trim();
    if (!name)
        return '—';
    if (/^class\s+/i.test(name))
        return name;
    return `Class ${name}`;
}
/** Report card value beside a "Class:" label — e.g. L6 Sci (no duplicate "Class"). */
function reportCardClassValue(className) {
    const name = String(className || '').trim();
    if (!name)
        return '—';
    return name.replace(/^class\s+/i, '');
}
/** True for A-level forms (Form 5 and Form 6). */
function isALevelForm(form) {
    if (!form)
        return false;
    const level = Number(form.level);
    if (level === 5 || level === 6)
        return true;
    const name = String(form.name || '').trim().toLowerCase();
    if (/^form\s*[56]\b/.test(name))
        return true;
    if (/\b(lower|upper)\s*(six|6)\b/.test(name))
        return true;
    if (/\b(l6|u6)\b/.test(name))
        return true;
    return false;
}
/** True when a class belongs to Form 5 / Form 6 (A-level). */
function isALevelClassOption(cls) {
    if (!cls)
        return false;
    if (isALevelForm(cls.form))
        return true;
    const name = String(cls.name || '').trim().toLowerCase();
    if (/^(l6|u6|l\s*6|u\s*6)\b/.test(name))
        return true;
    if (/^5[a-z0-9]/i.test(name))
        return true;
    return false;
}
function formatGenderLabel(gender) {
    const raw = String(gender || '').trim();
    if (!raw)
        return '—';
    const v = raw.toLowerCase();
    if (v === 'm' || v === 'male')
        return 'Male';
    if (v === 'f' || v === 'female')
        return 'Female';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}
