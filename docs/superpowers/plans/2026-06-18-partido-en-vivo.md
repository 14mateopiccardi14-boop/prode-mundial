# Partido en vivo en pantalla principal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en la pantalla principal del PRODE qué partido del Mundial se está jugando y su marcador, actualizándose solo, sin tocar el scoring ni romper el sync existente.

**Architecture:** Una pieza de backend nueva y aislada (`scripts/sync-vivo.js` + workflow propio) trae los partidos en juego desde football-data.org y los escribe en un nodo Firebase nuevo `enVivo`, totalmente separado de `admin/resultados` y `ranking`. El frontend se suscribe a `enVivo` con `onValue` y renderiza una tarjeta arriba de todo; si no hay partidos en juego, la pantalla queda idéntica a hoy.

**Tech Stack:** Node 20 (sin dependencias salvo `firebase-admin`, igual que el sync actual), Firebase RTDB (plan Spark gratuito), GitHub Actions, HTML/CSS/JS vanilla en un único `index.html`.

## Global Constraints

- **Aislamiento del scoring (verbatim del spec):** todo lo nuevo nunca toca `admin/resultados` ni `ranking`. El sync existente (`scripts/sync-resultados.js`, `.github/workflows/sync-resultados.yml`) NO se modifica.
- **Firebase plan gratuito (Spark):** sin Cloud Functions; la escritura la hace el service account desde GitHub Actions.
- **Guardas del backend (igual que `sync-resultados.js`):** sin `FOOTBALL_DATA_TOKEN` → no hace nada y sale en verde; sin `FIREBASE_SERVICE_ACCOUNT` → modo informe sin escribir; después de `FIN_TORNEO` (`2026-07-21T00:00:00Z`) → no hace nada; `--dry-run` no escribe.
- **DATABASE_URL:** `https://prode-ba-arena-default-rtdb.firebaseio.com`.
- **Mapeo de ids:** `scripts/partidos-map.json` exporta `apiToPid` (api-id → pid) y `en2es`.
- **Emails admin (read rules):** `auth.token.email.endsWith('@movistararena.com.ar')`.
- **No prometer marcador segundo a segundo:** la UI etiqueta el retraso.

---

### Task 1: Script aislado `scripts/sync-vivo.js`

Trae partidos en juego y escribe SOLO el nodo `enVivo`. Sin token/sin service account/torneo terminado → no escribe. Soporta `--dry-run` y, para test offline determinista, `--fixture <archivo.json>` (usa ese JSON en vez de llamar a la API).

**Files:**
- Create: `scripts/sync-vivo.js`
- Create (test fixture): `scripts/vivo.fixture.json`

**Interfaces:**
- Consumes: `scripts/partidos-map.json` → `{ apiToPid }`.
- Produces: nodo Firebase `enVivo/<pid> = { l:number, v:number, minuto:number|null, estado:"IN_PLAY"|"PAUSED", ts:number }`. Cuando no hay partidos en juego, escribe `null` en `enVivo` (auto-limpieza).
- Función pura exportada para test: `buildEnVivo(matches, apiToPid)` → devuelve el objeto `enVivo` (o `null` si vacío).

- [ ] **Step 1: Crear el fixture de test offline**

Create `scripts/vivo.fixture.json` (dos partidos en juego: uno IN_PLAY, uno PAUSED, más uno FINISHED que debe ignorarse). Los ids deben existir en `partidos-map.json` como pids "0", "1", "2":

```json
{
  "matches": [
    {
      "id": 537327,
      "status": "IN_PLAY",
      "minute": 67,
      "homeTeam": { "name": "Mexico" },
      "awayTeam": { "name": "South Africa" },
      "score": { "fullTime": { "home": 1, "away": 0 } }
    },
    {
      "id": 537328,
      "status": "PAUSED",
      "minute": 45,
      "homeTeam": { "name": "Korea Republic" },
      "awayTeam": { "name": "Czechia" },
      "score": { "fullTime": { "home": 0, "away": 0 } }
    },
    {
      "id": 537329,
      "status": "FINISHED",
      "minute": 90,
      "homeTeam": { "name": "Czechia" },
      "awayTeam": { "name": "South Africa" },
      "score": { "fullTime": { "home": 2, "away": 1 } }
    }
  ]
}
```

Confirmar que `537327`/`537328`/`537329` mapean a pids `0`/`1`/`2` en `scripts/partidos-map.json` (ver `apiToPid` al inicio del archivo). Si no, ajustar los ids del fixture a tres ids reales presentes en `apiToPid`.

- [ ] **Step 2: Escribir `buildEnVivo` + el harness de test inline (el "test")**

Como el repo no tiene framework de tests, el test es una invocación con fixture que imprime el resultado y debe fallar antes de implementar. Crear `scripts/sync-vivo.js` con SOLO la función y el wiring de fixture todavía sin definir `buildEnVivo`, para que la corrida falle:

```js
// scripts/sync-vivo.js — primer paso: harness que todavía falla
const fs = require('fs');
const path = require('path');
const { apiToPid } = JSON.parse(fs.readFileSync(path.join(__dirname, 'partidos-map.json'), 'utf8'));

const fixtureIdx = process.argv.indexOf('--fixture');
if (fixtureIdx !== -1) {
  const { matches } = JSON.parse(fs.readFileSync(process.argv[fixtureIdx + 1], 'utf8'));
  console.log(JSON.stringify(buildEnVivo(matches, apiToPid), null, 1));
  process.exit(0);
}
```

- [ ] **Step 3: Correr el test para ver que falla**

Run: `node scripts/sync-vivo.js --fixture scripts/vivo.fixture.json`
Expected: FALLA con `ReferenceError: buildEnVivo is not defined`.

- [ ] **Step 4: Implementar `buildEnVivo` (mínimo para pasar)**

Agregar en `scripts/sync-vivo.js`, antes del bloque `--fixture`:

```js
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
```

- [ ] **Step 5: Correr el test para ver que pasa**

Run: `node scripts/sync-vivo.js --fixture scripts/vivo.fixture.json`
Expected: imprime un objeto con claves `"0"` y `"1"` (IN_PLAY y PAUSED), SIN `"2"` (FINISHED ignorado). Cada entrada con `l`, `v`, `minuto`, `estado`, `ts`.

- [ ] **Step 6: Implementar el `main()` real (API + escritura aislada)**

Agregar el resto de `scripts/sync-vivo.js` (debajo de `buildEnVivo`, reemplazando/ampliando el bloque `--fixture`). Copia las guardas de `sync-resultados.js`:

```js
const DRY = process.argv.includes('--dry-run');
const DATABASE_URL = 'https://prode-ba-arena-default-rtdb.firebaseio.com';
const FIN_TORNEO = new Date('2026-07-21T00:00:00Z');

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
```

Y reemplazar el bloque `--fixture` del Step 2 por el cierre del archivo:

```js
main().catch(err => { console.error(err); process.exit(1); });
```

(El soporte `--fixture` queda dentro de `getMatches()`, que ya lee el archivo cuando `fixtureIdx !== -1`. Eliminar el bloque `--fixture` standalone del Step 2 para no duplicar.)

- [ ] **Step 7: Verificar el flujo completo con fixture (no escribe)**

Run: `node scripts/sync-vivo.js --fixture scripts/vivo.fixture.json`
Expected: imprime "2 partido(s) en juego: 0, 1" y el JSON; NO intenta conectar a Firebase.

- [ ] **Step 8: Verificar el caso sin token (no-op en verde)**

Run (PowerShell): `node scripts/sync-vivo.js`
Expected: imprime "FOOTBALL_DATA_TOKEN no configurado: nada que hacer todavia." y termina con éxito (exit 0).

- [ ] **Step 9: Commit**

```bash
git add scripts/sync-vivo.js scripts/vivo.fixture.json
git commit -m "feat: script aislado sync-vivo (escribe nodo enVivo, no toca scoring)"
```

---

### Task 2: Permiso de lectura de `enVivo` en las rules

**Files:**
- Modify: `database.rules.json` (agregar bloque `enVivo` dentro de `rules`)

**Interfaces:**
- Consumes: nada.
- Produces: lectura de `enVivo` habilitada para usuarios logueados del dominio. La escritura la hace el service account (admin SDK saltea rules), así que no se define `.write`.

- [ ] **Step 1: Agregar el bloque `enVivo`**

En `database.rules.json`, después del bloque `"ranking": { ... }` (cierra en su `}` antes de `"usuarios"`), agregar una nueva clave hermana. No tocar ninguna regla existente:

```json
    "enVivo": {
      ".read": "auth != null && auth.token.email.endsWith('@movistararena.com.ar')"
    },
```

- [ ] **Step 2: Validar que el JSON sigue siendo válido**

Run (PowerShell): `node -e "JSON.parse(require('fs').readFileSync('database.rules.json','utf8')); console.log('rules JSON OK')"`
Expected: imprime `rules JSON OK`.

- [ ] **Step 3: Verificar que las reglas blindadas no cambiaron**

Run: `git diff database.rules.json`
Expected: el diff solo AGREGA el bloque `enVivo` (líneas con `+`), sin modificar `pronos`, `ranking`, `bonus`, `deadlines`, `usuarios`.

- [ ] **Step 4: Desplegar las rules**

Run: `firebase deploy --only database`
Expected: `Deploy complete!`. (Si pide cuenta, usar la cuenta del proyecto original como en despliegues previos.)

- [ ] **Step 5: Commit**

```bash
git add database.rules.json
git commit -m "feat: permitir lectura del nodo enVivo a usuarios logueados"
```

---

### Task 3: Workflow propio `sync-vivo.yml`

**Files:**
- Create: `.github/workflows/sync-vivo.yml`

**Interfaces:**
- Consumes: secrets `FOOTBALL_DATA_TOKEN` y `FIREBASE_SERVICE_ACCOUNT` (ya existen en el repo).
- Produces: corridas periódicas de `scripts/sync-vivo.js` cada 5 min en ventana de partidos.

- [ ] **Step 1: Crear el workflow (mismas franjas horarias que el sync actual, cada 5 min)**

Create `.github/workflows/sync-vivo.yml`:

```yaml
name: Sync partidos en vivo

on:
  schedule:
    # Misma ventana que sync-resultados (12:00-03:30 ART), pero cada 5 min
    - cron: '*/5 15-23 * * *'
    - cron: '*/5 0-6 * * *'
  workflow_dispatch:

jobs:
  vivo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install --no-save --no-audit --no-fund firebase-admin
      - run: node scripts/sync-vivo.js
        env:
          FOOTBALL_DATA_TOKEN: ${{ secrets.FOOTBALL_DATA_TOKEN }}
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
```

- [ ] **Step 2: Validar YAML**

Run (PowerShell): `node -e "const y=require('fs').readFileSync('.github/workflows/sync-vivo.yml','utf8'); if(!y.includes('sync-vivo.js')||!y.includes('cron')) throw new Error('yaml incompleto'); console.log('yaml OK')"`
Expected: imprime `yaml OK`.

- [ ] **Step 3: Confirmar que el workflow existente NO cambió**

Run: `git status --porcelain .github/workflows/`
Expected: solo aparece `?? .github/workflows/sync-vivo.yml` (nuevo); `sync-resultados.yml` no figura como modificado.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/sync-vivo.yml
git commit -m "ci: workflow sync-vivo cada 5 min en ventana de partidos"
```

---

### Task 4: Tarjeta de vivo en el frontend

Contenedor nuevo arriba de la `nav`, suscripción `onValue('enVivo')`, render con nombres/banderas vía lookup por pid, y fallback "EN JUEGO" por ventana de kickoff. Sin framework de tests → verificación manual en navegador con un nodo de prueba.

**Files:**
- Modify: `index.html` (HTML del contenedor, CSS, JS de render y suscripción)

**Interfaces:**
- Consumes: `partidos` (array con `{id, local, visit, kickoff}`), `ELIM` + `getElimLocal(p)`/`getElimVisit(p)` para nombres de eliminatorias, `getFlag(name)`, `window._onValue`, `window._ref`, `window._db`, y el ciclo `actualizarCountdown()` (corre cada 1s).
- Produces: función global `renderVivo()` y estado `vivoData` (objeto leído de `enVivo`).

- [ ] **Step 1: Agregar el contenedor HTML arriba de la nav**

En `index.html`, justo después de `</div>` que cierra `#hero-countdown` (línea ~1363) y antes de `<nav class="nav">` (línea ~1364), insertar:

```html
<div id="vivo-container" style="display:none"></div>
```

- [ ] **Step 2: Agregar CSS reutilizando la paleta existente**

En el bloque `<style>`, junto a las reglas de `#hero-countdown` (línea ~947), agregar:

```css
#vivo-container{margin:12px auto 0;max-width:560px;padding:0 14px;display:flex;flex-direction:column;gap:8px}
.vivo-card{background:var(--gris1,#161616);border:1px solid var(--gris2,#2a2a2a);border-radius:14px;padding:12px 14px}
.vivo-top{display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;letter-spacing:.08em;color:#e23;text-transform:uppercase;margin-bottom:8px}
.vivo-dot{width:8px;height:8px;border-radius:50%;background:#e23;animation:vivoPulse 1.2s infinite}
@keyframes vivoPulse{0%,100%{opacity:1}50%{opacity:.3}}
.vivo-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
.vivo-team{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
.vivo-team.visit{justify-content:flex-end}
.vivo-team .nm{font-size:15px;font-weight:600;color:var(--blanco,#fff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vivo-score{font-size:22px;font-weight:800;color:var(--blanco,#fff);min-width:64px;text-align:center}
.vivo-min{font-size:11px;color:var(--gris3,#888);text-align:center;margin-top:6px}
.vivo-nota{font-size:10px;color:var(--gris3,#888);text-align:center;margin-top:2px;opacity:.8}
```

(Si alguna variable CSS no existe con ese nombre, usar los valores hex de fallback ya incluidos.)

- [ ] **Step 3: Agregar el JS de lookup, render y visibilidad**

En el bloque `<script>`, después de la función `getFlag` (línea ~1724), agregar:

```js
let vivoData = {};
const VENTANA_JUEGO_MS = 2.5 * 60 * 60 * 1000; // ~duración de un partido para el fallback "EN JUEGO"

// Nombres del partido por pid (grupos directo; elim vía adminData.elimEquipos)
function vivoInfoDePid(pid){
  let p = partidos.find(x => x.id === pid);
  if (p) return { local: p.local, visit: p.visit, kickoff: p.kickoff };
  p = (typeof ELIM !== 'undefined') ? ELIM.find(x => x.id === pid) : null;
  if (p) return { local: getElimLocal(p), visit: getElimVisit(p), kickoff: p.kickoff };
  return null;
}

// pids en ventana de juego según el horario (fallback sin marcador)
function pidsEnVentana(){
  const ahora = new Date();
  const res = [];
  const todos = partidos.concat(typeof ELIM !== 'undefined' ? ELIM : []);
  for (const p of todos){
    if (!(p.kickoff instanceof Date)) continue;
    const ini = p.kickoff.getTime();
    if (ahora.getTime() >= ini && ahora.getTime() <= ini + VENTANA_JUEGO_MS) res.push(p.id);
  }
  return res;
}

function renderVivo(){
  const cont = document.getElementById('vivo-container');
  if (!cont) return;
  // Unir pids con marcador en vivo + pids en ventana (fallback), sin duplicar
  const pids = Array.from(new Set(Object.keys(vivoData || {}).concat(pidsEnVentana())));
  const cards = [];
  for (const pid of pids){
    const info = vivoInfoDePid(pid);
    if (!info) continue;
    const live = (vivoData || {})[pid];
    const score = live ? (live.l + ' - ' + live.v) : 'vs';
    const min = live
      ? (live.estado === 'PAUSED' ? 'Entretiempo' : (live.minuto != null ? live.minuto + "'" : 'En juego'))
      : 'En juego';
    cards.push(
      '<div class="vivo-card">' +
        '<div class="vivo-top"><span class="vivo-dot"></span>En vivo</div>' +
        '<div class="vivo-row">' +
          '<div class="vivo-team"><span>' + getFlag(info.local) + '</span><span class="nm">' + escapeHtml(info.local) + '</span></div>' +
          '<div class="vivo-score">' + escapeHtml(score) + '</div>' +
          '<div class="vivo-team visit"><span class="nm">' + escapeHtml(info.visit) + '</span><span>' + getFlag(info.visit) + '</span></div>' +
        '</div>' +
        '<div class="vivo-min">' + escapeHtml(min) + '</div>' +
        (live ? '<div class="vivo-nota">el marcador puede demorar unos minutos</div>' : '') +
      '</div>'
    );
  }
  cont.innerHTML = cards.join('');
  cont.style.display = cards.length ? 'flex' : 'none';
}
```

- [ ] **Step 4: Suscribirse a `enVivo` en `cargarDatos()`**

En `cargarDatos()` (línea ~1771), después de la suscripción a `ranking` (línea ~1799), agregar:

```js
  window._onValue(window._ref(window._db,'enVivo'),snap=>{ vivoData=snap.val()||{}; renderVivo(); });
```

- [ ] **Step 5: Reevaluar el fallback de ventana en el tick existente**

Al final de `actualizarCountdown()` (justo antes de su `}` de cierre, línea ~3115), agregar:

```js
  renderVivo();
```

- [ ] **Step 6: Verificar que sin datos la pantalla queda igual**

Run (PowerShell): `firebase serve --only hosting` (o abrir `index.html` con login). Con el nodo `enVivo` inexistente/null y fuera de ventana de partidos:
Expected: el `#vivo-container` está en `display:none`; la pantalla principal se ve idéntica a hoy.

- [ ] **Step 7: Verificar la tarjeta con un marcador de prueba**

En la consola de Firebase (RTDB), crear manualmente `enVivo/0 = { l:1, v:0, minuto:67, estado:"IN_PLAY", ts:0 }`.
Expected: aparece la tarjeta arriba de la nav con banderas de México y Sudáfrica, "1 - 0", "67'" y la nota de retraso. Borrar el nodo → la tarjeta desaparece.

- [ ] **Step 8: Verificar el fallback "EN JUEGO" sin marcador**

Con `enVivo` vacío, si hay un partido cuyo `kickoff` cae dentro de las últimas 2.5h (o ajustar temporalmente un `kickoff` de prueba en `GRUPOS`):
Expected: la tarjeta aparece mostrando "vs" y "En juego", sin marcador ni nota de retraso. (Revertir cualquier cambio temporal de prueba.)

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "feat: tarjeta de partido en vivo en pantalla principal (lee nodo enVivo)"
```

---

## Notas de verificación final (post-implementación)

- Confirmar que `git diff` de toda la rama NO toca `scripts/sync-resultados.js`, `.github/workflows/sync-resultados.yml`, ni las reglas de scoring en `database.rules.json`.
- Confirmar que el frontend con `enVivo` null/vacío y sin partidos en ventana deja la pantalla idéntica a la actual.
- (Opcional, en día de partido) Disparar el workflow a mano (`workflow_dispatch`) y verificar que aparece el marcador en la app.
