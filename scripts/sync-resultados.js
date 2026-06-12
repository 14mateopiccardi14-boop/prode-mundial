// Sincroniza resultados del Mundial 2026 desde football-data.org hacia Firebase RTDB.
//
// Que hace en cada corrida:
//  1. Trae los 104 partidos de la API y los traduce a los pids del prode (partidos-map.json).
//  2. Carga resultados de partidos FINISHED que el prode todavia no tiene.
//     (nunca pisa un resultado ya cargado: lo manual del admin siempre gana; si difiere, avisa en el log)
//  3. Completa los equipos de eliminatorias (admin/elimEquipos) cuando la API ya los conoce.
//  4. Recalcula el ranking de todos los participantes (misma logica que la app).
//
// Uso:  node scripts/sync-resultados.js [--dry-run]
// Env:  FOOTBALL_DATA_TOKEN        token de football-data.org
//       FIREBASE_SERVICE_ACCOUNT   JSON de la cuenta de servicio (no requerido en dry-run)
// En dry-run lee admin/usuarios/ranking de scripts/*.tmp.json si existen y no escribe nada.

const fs = require('fs');
const path = require('path');

const { apiToPid, en2es } = JSON.parse(fs.readFileSync(path.join(__dirname, 'partidos-map.json'), 'utf8'));
const DRY = process.argv.includes('--dry-run');
const DATABASE_URL = 'https://prode-ba-arena-default-rtdb.firebaseio.com';
const FIN_TORNEO = new Date('2026-07-21T00:00:00Z');

// Misma logica de puntos que calcPuntosDe() en index.html
const PTS = { grupoExacto: 3, grupoGanador: 1, elimExacto: 4, elimGanador: 2, bonus: 9 };
const norm = s => (s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function calcPuntosDe(pronos, bonus, resultados, campeonReal, goleadorReal) {
  let ptsGrupos = 0, ptsElim = 0, exactos = 0;
  for (const pid of Object.keys(resultados)) {
    const real = resultados[pid], pr = (pronos || {})[pid];
    if (!real || !pr) continue;
    const pL = parseInt(pr.l), pV = parseInt(pr.v), rL = parseInt(real.l), rV = parseInt(real.v);
    if ([pL, pV, rL, rV].some(isNaN)) continue;
    const esElim = String(pid).startsWith('e');
    if (pL === rL && pV === rV) { if (esElim) ptsElim += PTS.elimExacto; else ptsGrupos += PTS.grupoExacto; exactos++; }
    else if (Math.sign(pL - pV) === Math.sign(rL - rV)) { if (esElim) ptsElim += PTS.elimGanador; else ptsGrupos += PTS.grupoGanador; }
  }
  const ptsBonus =
    ((campeonReal && norm((bonus || {}).campeon) === norm(campeonReal)) ? PTS.bonus : 0) +
    ((goleadorReal && norm((bonus || {}).goleador) === norm(goleadorReal)) ? PTS.bonus : 0);
  return { total: ptsGrupos + ptsElim + ptsBonus, ptsGrupos, ptsElim, ptsBonus, exactos };
}

function leerTmp(nombre) {
  const f = path.join(__dirname, nombre + '.tmp.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

async function main() {
  if (new Date() > FIN_TORNEO) { console.log('Torneo terminado, nada que hacer.'); return; }
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) { console.error('Falta FOOTBALL_DATA_TOKEN'); process.exit(1); }

  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', { headers: { 'X-Auth-Token': token } });
  if (!res.ok) { console.error('Error de API:', res.status, await res.text()); process.exit(1); }
  const { matches } = await res.json();

  let dry = DRY;
  if (!dry && !process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('FIREBASE_SERVICE_ACCOUNT no configurado: corro en modo informe (sin escribir).');
    dry = true;
  }
  let db = null, adminData, usuarios, ranking;
  if (dry) {
    adminData = leerTmp('admin') || {};
    usuarios = leerTmp('usuarios') || {};
    ranking = leerTmp('ranking') || {};
    console.log('== DRY RUN (no se escribe nada) ==');
  } else {
    const admin = require('firebase-admin');
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
      databaseURL: DATABASE_URL,
    });
    db = admin.database();
    [adminData, usuarios, ranking] = (await Promise.all(
      ['admin', 'usuarios', 'ranking'].map(p => db.ref(p).get())
    )).map(s => s.val() || {});
  }

  const resultados = adminData.resultados || {};
  const elimEquipos = adminData.elimEquipos || {};
  const upd = {};

  for (const m of matches) {
    const pid = apiToPid[String(m.id)];
    if (!pid) continue;

    // Completar equipos de eliminatorias que el prode aun no tiene
    if (String(pid).startsWith('e') && m.homeTeam.name && m.awayTeam.name) {
      const eq = elimEquipos[pid] || {};
      const local = en2es[m.homeTeam.name], visit = en2es[m.awayTeam.name];
      if (!eq.local && !eq.visit && local && visit) {
        upd['admin/elimEquipos/' + pid + '/local'] = local;
        upd['admin/elimEquipos/' + pid + '/visit'] = visit;
        console.log('Equipos ' + pid + ': ' + local + ' vs ' + visit);
      }
    }

    if (m.status !== 'FINISHED') continue;
    const ft = m.score && m.score.fullTime;
    if (!ft || ft.home == null || ft.away == null) continue;
    // Con penales, fullTime es el resultado tras los 120 minutos (sin contar la tanda)
    const actual = resultados[pid] || {};
    if (actual.l == null && actual.v == null) {
      upd['admin/resultados/' + pid + '/l'] = ft.home;
      upd['admin/resultados/' + pid + '/v'] = ft.away;
      resultados[pid] = { l: ft.home, v: ft.away };
      console.log('Resultado ' + pid + ': ' + m.homeTeam.name + ' ' + ft.home + '-' + ft.away + ' ' + m.awayTeam.name +
        (m.score.duration !== 'REGULAR' ? ' (' + m.score.duration + ')' : ''));
    } else if (actual.l !== ft.home || actual.v !== ft.away) {
      console.log('AVISO ' + pid + ': el prode tiene ' + actual.l + '-' + actual.v +
        ' pero la API dice ' + ft.home + '-' + ft.away + ' (se respeta lo cargado a mano)');
    }
  }

  // Recalcular ranking con los resultados ya mergeados (solo campos de puntos, como la app)
  let cambiosRanking = 0;
  for (const uid of Object.keys(ranking)) {
    const u = usuarios[uid] || {};
    const r = calcPuntosDe(u.pronos, u.bonus, resultados, adminData.campeon, adminData.goleador);
    const e = ranking[uid];
    if (e.total === r.total && e.ptsGrupos === r.ptsGrupos && e.ptsElim === r.ptsElim &&
        e.ptsBonus === r.ptsBonus && e.exactos === r.exactos) continue;
    upd['ranking/' + uid + '/total'] = r.total;
    upd['ranking/' + uid + '/ptsGrupos'] = r.ptsGrupos;
    upd['ranking/' + uid + '/ptsElim'] = r.ptsElim;
    upd['ranking/' + uid + '/ptsBonus'] = r.ptsBonus;
    upd['ranking/' + uid + '/exactos'] = r.exactos;
    upd['ranking/' + uid + '/ts'] = Date.now();
    cambiosRanking++;
    console.log('Ranking ' + (e.nombre || uid) + ': ' + (e.total || 0) + ' -> ' + r.total + ' pts');
  }

  if (!Object.keys(upd).length) { console.log('Sin novedades.'); return; }
  console.log(Object.keys(upd).length + ' escrituras (' + cambiosRanking + ' entradas de ranking).');
  if (dry) { console.log(JSON.stringify(upd, null, 1)); return; }
  await db.ref().update(upd);
  console.log('Sincronizado OK.');
  process.exit(0); // firebase-admin deja el socket abierto
}

main().catch(err => { console.error(err); process.exit(1); });
