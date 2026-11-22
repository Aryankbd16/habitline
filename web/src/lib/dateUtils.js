// All dates are stored/compared as 'yyyy-MM-dd' local strings (no timezone
// drift issues from storing full ISO timestamps for day-granularity data).

export function todayStr(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const y = String(d.getFullYear()).padStart(4, '0')
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDateStr(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(dateStr, days) {
  const d = parseDateStr(dateStr)
  d.setDate(d.getDate() + days)
  return todayStr(d)
}

export function dayOfWeek(dateStr) {
  // 0 = Sunday ... 6 = Saturday
  return parseDateStr(dateStr).getDay()
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function startOfMonth(dateStr) {
  const d = parseDateStr(dateStr)
  return todayStr(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

export function isSameDay(a, b) {
  return a === b
}

export function humanDate(dateStr) {
  return parseDateStr(dateStr).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function lastNDays(n, endDateStr = todayStr()) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    out.push(addDays(endDateStr, -i))
  }
  return out
}
