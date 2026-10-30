const fs = require('node:fs');
const gates = {
  export: ['sourceEvidencePreserved', 'quarantineInTajikistan', 'offsiteStorageInTajikistan', 'offsiteEncryptionKeyEscrow', 'exportWindowApproved'],
  import: ['trustedReleaseReviewed', 'isolatedQuarantineAccepted', 'schemaAndRowsReconciled', 'filesValidated', 'freshCredentialsInstalled', 'hostHardeningAccepted'],
  cutover: ['offsiteBackupRestored', 'externalAlertsTested', 'publicTlsAndRenewalTested', 'singleWriterFreezeVerified', 'finalDataReconciled',
    'deviceAcceptanceOrOwnerWaiver', 'dnsChangeExplicitlyApproved']
};
function missingGates(phase, evidence) {
  if (!Object.hasOwn(gates, phase)) throw Error('Unknown migration phase');
  const phases = ['export', 'import', 'cutover'];
  return phases.slice(0, phases.indexOf(phase) + 1).flatMap(p => gates[p]).filter(name => {
    const item = evidence[name];
    return !item || item.passed !== true || typeof item.reference !== 'string' || !item.reference.trim() ||
      typeof item.approvedBy !== 'string' || !item.approvedBy.trim() || !Number.isFinite(Date.parse(item.checkedAtUTC));
  });
}
module.exports = { gates, missingGates };
if (require.main === module) {
  try {
    const [, , phase, file] = process.argv;
    const missing = missingGates(phase, JSON.parse(fs.readFileSync(file, 'utf8')));
    console.log(JSON.stringify({ phase, ready: missing.length === 0, missing, advisoryOnly: true }));
    if (missing.length) process.exitCode = 2;
  } catch { console.error('Migration evidence cannot be validated; no action authorized.'); process.exitCode = 1; }
}
