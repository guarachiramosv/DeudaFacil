import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { apiRequest } from '../../lib/api';
import type { NewPersonalDebt, NewPersonalDebtEntry, PersonalDebt, PersonalDebtEntry, PersonalDebtInputMethod } from './personalDebtStorage';
import { loadPersonalDebts } from './personalDebtStorage';

type PersonalDebtRow = {
  id: string;
  persona: string;
  direccion: PersonalDebt['direction'];
  monto_inicial: string | number;
  nota: string | null;
  metodo_entrada: PersonalDebtInputMethod;
  fecha_creacion: string;
  abonos_personales: PersonalDebtEntryRow[] | null;
};

type PersonalDebtEntryRow = {
  id: string;
  monto: string | number;
  nota: string | null;
  metodo_entrada: PersonalDebtInputMethod;
  fecha_creacion: string;
};

const migrationMarker = (userId: string) => `deudafacil:personal-debts:migrated-to-cloud:v1:${userId}`;

/** Imports records created by older APKs. Stable legacy IDs make retries safe if the network drops mid-migration. */
export async function loadPersonalDebtsFromCloud(session: Session): Promise<PersonalDebt[]> {
  await migrateLegacyPersonalDebts(session);
  return fetchPersonalDebts(session);
}

export async function fetchPersonalDebts(session: Session): Promise<PersonalDebt[]> {
  const rows = await apiRequest<PersonalDebtRow[]>(session, '/api/deudas-personales');
  return Array.isArray(rows) ? rows.map(mapPersonalDebt) : [];
}

export async function createPersonalDebtInCloud(session: Session, input: NewPersonalDebt): Promise<PersonalDebt[]> {
  await apiRequest<string>(session, '/api/deudas-personales', {
    method: 'POST',
    body: JSON.stringify({
      person: input.person,
      direction: input.direction,
      initialAmount: input.initialAmount,
      note: input.note || undefined,
      inputMethod: input.inputMethod,
    }),
  });
  return fetchPersonalDebts(session);
}

export async function addPersonalDebtEntryInCloud(session: Session, debtId: string, input: NewPersonalDebtEntry): Promise<PersonalDebt[]> {
  await apiRequest<string>(session, `/api/deudas-personales/${encodeURIComponent(debtId)}/abonos`, {
    method: 'POST',
    body: JSON.stringify({ amount: input.amount, note: input.note || undefined, inputMethod: input.inputMethod }),
  });
  return fetchPersonalDebts(session);
}

async function migrateLegacyPersonalDebts(session: Session): Promise<void> {
  const key = migrationMarker(session.user.id);
  if ((await AsyncStorage.getItem(key)) === 'done') return;

  const legacyDebts = await loadPersonalDebts(session.user.id);
  for (const debt of legacyDebts) {
    const cloudDebtId = await apiRequest<string>(session, '/api/deudas-personales', {
      method: 'POST',
      body: JSON.stringify({
        person: debt.person,
        direction: debt.direction,
        initialAmount: debt.initialAmount,
        note: debt.note || undefined,
        inputMethod: debt.inputMethod,
        legacyId: debt.id,
      }),
    });

    for (const entry of debt.entries) {
      await apiRequest<string>(session, `/api/deudas-personales/${encodeURIComponent(cloudDebtId)}/abonos`, {
        method: 'POST',
        body: JSON.stringify({
          amount: entry.amount,
          note: entry.note || undefined,
          inputMethod: entry.inputMethod,
          legacyId: entry.id,
        }),
      });
    }
  }

  await AsyncStorage.setItem(key, 'done');
}

function mapPersonalDebt(row: PersonalDebtRow): PersonalDebt {
  const entries = Array.isArray(row.abonos_personales) ? row.abonos_personales : [];
  return {
    id: row.id,
    person: row.persona,
    direction: row.direccion,
    initialAmount: String(row.monto_inicial),
    note: row.nota ?? '',
    inputMethod: row.metodo_entrada,
    createdAt: row.fecha_creacion,
    entries: entries.map(entry => ({
      id: entry.id,
      amount: String(entry.monto),
      note: entry.nota ?? '',
      inputMethod: entry.metodo_entrada,
      createdAt: entry.fecha_creacion,
    })),
  };
}
