"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendHeadmasterToPrincipalRemarks = appendHeadmasterToPrincipalRemarks;
/** Append the configured headmaster name as a signature on principal remarks. */
function appendHeadmasterToPrincipalRemarks(remarks, headmasterName) {
    const body = (remarks || '').trim();
    const head = (headmasterName || '').trim();
    if (!head)
        return body;
    const signature = `\n\n${head}\nHeadmaster`;
    return body ? `${body}${signature}` : head;
}
