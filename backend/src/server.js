import { createServer } from 'node:http';

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ALLOWED_ORIGIN } = process.env;
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) {
  throw new Error('Configura SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en backend/.env.');
}

const supabase = new URL(SUPABASE_URL);
if (supabase.protocol !== 'https:') throw new Error('SUPABASE_URL debe usar HTTPS.');

const groupFields = 'id,creador_id,nombre,cuota,cupos,estado,turno,fecha_creacion';
const routes = [
  ['GET', /^\/api\/perfil$/, () => 'perfiles?select=id,nombre,telefono'],
  ['GET', /^\/api\/deudas$/, () => 'deudas?select=id,creada_por,deudor_id,acreedor_id,monto_inicial,moneda,motivo,estado,fecha_creacion&order=fecha_creacion.desc'],
  ['POST', /^\/api\/deudas$/, () => 'rpc/registrar_deuda', (_, body) => ({
    p_contraparte: uuid(body.contraparte),
    p_rol: validateRole(body.rol),
    p_monto: amount(body.monto),
    p_motivo: optionalText(body.motivo),
  }), 201],
  ['POST', /^\/api\/deudas\/([^/]+)\/respuesta$/, () => 'rpc/responder_deuda', (match, body) => ({
    p_deuda: uuid(match[1]),
    p_confirmar: decision(body.confirmar),
  })],
  ['GET', /^\/api\/deudas\/([^/]+)\/saldo$/, match =>
    `saldos_deuda?select=deuda_id,saldo_pendiente,moneda&deuda_id=eq.${uuid(match[1])}`],
  ['GET', /^\/api\/deudas\/([^/]+)\/abonos$/, match =>
    `movimientos?select=id,registrado_por,monto,nota,estado,fecha_creacion&tipo=eq.abono&deuda_id=eq.${uuid(match[1])}&order=fecha_creacion.desc`],
  ['POST', /^\/api\/deudas\/([^/]+)\/abonos$/, () => 'rpc/registrar_abono', (match, body) => ({
    p_deuda: uuid(match[1]),
    p_monto: amount(body.monto),
    p_nota: optionalText(body.nota),
  }), 201],
  ['POST', /^\/api\/abonos\/([^/]+)\/respuesta$/, () => 'rpc/responder_abono', (match, body) => ({
    p_abono: uuid(match[1]),
    p_confirmar: decision(body.confirmar),
  })],
  ['GET', /^\/api\/plan$/, () => 'rpc/estado_plan'],
  ['GET', /^\/api\/pasanacus$/, () => `pasanacus?select=${groupFields}&order=fecha_creacion.desc`],
  ['POST', /^\/api\/pasanacus$/, () => 'rpc/crear_pasanacu', (_, body) => ({
    p_nombre: groupName(body.nombre),
    p_cuota: amount(body.cuota),
    p_cupos: integer(body.cupos, 2),
  }), 201],
  ['POST', /^\/api\/pasanacus\/unirse$/, () => 'rpc/unirse_pasanacu', (_, body) => ({
    p_codigo: uuid(body.codigo),
  })],
  ['GET', /^\/api\/pasanacus\/([^/]+)$/, match =>
    `pasanacus?select=${groupFields},pasanacu_miembros(perfil_id,posicion),pasanacu_aportes(turno,aportante_id,registrado_en,confirmado_en)&id=eq.${uuid(match[1])}`],
  ['POST', /^\/api\/pasanacus\/([^/]+)\/invitacion$/, () => 'rpc/invitar_pasanacu', match => ({
    p_grupo: uuid(match[1]),
  })],
  ['POST', /^\/api\/pasanacus\/([^/]+)\/inicio$/, () => 'rpc/iniciar_pasanacu', match => ({
    p_grupo: uuid(match[1]),
  })],
  ['POST', /^\/api\/pasanacus\/([^/]+)\/aportes$/, () => 'rpc/registrar_aporte_pasanacu', (match, body) => ({
    p_grupo: uuid(match[1]),
    p_turno: integer(body.turno, 1),
  })],
  ['POST', /^\/api\/pasanacus\/([^/]+)\/aportes\/confirmacion$/, () => 'rpc/confirmar_aporte_pasanacu', (match, body) => ({
    p_grupo: uuid(match[1]),
    p_turno: integer(body.turno, 1),
    p_aportante: uuid(body.aportante),
  })],
];

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new RequestError(400, 'Ingresa un ID válido.');
  }
  return value;
}

function amount(value) {
  const text = typeof value === 'number' || typeof value === 'string' ? String(value).trim().replace(',', '.') : '';
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text) || Number(text) <= 0) {
    throw new RequestError(400, 'Ingresa un monto positivo con hasta dos decimales.');
  }
  return text;
}

function validateRole(value) {
  if (value !== 'deudor' && value !== 'acreedor') throw new RequestError(400, 'Selecciona deudor o acreedor.');
  return value;
}

function decision(value) {
  if (typeof value !== 'boolean') throw new RequestError(400, 'Confirmar debe ser true o false.');
  return value;
}

function integer(value, minimum) {
  if (!Number.isInteger(value) || value < minimum || value > 25) {
    throw new RequestError(400, `Ingresa un entero entre ${minimum} y 25.`);
  }
  return value;
}

function groupName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) {
    throw new RequestError(400, 'El nombre del grupo debe tener entre 1 y 80 caracteres.');
  }
  return value.trim();
}

function optionalText(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 500) throw new RequestError(400, 'El texto admite hasta 500 caracteres.');
  return value.trim() || null;
}

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError(415, 'Envía un cuerpo application/json.');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > 8192) {
      request.resume();
      throw new RequestError(413, 'El cuerpo supera los 8 KB.');
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new RequestError(400, 'Envía un objeto JSON válido.');
  }
}

function json(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

async function requestSupabase(path, { authorization, body } = {}) {
  const result = await fetch(new URL(path, supabase), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(authorization && { Authorization: authorization }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
    redirect: 'error',
  });
  return { status: result.status, ok: result.ok, data: await result.json() };
}

const server = createServer(async (request, response) => {
  response.setHeader('Vary', 'Origin');
  if (ALLOWED_ORIGIN && request.headers.origin === ALLOWED_ORIGIN) {
    response.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }

  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && pathname === '/salud') {
      const check = await requestSupabase('/auth/v1/settings');
      return json(response, check.ok ? 200 : 503, { supabase: check.ok ? 'conectado' : 'no disponible' });
    }

    for (const [method, pattern, path, payload, successStatus = 200] of routes) {
      const match = pattern.exec(pathname);
      if (request.method !== method || !match) continue;
      const authorization = request.headers.authorization;
      if (!/^Bearer [^\s]+$/i.test(authorization ?? '')) throw new RequestError(401, 'Inicia sesión para continuar.');
      const body = payload ? payload(match, await readJson(request)) : undefined;
      const result = await requestSupabase('/rest/v1/' + path(match), { authorization, body });
      if (result.ok) return json(response, successStatus, { data: result.data });
      if (result.status >= 500) throw new RequestError(502, 'Supabase devolvió un error.');
      return json(response, result.status, {
        error: result.data.message ?? 'Supabase rechazó la solicitud.',
        codigo: result.data.code,
      });
    }
    json(response, 404, { error: 'Ruta no encontrada.' });
  } catch (error) {
    if (error instanceof RequestError) return json(response, error.status, { error: error.message });
    const healthCheck = request.url === '/salud';
    json(response, healthCheck ? 503 : 502, { error: 'No se pudo consultar Supabase.' });
  }
});

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
server.listen(port, host, () => console.log(`API DeudaFácil en http://${host}:${port}`));
