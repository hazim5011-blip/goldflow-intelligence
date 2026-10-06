// Current verified Production forward storage is NOT_CONFIGURED. No fake forward evidence.
const unavailable=()=>{throw Error("FORWARD_STORAGE_NOT_CONFIGURED")};
export const forwardConfigured=()=>false;
export const publicReadEnabled=()=>false;
export const validateSecret=()=>false;
export const normalizePublishedPayload=unavailable;
export const normalizeOutcomePayload=unavailable;
export const forwardPath=unavailable;
export const outcomePath=unavailable;
export const storePublished=async()=>unavailable();
export const storeOutcome=async()=>unavailable();
export const readForward=async()=>unavailable();
export const readForwardPrivate=async()=>unavailable();
export const readForwardOutcome=async()=>unavailable();
export const readForwardOutcomePrivate=async()=>unavailable();
