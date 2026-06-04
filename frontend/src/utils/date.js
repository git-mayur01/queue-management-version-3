/**
 * Safely parses SQLite and Supabase ISO-8601 timestamps into a JavaScript Date object.
 * Returns null if the timestamp is invalid, empty, or null.
 * 
 * @param {string|Date|null|undefined} value 
 * @returns {Date|null}
 */
export function safeParseDate(value) {
  if (value === null || value === undefined) return null;
  
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  
  const str = String(value).trim();
  if (!str) return null;

  // Check if timezone indicator or T is already present
  const hasT = str.includes('T');
  const hasZ = str.includes('Z');
  const hasPlus = str.includes('+');
  const hasMinusOffset = /-\d{2}:?\d{2}$/.test(str);

  const shouldAppendZ = !hasT && !hasZ && !hasPlus && !hasMinusOffset;

  let formattedStr = str;
  if (shouldAppendZ) {
    formattedStr = str + 'Z';
  }

  // SQLite space compatibility: convert space between date and time to 'T'
  if (formattedStr.includes(' ') && !formattedStr.includes('T')) {
    formattedStr = formattedStr.replace(' ', 'T');
  }

  const parsed = new Date(formattedStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}
