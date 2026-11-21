import { parseDebtAmount } from './parseDebtAmount';
import type { PersonalDebtDirection } from './personalDebtStorage';

export type ParsedPersonalDebtStatement = {
  person: string | null;
  direction: PersonalDebtDirection | null;
  amount: string | null;
  note: string;
};

type Token = { value: string; start: number; end: number };
type AmountRange = { start: number; end: number; value: string };

const NUMBER_WORDS = new Set([
  'cero', 'un', 'uno', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintiun', 'veintiuna', 'veintidos', 'veintitres', 'veinticuatro', 'veinticinco',
  'veintiseis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'cuarenta', 'cincuenta', 'sesenta',
  'setenta', 'ochenta', 'noventa', 'cien', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos', 'mil',
]);

/** Separa los datos más comunes que el usuario dicta para crear una deuda personal. */
export function parsePersonalDebtStatement(transcript: string): ParsedPersonalDebtStatement {
  const searchableText = transcript.toLocaleLowerCase('es-BO').replace(/[;:!?]/g, ' ');
  const amountRange = findAmountRange(searchableText);
  const amount = parseDebtAmount(transcript);
  const range = amountRange && amountRange.value === amount ? amountRange : null;

  if (!range) return { person: null, direction: null, amount, note: cleanNote(transcript) };

  const beforeAmount = searchableText.slice(0, range.start).trim();
  const identity = parseIdentity(beforeAmount, transcript);
  const afterAmount = transcript.slice(range.end);

  return {
    person: identity?.person ?? null,
    direction: identity?.direction ?? null,
    amount,
    note: cleanNote(afterAmount),
  };
}

function findAmountRange(text: string): AmountRange | null {
  const tokens: Token[] = Array.from(text.matchAll(/\S+/g), match => ({
    value: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));

  for (let start = 0; start < tokens.length; start += 1) {
    const word = stripAccents(tokens[start].value.replace(/[^\p{L}\d.,]/gu, ''));
    const startsAmount = /^\d/.test(word)
      || NUMBER_WORDS.has(word)
      || (word === 'bs' && tokens[start + 1] !== undefined);
    if (!startsAmount) continue;

    const lastEnd = Math.min(tokens.length, start + 10);
    for (let end = start + 1; end <= lastEnd; end += 1) {
      const candidate = text.slice(tokens[start].start, tokens[end - 1].end);
      const value = parseDebtAmount(candidate);
      if (!value) continue;

      // Keep spoken decimal amounts such as "800 coma 50 bolivianos" together.
      const nextToken = tokens[end]?.value;
      if (nextToken && /^(coma|punto)$/i.test(nextToken)) continue;

      let rangeEnd = tokens[end - 1].end;
      if (tokens[end] && /^(bs\.?|bolivianos?)$/i.test(tokens[end].value)) rangeEnd = tokens[end].end;
      return { start: tokens[start].start, end: rangeEnd, value };
    }
  }
  return null;
}

function parseIdentity(beforeAmount: string, originalTranscript: string): { person: string; direction: PersonalDebtDirection } | null {
  const patterns: Array<{ direction: PersonalDebtDirection; expression: RegExp }> = [
    { direction: 'yo_debo', expression: /^(?:(?:yo\s+)?(?:le\s+)?debo\s+a)\s+(.+)$/i },
    { direction: 'yo_debo', expression: /^tengo\s+que\s+pagar\s+a\s+(.+)$/i },
    { direction: 'me_deben', expression: /^(.+?)\s+me\s+deben?$/i },
    { direction: 'me_deben', expression: /^(?:a\s+mi\s+)?me\s+deben?\s+(?:a\s+)?(.+)$/i },
  ];

  for (const pattern of patterns) {
    const match = pattern.expression.exec(beforeAmount);
    if (!match?.[1]) continue;
    const capturedStart = match.index + match[0].indexOf(match[1]);
    let nameEnd = match[1].search(/\s+(?:por|para|por\s+concepto\s+de)\s+/i);
    if (nameEnd < 0) nameEnd = match[1].length;
    const originalName = originalTranscript.slice(capturedStart, capturedStart + nameEnd).trim();
    const person = formatPersonName(originalName);
    if (person) return { person, direction: pattern.direction };
  }

  return null;
}

function formatPersonName(value: string): string {
  const cleaned = value.replace(/^[\s,.-]+|[\s,.-]+$/g, '').replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length > 120) return '';
  const particles = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
  return cleaned.split(' ').map((word, index) => {
    const lower = word.toLocaleLowerCase('es-BO');
    if (index > 0 && particles.has(lower)) return lower;
    return lower.charAt(0).toLocaleUpperCase('es-BO') + lower.slice(1);
  }).join(' ');
}

function cleanNote(value: string): string {
  return value
    .replace(/^[\s,.;:!?-]+/, '')
    .replace(/^(?:bs\.?|bolivianos?)\b\s*/i, '')
    .replace(/^(?:de|por|para|en|con)\s+/i, '')
    .replace(/[\s,.;:!?-]+$/, '')
    .trim()
    .slice(0, 500);
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-BO');
}
