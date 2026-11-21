const SMALL_NUMBERS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};

const CURRENCY = String.raw`(?:bs\.?|bolivianos?)`;

/** Extract a clear amount from a transcript. Returns null when the amount is ambiguous. */
export function parseDebtAmount(transcript: string): string | null {
  const text = normalizeWords(transcript);
  const decimalPhrase = text.match(new RegExp(String.raw`([\w]+)\s+(coma|punto)\s+([\w]+)\s*${CURRENCY}\b`, 'i'));
  if (decimalPhrase) {
    const amount = parseSpanishAmountWords(`${decimalPhrase[1]} ${decimalPhrase[2]} ${decimalPhrase[3]}`);
    return isValidAmount(amount) ? amount : null;
  }

  const numericWithCurrency = text.match(new RegExp(String.raw`(\d[\d., ]*)\s*${CURRENCY}\b|\b${CURRENCY}\s*(\d[\d., ]*)`, 'i'));
  if (numericWithCurrency) {
    const raw = numericWithCurrency[1] ?? numericWithCurrency[2];
    const amount = normalizeNumericAmount(raw);
    return isValidAmount(amount) ? amount : null;
  }

  const wordsWithCurrency = text.match(new RegExp(String.raw`(.+?)\s*${CURRENCY}\b|\b${CURRENCY}\s*(.+)`, 'i'));
  if (wordsWithCurrency) {
    const words = wordsWithCurrency[1] ?? wordsWithCurrency[2] ?? '';
    const amount = parseSpanishAmountWords(words);
    return isValidAmount(amount) ? amount : null;
  }

  const numericValues = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (numericValues.length !== 1) return null;
  const amount = normalizeNumericAmount(numericValues[0]);
  return isValidAmount(amount) ? amount : null;
}

function normalizeNumericAmount(value: string): string | null {
  const raw = value.replace(/\s/g, '');
  if (!raw || !/^\d[\d.,]*$/.test(raw)) return null;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const decimalSeparator = Math.max(lastComma, lastDot);
  if (decimalSeparator < 0) return raw;

  const whole = raw.slice(0, decimalSeparator).replace(/[.,]/g, '') || '0';
  const fraction = raw.slice(decimalSeparator + 1);
  if (!/^\d*$/.test(whole) || !/^\d+$/.test(fraction)) return null;
  if (fraction.length === 3) return `${whole}${fraction}`;
  if (fraction.length > 2) return null;
  return `${whole}.${fraction}`;
}

function parseSpanishAmountWords(words: string): string | null {
  const normalized = words.trim();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > 8) return null;

  const decimalIndex = tokens.findIndex(token => token === 'coma' || token === 'punto');
  const integerTokens = decimalIndex < 0 ? tokens : tokens.slice(0, decimalIndex);
  const decimalTokens = decimalIndex < 0 ? [] : tokens.slice(decimalIndex + 1);
  if (decimalIndex >= 0 && decimalTokens.length !== 1) return null;

  for (let start = 0; start < integerTokens.length; start += 1) {
    const candidate = integerTokens.slice(start);
    const integerText = candidate.join(' ');
    const integer = /^\d+$/.test(integerText) ? Number(integerText) : parseSpanishInteger(candidate);
    if (integer === null) continue;
    if (decimalIndex < 0) return String(integer);
    const decimalValue = /^\d{1,2}$/.test(decimalTokens[0]) ? Number(decimalTokens[0]) : SMALL_NUMBERS[decimalTokens[0]];
    if (decimalValue === undefined || decimalValue > 99) return null;
    return `${integer}.${String(decimalValue).padStart(2, '0')}`;
  }
  return null;
}

function parseSpanishInteger(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let previousClass: 'hundred' | 'ten' | 'unit' | null = null;
  let joinedByAnd = false;

  for (const token of tokens) {
    if (token === 'y') {
      if (previousClass !== 'ten') return null;
      joinedByAnd = true;
      continue;
    }
    if (token === 'mil') {
      total += (current || 1) * 1000;
      current = 0;
      previousClass = null;
      joinedByAnd = false;
      continue;
    }
    const value = SMALL_NUMBERS[token];
    if (value === undefined) return null;
    const valueClass = value >= 100 ? 'hundred' : value >= 20 ? 'ten' : 'unit';
    if (valueClass === 'hundred' && previousClass === 'hundred') return null;
    if (valueClass === 'ten' && (previousClass === 'ten' || previousClass === 'unit')) return null;
    if (valueClass === 'unit' && (previousClass === 'unit' || (previousClass === 'ten' && !joinedByAnd))) return null;
    current += value;
    previousClass = valueClass;
    joinedByAnd = false;
  }

  if (!previousClass || tokens[tokens.length - 1] === 'y') return null;
  const result = total + current;
  return result > 0 ? result : null;
}

function normalizeWords(value: string): string {
  return value.toLocaleLowerCase('es-BO').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[;:!?]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isValidAmount(value: string | null): value is string {
  return value !== null && /^\d{1,10}(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
}
