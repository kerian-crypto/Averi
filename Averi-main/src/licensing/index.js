/* ==========================================================
   AVERI LICENSING — Point d'entrée du module
   ========================================================== */
export * from './config.js';
export * from './status.js';
export { LicenseFacade } from './facade.js';
export { LicenseEngine } from './license-engine.js';
export { DemoEngine } from './demo-engine.js';
export { SecureLicenseStorage, MemoryBackend } from './storage.js';
export { ActivationService } from './activation.js';
export { RevocationRegistry } from './revocation.js';
export { Entitlements, intersectFeatures } from './entitlements.js';
export { LocalLicenseValidator, RemoteLicenseValidator, HybridLicenseValidator } from './validators.js';
export { decodeToken, encodeToken, signingInputFor, normalizeToken, LicenseFormatError } from './license-format.js';
export { verify as ed25519Verify } from './ed25519.js';
export { sha512, hmacSha512 } from './sha512.js';
export { buildIdentity, fingerprintOf, formatDeviceCode } from './device.js';
export { ClockGuard, formatDuration, formatEpoch, nowSeconds } from './clock.js';
export { Journal } from './journal.js';
