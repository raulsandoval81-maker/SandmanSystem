#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import path from 'node:path';

const [directory]=process.argv.slice(2);
if(!directory)throw Error('Evidence directory is required');
const read=(name,suffix)=>JSON.parse(readFileSync(path.join(directory,`${name}-${suffix}.json`),'utf8'));
const stableIam=value=>JSON.stringify((value.bindings||[]).map(binding=>({
  role:binding.role,members:[...(binding.members||[])].sort(),condition:binding.condition||null,
})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
const targets={
  issueProposalClientReview:'sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com',
  recordProposalPrepaidCash:'991554514268-compute@developer.gserviceaccount.com',
};
for(const [name,identity] of Object.entries(targets)){
  const before=read(name,'before'),after=read(name,'after'),service=after.serviceConfig||{};
  if(after.state!=='ACTIVE'||after.buildConfig?.runtime!=='nodejs22'||after.buildConfig?.entryPoint!==name||
    after.updateTime===before.updateTime||service.serviceAccountEmail!==identity||service.availableMemory!=='256Mi'||
    service.timeoutSeconds!==60||service.maxInstanceCount!==20||service.maxInstanceRequestConcurrency!==80||
    service.ingressSettings!=='ALLOW_ALL')throw Error(`Target runtime update not verified: ${name}`);
  if(stableIam(read(name,'iam-before'))!==stableIam(read(name,'iam-after'))||
    stableIam(read(name,'run-iam-before'))!==stableIam(read(name,'run-iam-after')))throw Error(`Target IAM changed: ${name}`);
}
const issue=read('issueProposalClientReview','after');
if(JSON.stringify((issue.serviceConfig?.secretEnvironmentVariables||[]).map(value=>value.key).sort())!==
  JSON.stringify(['RESEND_API_KEY','STAGING_TEST_EMAIL_ALLOWLIST']))throw Error('Issue secret references incorrect');
for(const name of ['getProposalClientReview','acceptProposalClientReview','createProposalCheckout','sendProposalPrepaidCashReceipt']){
  if(JSON.stringify(read(name,'before'))!==JSON.stringify(read(name,'after'))||
    JSON.stringify(read(name,'run-before'))!==JSON.stringify(read(name,'run-after'))||
    stableIam(read(name,'iam-before'))!==stableIam(read(name,'iam-after'))||
    stableIam(read(name,'run-iam-before'))!==stableIam(read(name,'run-iam-after')))throw Error(`Neighbor changed: ${name}`);
}
