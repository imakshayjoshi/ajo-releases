// Curated titles must never be shown with guessed or shared streams.
// Populate these lists only from a checked catalog service.
export const PREMIUM_DOCUMENTARIES = [];
export const PREMIUM_ANIME = [];
export const NETWORK_ORIGINALS = [];

export async function getAnimeCatalog() { return []; }
export function getDocumentariesCatalog() { return []; }
export function getNetworkOriginalsCatalog() { return []; }
