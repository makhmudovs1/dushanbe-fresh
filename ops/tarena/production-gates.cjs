const fs = require('node:fs');
const gates = {
  export: ['sourceEvidencePreserved', 'quarantineInTajikistan', 'exportWindowApproved'],
  import: ['trustedReleaseReviewed', 'isolatedQuarantineAccepted', 'schemaAndRowsReconciled', 'filesValidated', 'freshCredentialsInstalled'],
  cutover: ['offsiteStorageInTajikistan', 'offsiteEncryptionKeyEscrow', 'offsiteBackupRestored', 'hostHardeningAccepted',
    'publicTlsReady', 'singleWriterFreezeVerified', 'finalDataReconciled',
    'deviceAcceptanceOrOwnerWaiver', 'dnsChangeExplicitlyApproved'],
  activation: ['publicDnsPointsOnlyToTarena', 'publicTlsAndRenewalTested', 'singleProductionDatabaseVerified']
};
function accepted(item) {
  return !!item && item.passed === true && typeof item.reference === 'string' && !!item.reference.trim() &&
    typeof item.approvedBy === 'string' && !!item.approvedBy.trim() && Number.isFinite(Date.parse(item.checkedAtUTC));
}
const offsiteGates = new Set(['offsiteStorageInTajikistan', 'offsiteEncryptionKeyEscrow', 'offsiteBackupRestored']);
function missingGates(phase, evidence) {
  if (!Object.hasOwn(gates, phase)) throw Error('Unknown migration phase');
  const waiver = evidence.ownerAcceptedNoIndependentBackup;
  const temporaryOffsiteWaiver = accepted(waiver) && waiver.scope === 'current-cutover-with-local-backups-only' &&
    waiver.noIndependentCopy === true && waiver.noAlmatyFallback === true && accepted(evidence.localEncryptedRestoreVerified);
  const phases = ['export', 'import', 'cutover', 'activation'];
  return phases.slice(0, phases.indexOf(phase) + 1).flatMap(p => gates[p]).filter(name => {
    if (offsiteGates.has(name) && temporaryOffsiteWaiver) return false;
    return !accepted(evidence[name]);
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
