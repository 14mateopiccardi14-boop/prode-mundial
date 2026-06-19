// Trae partidos en juego (IN_PLAY/PAUSED) desde football-data.org y escribe SOLO el nodo enVivo.
//
// Que hace en cada corrida:
//  1. Consulta la API de football-data.org con status=LIVE (o usa --fixture para test offline).
//  2. Filtra solo partidos IN_PLAY o PAUSED y los mapea a los pids del prode (partidos-map.json).
//  3. Escribe SOLO el nodo enVivo (null si no hay partidos en juego).
//     NUNCA lee ni escribe admin/resultados ni ranking.
//
// Uso:  node scripts/sync-vivo.js [--dry-run] [--fixture <archivo.json>]
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

const DRY = process.argv.includes('--dry-run');
const DATABASE_URL = 'https://prode-ba-arena-default-rtdb.firebaseio.com';
const FIN_TORNEO = new Date('2026-07-21T00:00:00Z');
const fixtureIdx = process.argv.indexOf('--fixture');

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

async function main() {
  if (new Date() > FIN_TORNEO) { console.log('Torneo terminado, nada que hacer.'); return; }
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
  if (dry) { console.log(JSON.stringify(enVivo, null, 1)); return; }

  const admin = require('firebase-admin');
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    databaseURL: DATABASE_URL,
  });
  await admin.database().ref('enVivo').set(enVivo); // SOLO enVivo; jamás resultados/ranking
  console.log('enVivo actualizado.');
  process.exit(0); // firebase-admin deja el socket abierto
}

main().catch(err => { console.error(err); process.exit(1); });
