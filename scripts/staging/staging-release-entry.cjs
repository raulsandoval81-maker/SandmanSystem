const credentialEnvironment = [
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_GHA_CREDS_PATH",
  "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
];
const savedCredentials = new Map();
const githubWifCredential = process.env.GOOGLE_GHA_CREDS_PATH;
const isolateGithubWif = Boolean(githubWifCredential)
  && process.env.GOOGLE_APPLICATION_CREDENTIALS === githubWifCredential;

if (isolateGithubWif) {
  for (const name of credentialEnvironment) {
    if (Object.prototype.hasOwnProperty.call(process.env, name)) {
      savedCredentials.set(name, process.env[name]);
      delete process.env[name];
    }
  }
}

try {
  const { setGlobalOptions } = require("firebase-functions/v2/options");
  setGlobalOptions({
    preserveExternalChanges: true,
    serviceAccount: "__SANDMAN_STAGING_RUNTIME_SERVICE_ACCOUNT__",
  });
  module.exports = require("./lib/staging.js");
} finally {
  if (isolateGithubWif) {
    for (const name of credentialEnvironment) {
      if (savedCredentials.has(name)) process.env[name] = savedCredentials.get(name);
      else delete process.env[name];
    }
  }
}
