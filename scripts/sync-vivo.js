// Trae partidos en juego (IN_PLAY/PAUSED) desde football-data.org y escribe SOLO el nodo enVivo.
//
// Que hace en cada corrida:
//  1. Consulta la API de football-data.org con status=LIVE (o usa --fixture para test offline).
//  2. Filtra solo partidos IN_PLAY o PAUSED y los mapea a los pids del prode (partidos-map.json).
//  3. Escribe SOLO el nodo enVivo (null si no hay partidos en juego).
//     NUNCA lee ni escribe admin/resultados ni ranking.
//
// Modos:
//  node scripts/sync-vivo.js                       una sola pasada (legacy)
//  node scripts/sync-vivo.js --loop <min> <seg>    consulta cada <seg> durante <min> minutos
//  node scripts/sync-vivo.js --dry-run             no escribe, imprime el enVivo calculado
//  node scripts/sync-vivo.js --fixture <a.json>    lee partidos de un archivo (test offline)
//
// El modo --loop existe porque los crons programados de GitHub Actions se disparan
// con mucho retraso (cada 1-2h en la practica), no cada 5 min. Un unico job que
// hace su propio loop interno da una cadencia real de ~30s sin depender del scheduler.
//
// Env:  FOOTBALL_DATA_TOKEN        token de football-data.org
//       FIREBASE_SERVICE_ACCOUNT   JSON de la cuenta de servicio (no requerido en dry-run/fixture)

const fs = require('fs');
const path = require('path');
const { apiToPid } = JSON.parse(fs.readFileSync(path.join(__dirname, 'partidos-map.json'), 'utf8'));

const LIVE = new Set(['IN_PLAY', 'PAUSED']);

function buildEnVivo(matches, apiToPid) {
  const out = {};
  for (const m of matches) {
    if (!LIVE.has(m.status)) continue;
    const pid = apiToPid[String(m.id)];
    if (!pid) continue;
    const ft = m.score && m.score.fullTime;
    out[pid] = {
      l: ft && ft.home != null ? ft.home : 0,
      v: ft && ft.away != null ? ft.away : 0,
      minuto: m.minute != null ? m.minute : null,
      estado: m.status,
      ts: Date.now(),
    };
  }
  return Object.keys(out).length ? out : null;
}

// Firma del contenido SIN el ts: para no reescribir (ni repintar el cliente)
// cuando el marcador/minuto/estado no cambiaron entre consultas.
function sigOf(enVivo) {
  if (!enVivo) return 'null';
  const limpio = {};
  for (const pid of Object.keys(enVivo).sort()) {
    const e = enVivo[pid];
    limpio[pid] = { l: e.l, v: e.v, minuto: e.minuto, estado: e.estado };
  }
  return JSON.stringify(limpio);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const DRY = process.argv.includes('--dry-run');
const DATABASE_URL = 'https://prode-ba-arena-default-rtdb.firebaseio.com';
const FIN_TORNEO = new Date('2026-07-21T00:00:00Z');
const fixtureIdx = process.argv.indexOf('--fixture');
const loopIdx = process.argv.indexOf('--loop');

async function getMatches() {
  if (fixtureIdx !== -1) {
    return JSON.parse(fs.readFileSync(process.argv[fixtureIdx + 1], 'utf8')).matches;
  }
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return null; // sin token: no hacemos nada
  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches?status=LIVE',
    { headers: { 'X-Auth-Token': token } });
  if (!res.ok) { console.error('Error de API:', res.status, await res.text()); process.exit(1); }
  return (await res.json()).matches;
}

function initDb() {
  const admin = require('firebase-admin');
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    databaseURL: DATABASE_URL,
  });
  return admin.database();
}

// Una pasada: consulta la API y escribe enVivo si cambio. Devuelve la firma escrita.
async function tick(db, lastSig) {
  const matches = await getMatches();
  if (matches == null) { console.log('FOOTBALL_DATA_TOKEN no configurado: nada que hacer.'); return lastSig; }
  const enVivo = buildEnVivo(matches, apiToPid);
  const sig = sigOf(enVivo);
  const n = enVivo ? Object.keys(enVivo).length : 0;
  if (sig === lastSig) {
    console.log(new Date().toISOString() + '  sin cambios (' + n + ' en juego)');
    return lastSig;
  }
  console.log(new Date().toISOString() + '  ' +
    (n ? (n + ' en juego: ' + Object.keys(enVivo).join(', ')) : 'sin partidos en juego') + ' -> escribo');
  await db.ref('enVivo').set(enVivo);
  return sig;
}

async function main() {
  if (new Date() > FIN_TORNEO) { console.log('Torneo terminado, nada que hacer.'); return; }

  // ── Modo LOOP: una sola corrida que consulta cada <seg> durante <min> minutos ──
  if (loopIdx !== -1) {
    const durMin = parseFloat(process.argv[loopIdx + 1]) || 20;
    const intSec = parseFloat(process.argv[loopIdx + 2]) || 30;
    if (!process.env.FOOTBALL_DATA_TOKEN || !process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log('Faltan FOOTBALL_DATA_TOKEN o FIREBASE_SERVICE_ACCOUNT: nada que hacer.');
      return;
    }
    console.log('LOOP: cada ' + intSec + 's durante ' + durMin + ' min.');
    const db = initDb();
    const fin = Date.now() + durMin * 60 * 1000;
    let lastSig = null; // null fuerza la primera escritura
    while (Date.now() < fin) {
      if (new Date() > FIN_TORNEO) break;
      try { lastSig = await tick(db, lastSig); }
      catch (e) { console.error('tick error:', e.message); }
      if (Date.now() + intSec * 1000 < fin) await sleep(intSec * 1000); else break;
    }
    console.log('LOOP terminado.');
    return;
  }

  // ── Modo legacy: una sola pasada ──
  const matches = await getMatches();
  if (matches == null) { console.log('FOOTBALL_DATA_TOKEN no configurado: nada que hacer todavia.'); return; }

  const enVivo = buildEnVivo(matches, apiToPid);
  const n = enVivo ? Object.keys(enVivo).length : 0;
  console.log(n ? (n + ' partido(s) en juego: ' + Object.keys(enVivo).join(', ')) : 'Sin partidos en juego.');

  let dry = DRY || fixtureIdx !== -1;
  if (!dry && !process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('FIREBASE_SERVICE_ACCOUNT no configurado: corro en modo informe (sin escribir).');
    dry = true;
  }
  if (dry) { console.log(enVivo ? JSON.stringify(enVivo, null, 1) : '(sin partidos en juego)'); return; }

  const db = initDb();
  await db.ref('enVivo').set(enVivo); // SOLO enVivo; jamás resultados/ranking
  console.log('enVivo actualizado.');
}

// firebase-admin deja el socket abierto: forzamos la salida en TODOS los caminos.
main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
