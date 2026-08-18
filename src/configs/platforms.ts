// Marketplace / courier platforms, mirroring TrackVid-BE's IMPORT_PLATFORM enum
// (src/enum/common.enum.ts). Keys are lowercase because every BE endpoint that
// takes one lower-cases the input and matches the stored casing variants
// ("AJIO" / "ajio" / "Ajio") itself — see platformNameCasings.
//
// Order puts the four platforms with running automation first: they are what
// ops filters by daily, and burying them under an alphabetical list would cost
// a scan on every use.
export const PLATFORMS = [
  { key: 'myntra', label: 'Myntra' },
  { key: 'ajio', label: 'Ajio' },
  { key: 'snapdeal', label: 'Snapdeal' },
  { key: 'meesho', label: 'Meesho' },
  { key: 'flipkart', label: 'Flipkart' },
  { key: 'amazon', label: 'Amazon' },
  { key: 'nykaa', label: 'Nykaa' },
  { key: 'delhivery', label: 'Delhivery' },
  { key: 'xbees', label: 'Xbees' },
  { key: 'd2c', label: 'D2C' },
  { key: 'other', label: 'Other' }
] as const

export type PlatformKey = (typeof PLATFORMS)[number]['key']

// The subset the master-data sync jobs and the Company list's Last Sync column
// cover. Kept separate from PLATFORMS on purpose: /trigger-master-sync rejects
// anything outside this set, so offering the rest as a sync target would build
// a button that can only fail.
export const SYNCABLE_PLATFORMS = [
  { key: 'ajio', label: 'Ajio' },
  { key: 'myntra', label: 'Myntra' },
  { key: 'snapdeal', label: 'Snapdeal' },
  { key: 'meesho', label: 'Meesho' }
] as const

export type SyncablePlatformKey = (typeof SYNCABLE_PLATFORMS)[number]['key']
