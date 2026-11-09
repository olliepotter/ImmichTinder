import type { QueueItemLocation, ReviewScope } from '~/types/api'

function validDate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatTakenAt(iso: string | null, style: 'short' | 'long' = 'short') {
  const d = validDate(iso)
  if (!d) return ''
  return new Intl.DateTimeFormat(undefined, style === 'short'
    ? { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  ).format(d)
}

export function formatDay(iso: string | null) {
  const d = validDate(iso)
  if (!d) return ''
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d)
}

const COUNTRY_CODES: Record<string, string> = {
  'UNITED STATES': 'US', 'USA': 'US', 'U.S.A.': 'US', 'UNITED STATES OF AMERICA': 'US',
  'UNITED KINGDOM': 'GB', 'UK': 'GB', 'ENGLAND': 'GB', 'SCOTLAND': 'GB', 'WALES': 'GB',
  'GERMANY': 'DE', 'DEUTSCHLAND': 'DE', 'FRANCE': 'FR', 'SPAIN': 'ES', 'ESPAÑA': 'ES',
  'ITALY': 'IT', 'ITALIA': 'IT', 'AUSTRIA': 'AT', 'ÖSTERREICH': 'AT',
  'SWITZERLAND': 'CH', 'SCHWEIZ': 'CH', 'SUISSE': 'CH', 'SVIZZERA': 'CH',
  'PORTUGAL': 'PT', 'NETHERLANDS': 'NL', 'THE NETHERLANDS': 'NL', 'HOLLAND': 'NL',
  'POLAND': 'PL', 'POLSKA': 'PL', 'CZECHIA': 'CZ', 'CZECH REPUBLIC': 'CZ',
  'BELGIUM': 'BE', 'SWEDEN': 'SE', 'NORWAY': 'NO', 'DENMARK': 'DK', 'FINLAND': 'FI',
  'IRELAND': 'IE', 'CANADA': 'CA', 'AUSTRALIA': 'AU', 'NEW ZEALAND': 'NZ',
  'JAPAN': 'JP', 'CHINA': 'CN', 'INDIA': 'IN', 'GREECE': 'GR', 'CROATIA': 'HR',
  'MEXICO': 'MX', 'BRAZIL': 'BR', 'ICELAND': 'IS', 'TURKEY': 'TR', 'TÜRKIYE': 'TR',
}

export function countryFlag(country: string | null) {
  if (!country) return ''
  const key = country.trim().toUpperCase()
  const code = COUNTRY_CODES[key] ?? (/^[A-Z]{2}$/.test(key) ? key : null)
  if (!code) return ''
  return [...code].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')
}

export function locationText(location: QueueItemLocation | null) {
  if (!location) return ''
  if (location.text) return location.text
  return [location.city, location.state, location.country].filter(Boolean).join(', ')
}

export function locationWithFlag(location: QueueItemLocation | null) {
  const text = locationText(location)
  if (!text) return ''
  const flag = countryFlag(location?.country ?? null)
  return flag ? `${flag} ${text}` : text
}

const ORDER_LABELS: Record<ReviewScope['order'], string> = {
  random: 'Random',
  oldest: 'Oldest first',
  newest: 'Newest first',
}

export function orderLabel(order: ReviewScope['order']) {
  return ORDER_LABELS[order]
}

export function scopeSummary(scope: ReviewScope, albumName: string | null) {
  const parts = [scope.albumId ? (albumName ?? 'Album') : 'Library', ORDER_LABELS[scope.order]]
  if (scope.takenAfter || scope.takenBefore) {
    const from = scope.takenAfter ? formatDay(scope.takenAfter) : '…'
    const to = scope.takenBefore ? formatDay(shiftIsoDay(scope.takenBefore, -1)) : '…'
    parts.push(`${from} – ${to}`)
  }
  return parts.join(' · ')
}

export function formatCount(n: number) {
  return new Intl.NumberFormat().format(n)
}

export function immichPhotoUrl(base: string, id: string) {
  if (!base) return ''
  return `${base.replace(/\/+$/, '')}/photos/${encodeURIComponent(id)}`
}

const DAY_MS = 86_400_000

function shiftIsoDay(iso: string, days: number) {
  const d = validDate(iso)
  return d ? new Date(d.getTime() + days * DAY_MS).toISOString() : iso
}

/** `<input type="date">` value (YYYY-MM-DD) → ISO start of that day (UTC). */
export function dateInputToIso(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : null
}

/** Inclusive "to" day → exclusive `takenBefore` (start of the next day). */
export function inclusiveEndToIso(value: string) {
  const start = dateInputToIso(value)
  return start ? shiftIsoDay(start, 1) : null
}

/** ISO timestamp → `<input type="date">` value. */
export function isoToDateInput(iso: string | null, shiftDays = 0) {
  if (!iso) return ''
  const d = validDate(iso)
  return d ? new Date(d.getTime() + shiftDays * DAY_MS).toISOString().slice(0, 10) : ''
}
