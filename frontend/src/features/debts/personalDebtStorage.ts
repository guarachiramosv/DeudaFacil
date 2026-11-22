import AsyncStorage from '@react-native-async-storage/async-storage';

export type PersonalDebtDirection = 'yo_debo' | 'me_deben';
export type PersonalDebtInputMethod = 'write' | 'voice';

export type PersonalDebtEntry = {
  id: string;
  amount: string;
  note: string;
  createdAt: string;
  inputMethod: PersonalDebtInputMethod;
};

export type PersonalDebt = {
  id: string;
  person: string;
  direction: PersonalDebtDirection;
  initialAmount: string;
  note: string;
  createdAt: string;
  inputMethod: PersonalDebtInputMethod;
  entries: PersonalDebtEntry[];
};

export type NewPersonalDebt = Omit<PersonalDebt, 'id' | 'createdAt' | 'entries'>;
export type NewPersonalDebtEntry = Omit<PersonalDebtEntry, 'id' | 'createdAt'>;

function storageKey(userId: string) {
  return `deudafacil:personal-debts:v1:${userId}`;
}

export async function loadPersonalDebts(userId: string): Promise<PersonalDebt[]> {
  const serialized = await AsyncStorage.getItem(storageKey(userId));
  if (!serialized) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('No se pudieron leer tus deudas guardadas en este dispositivo.');
  }
  if (!Array.isArray(parsed) || !parsed.every(isPersonalDebt)) {
    throw new Error('Los datos locales de deudas tienen un formato inválido.');
  }
  return parsed.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function isPersonalDebt(value: unknown): value is PersonalDebt {
  if (!value || typeof value !== 'object') return false;
  const debt = value as Partial<PersonalDebt>;
  return typeof debt.id === 'string'
    && typeof debt.person === 'string'
    && (debt.direction === 'yo_debo' || debt.direction === 'me_deben')
    && typeof debt.initialAmount === 'string'
    && typeof debt.note === 'string'
    && typeof debt.createdAt === 'string'
    && (debt.inputMethod === 'write' || debt.inputMethod === 'voice')
    && Array.isArray(debt.entries)
    && debt.entries.every(isPersonalDebtEntry);
}

function isPersonalDebtEntry(value: unknown): value is PersonalDebtEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PersonalDebtEntry>;
  return typeof entry.id === 'string'
    && typeof entry.amount === 'string'
    && typeof entry.note === 'string'
    && typeof entry.createdAt === 'string'
    && (entry.inputMethod === 'write' || entry.inputMethod === 'voice');
}
