function text(value, field, max = 160) {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} is required.`), { status: 400 });
  const result = value.trim();
  if (result.length > max) throw Object.assign(new Error(`${field} must be ${max} characters or fewer.`), { status: 400 });
  return result;
}
function positiveInteger(value, field, max = 50) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) throw Object.assign(new Error(`${field} must be a whole number between 1 and ${max}.`), { status: 400 });
  return number;
}
function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Object.assign(new Error('A valid travel date is required.'), { status: 400 });
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw Object.assign(new Error('Travel date is invalid.'), { status: 400 });
  if (value < new Date().toISOString().slice(0, 10)) throw Object.assign(new Error('Travel date cannot be in the past.'), { status: 400 });
  return value;
}
function email(value) {
  const result = text(value, 'Contact email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw Object.assign(new Error('Enter a valid contact email address.'), { status: 400 });
  return result;
}
module.exports = { text, positiveInteger, dateOnly, email };
