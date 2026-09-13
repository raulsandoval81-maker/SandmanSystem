"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanReviewString = cleanReviewString;
exports.createProposalReviewToken = createProposalReviewToken;
exports.hashProposalReviewToken = hashProposalReviewToken;
exports.buildClientProposalSnapshot = buildClientProposalSnapshot;
const node_crypto_1 = require("node:crypto");
function cleanReviewString(value) {
    return String(value ?? "").trim();
}
function createProposalReviewToken() {
    return (0, node_crypto_1.randomBytes)(32).toString("base64url");
}
function hashProposalReviewToken(token) {
    return (0, node_crypto_1.createHash)("sha256")
        .update(token)
        .digest("hex");
}
function buildClientProposalSnapshot(proposalId, proposal) {
    const prospect = proposal.prospect || {};
    const coach = proposal.coach || {};
    return {
        version: 1,
        proposalId,
        prospect: {
            familyName: prospect.familyName || null,
            primaryContactName: prospect.primaryContactName || null,
        },
        preparedBy: {
            name: coach.name || null,
        },
        athletes: Array.isArray(proposal.athletes)
            ? proposal.athletes
            : [],
        pricing: proposal.pricing || {},
        agreement: proposal.agreement || {},
    };
}
