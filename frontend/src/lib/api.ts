import type { Session } from '@supabase/supabase-js';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiProfile = { id: string; nombre: string; telefono: string | null };
export type Debt = {
  id: string;
  creada_por: string;
  deudor_id: string;
  acreedor_id: string;
  monto_inicial: string | number;
  moneda: string;
  motivo: string | null;
  estado: 'pendiente' | 'confirmada' | 'en_revision' | 'pagada' | 'cancelada';
  fecha_creacion: string;
};
export type DebtBalance = { deuda_id: string; saldo_pendiente: string | number; moneda: string };
export type Movement = {
  id: string;
  registrado_por: string;
  monto: string | number;
  nota: string | null;
  estado: 'pendiente' | 'confirmado' | 'reportado';
  fecha_creacion: string;
};
export type Plan = { plan: 'gratis' | 'premium'; vigente_hasta: string | null; precio_mensual: number; moneda: string };
export type Pasanacu = {
  id: string;
  creador_id: string;
  nombre: string;
  cuota: string | number;
  cupos: number;
  estado: 'abierto' | 'activo' | 'completado';
  turno: number;
  fecha_creacion: string;
};
export type PasanacuMember = { perfil_id: string; posicion: number };
export type PasanacuContribution = { turno: number; aportante_id: string; registrado_en: string; confirmado_en: string | null };
export type PasanacuDetail = Pasanacu & {
  pasanacu_miembros: PasanacuMember[];
  pasanacu_aportes: PasanacuContribution[];
};

type ApiEnvelope<T> = { data: T };

export async function apiRequest<T>(session: Session, path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
        Authorization: `Bearer ${session.access_token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(`No se pudo conectar con la API (${API_URL}). Revisa la URL y la red.`);
  }

  let payload: ApiEnvelope<T> | { error?: string; codigo?: string } | undefined;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('La API devolvió una respuesta que no se pudo leer.', response.status);
  }

  if (response.status === 401) {
    throw new ApiError('Tu sesión venció. Inicia sesión nuevamente.', 401);
  }
  if (!response.ok) {
    const error = payload as { error?: string; codigo?: string };
    throw new ApiError(error.error || `La API respondió ${response.status}.`, response.status, error.codigo);
  }
  return (payload as ApiEnvelope<T>).data;
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/salud`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
    if (!response.ok) return false;
    const body = await response.json();
    return body.supabase === 'conectado';
  } catch {
    return false;
  }
}

export function firstRow<T>(data: T | T[] | null | undefined): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}
