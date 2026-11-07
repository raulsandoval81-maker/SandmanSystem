#!/usr/bin/env node
// 2C validation-only: assemble a receipt-only Gen2 source candidate.
// Explicitly no deployment, live credentials, IAM operations or email delivery.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const PIN = 'b4b40798b58aac46706dce984427e77d501855e7';
const FN = 'sendProposalPrepaidCashReceipt';
const SOURCES = Object.freeze([
  'src/billing/sendProposalPrepaidCashReceipt.ts',
  'src/modules/email/resend.ts',
  'src/proposals/proposalAccess.ts',
]);
const METADATA = Object.freeze(['package.json','package-lock.json','tsconfig.json']);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function requireGuard(ok, message){if(!ok) throw Error('2C_PACKAGE_BLOCKED: '+message);}
function sourceFile(root, rel){return fs.readFileSync(path.join(root, rel));}
function filesUnder(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder,{withFileTypes:true}).flatMap(e => {
    const p=path.join(folder,e.name);
    return e.isDirectory()?filesUnder(p):e.isFile()?[p]:[];
  });
}
function checkSourcePinned(root) {
  const actual=cp.execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  requireGuard(actual===PIN,'wrong immutable source revision');
  const source=sourceFile(path.join(root,'functions'),SOURCES[0]).toString();
  const emails=sourceFile(path.join(root,'functions'),SOURCES[1]).toString();
  const access=sourceFile(path.join(root,'functions'),SOURCES[2]).toString();
  const entry=sourceFile(path.join(root,'functions'),'src/index.ts').toString();
  requireGuard(entry.includes(FN) && /export const sendProposalPrepaidCashReceipt\s*=\s*onCall/.test(source),'source callable contract');
  requireGuard(source.includes('secrets: [RESEND_API_KEY]') && source.includes('if (!req.auth)') &&
    source.includes('requireProposalStaffAccess') && source.includes('requireProposalLocationAccess'),
    'secret and staff/location checks');
  requireGuard(source.includes('cashPrepayment') && source.includes('stripeCheckoutSessionId') &&
    source.includes('stripeSubscriptionId') && source.includes('SENDING'), 'payment and dedupe gates');
  requireGuard(emails.includes('defineSecret("RESEND_API_KEY")'),'secret metadata contract');
  requireGuard(access.includes('ALLOWED_PROPOSAL_ROLES') && access.includes('status !== "active"'),'staff access contract');
  for (const rel of SOURCES) {
    const data=sourceFile(path.join(root,'functions'),rel).toString();
    const imports=[...data.matchAll(/(?:from\s*|require\s*\()\s*["'](\.[^"']+)["']/g)].map(m=>m[1]);
    const parent=path.posix.dirname(rel);
    for (const spec of imports) {
      const target=path.posix.normalize(path.posix.join(parent,spec));
      requireGuard(SOURCES.includes(target+'.ts') || SOURCES.includes(target+'/index.ts'),
        'new relative dependency requires explicit scope review: '+target);
    }
  }
}
const [mode,root,out] = process.argv.slice(2);
requireGuard(['prepare','verify'].includes(mode) && root && out,'usage: prepare|verify <pinned-app> <candidate-dir>');
const sourceRoot=path.resolve(root), dest=path.resolve(out);
requireGuard(dest!==sourceRoot && !dest.startsWith(sourceRoot+path.sep),'output may not live inside source');
checkSourcePinned(sourceRoot);
const functionRoot=path.join(sourceRoot,'functions');
const INDEX = [
 'import * as admin from "firebase-admin";',
 'if (admin.apps.length === 0) admin.initializeApp();',
 'export { sendProposalPrepaidCashReceipt } from "./billing/sendProposalPrepaidCashReceipt";',
 ''
].join('\n');
function expectedHashMap() {
 const rows={};
 for(const rel of [...SOURCES,...METADATA]) rows[rel]=sha(sourceFile(functionRoot,rel));
 rows['src/index.ts']=sha(Buffer.from(INDEX));
 return rows;
}
const expected=expectedHashMap();
const all=[...SOURCES,...METADATA,'src/index.ts'].sort();
if(mode==='prepare'){
 requireGuard(!fs.existsSync(dest),'candidate output must be a new empty path');
 for(const rel of [...SOURCES,...METADATA]){
  fs.mkdirSync(path.dirname(path.join(dest,rel)),{recursive:true});
  fs.writeFileSync(path.join(dest,rel),sourceFile(functionRoot,rel),{flag:'wx'});
 }
 fs.writeFileSync(path.join(dest,'src/index.ts'),INDEX,{flag:'wx'});
 const receipt={status:'CANDIDATE_ONLY_NOT_AUTHORIZED',target:FN,project:'sandman-combat-staging',
  sourceSha:PIN,sourceFiles:expected,packageEntry:'lib/index.js',excludedHosting:true,
  deploymentAuthorized:false,productionAuthorized:false,emailAuthorized:false,
  secretValuesAccessed:false,needs: ['source-build','real-effective-secret-access','receipt-sandbox','transport-auth','rollback-baseline']};
 fs.writeFileSync(dest+'.review.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log('2C receipt-only source candidate prepared; no deploy authority');
}else {
 const actual=filesUnder(path.join(dest,'src')).map(p=>path.relative(dest,p).split(path.sep).join('/')).sort();
 requireGuard(JSON.stringify(actual)===JSON.stringify(all.filter(p=>p.startsWith('src/'))),'unexpected source file(s)');
 for(const [rel,hash] of Object.entries(expected))requireGuard(sha(sourceFile(dest,rel))===hash,'candidate drift: '+rel);
 const compiled=filesUnder(path.join(dest,'lib')).map(p=>path.relative(dest,p).split(path.sep).join('/')).sort();
 const allowed=SOURCES.map(rel=>rel.replace(/^src\//,'lib/').replace(/\.ts$/,'.js')).concat('lib/index.js').sort();
 requireGuard(JSON.stringify(compiled)===JSON.stringify(allowed),'compiled unrelated functions or missing module');
 const exportsText=sourceFile(dest,'lib/index.js').toString();
 requireGuard(/sendProposalPrepaidCashReceipt/.test(exportsText) && !/createProposalCheckout|stripeBillingWebhook|approveAndActivate/.test(exportsText),
  'compiled entrypoint export drift');
 const receipt=JSON.parse(fs.readFileSync(dest+'.review.json','utf8'));
 requireGuard(receipt.sourceSha===PIN && receipt.deploymentAuthorized===false && receipt.target===FN,'candidate receipt mismatch');
 console.log('2C isolated receipt candidate verified: only receipt entrypoint; deploymentAuthorized=false');
}
