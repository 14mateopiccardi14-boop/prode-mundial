// Chequea que TODOS los partidos tengan un deadline cargado.
//
// Por que importa: en database.rules.json un pronostico solo se bloquea si
//   now < deadlines/$pid. Si un partido NO tiene deadline, la condicion
//   !deadlines.child($pid).exists() deja editar ese pronostico en cualquier
//   momento (incluso despues de jugado). Este script encuentra esos huecos.
//
// Uso:  node scripts/check-deadlines.js
// Env:  FIREBASE_SERVICE_ACCOUNT   JSON de la cuenta de servicio
// Sin esa env (o con --dry-run) lee scripts/deadlines.tmp.json y
//   scripts/admin.tmp.json si existen, y no se conecta a nada.
//
// Salida: lista de partidos sin deadline. Marca CRITICO los que ya tienen
//   resultado cargado (jugados pero todavia editables). Exit 1 si hay criticos.

const fs = require('fs');
const path = require('path');

const { apiToPid } = JSON.parse(fs.readFileSync(path.join(__dirname, 'partidos-map.json'), 'utf8'));
const DRY = process.argv.includes('--dry-run');
const DATABASE_URL = 'https://prode-ba-arena-default-rtdb.firebaseio.com';

// Todos los pids validos del torneo = los destinos del mapa de la API.
const TODOS_LOS_PIDS = Object.values(apiToPid);

function leerTmp(nombre) {
  const f = path.join(__dirname, nombre + '.tmp.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

async function main() {
  let dry = DRY;
  if (!dry && !process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('FIREBASE_SERVICE_ACCOUNT no configurado: leo de scripts/*.tmp.json.');
    dry = true;
  }

  let deadlines, adminData;
  if (dry) {
    deadlines = leerTmp('deadlines') || {};
    adminData = leerTmp('admin') || {};
    console.log('== DRY RUN (sin conexion) ==');
  } else {
    const admin = require('firebase-admin');
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
      databaseURL: DATABASE_URL,
    });
    const db = admin.database();
    [deadlines, adminData] = (await Promise.all(
      ['deadlines', 'admin'].map(p => db.ref(p).get())
    )).map(s => s.val() || {});
  }

  const resultados = adminData.resultados || {};
  const ahora = Date.now();

  const sinDeadline = [];   // partido sin deadline
  const criticos = [];      // sin deadline Y con resultado ya cargado
  let conDeadline = 0, vencidos = 0, futuros = 0;

  for (const pid of TODOS_LOS_PIDS) {
    const dl = deadlines[pid];
    if (dl == null || typeof dl !== 'number') {
      const tieneResultado = resultados[pid] && (resultados[pid].l != null || resultados[pid].v != null);
      sinDeadline.push(pid);
      if (tieneResultado) criticos.push(pid);
    } else {
      conDeadline++;
      if (dl < ahora) vencidos++; else futuros++;
    }
  }

  console.log('\nPartidos totales:   ' + TODOS_LOS_PIDS.length);
  console.log('Con deadline:       ' + conDeadline + '  (vencidos: ' + vencidos + ', futuros: ' + futuros + ')');
  console.log('SIN deadline:       ' + sinDeadline.length);

  if (sinDeadline.length) {
    console.log('\nPartidos editables en cualquier momento (sin deadline):');
    console.log('  ' + sinDeadline.join(', '));
  }
  if (criticos.length) {
    console.log('\n*** CRITICO: estos ya tienen resultado pero siguen editables ***');
    console.log('  ' + criticos.join(', '));
    console.log('Cargales un deadline en el pasado YA para frenarlos.');
  }
  if (!sinDeadline.length) {
    console.log('\nOK: todos los partidos tienen deadline. Nada editable a destiempo.');
  }

  if (!dry) process.exit(criticos.length ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
