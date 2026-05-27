# PRODE UI Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar la estética y claridad del PRODE agregando: chip de posición/puntos en el header, barra de estado debajo del nav, y rediseño de las cards de partidos al estilo sports (equipo/equipo apilados + deadline por partido).

**Architecture:** Todo el código vive en `index.html` (CSS + HTML + JS embebidos). Los cambios son quirúrgicos: nuevas clases CSS, dos nuevos elementos HTML, modificación de `renderFixture()`, y actualizaciones en `renderRanking()` y `recalc()`. No se toca ninguna lógica de Firebase, auth, ni la estructura de tabs.

**Tech Stack:** HTML5, CSS3 (custom properties), Vanilla JS, Firebase Realtime DB (ya configurado).

---

## Archivos

- Modificar: `index.html` — único archivo del proyecto
  - Sección `<style>` (~línea 10): agregar variables CSS y nuevas clases
  - Sección `<body>` header (~línea 1218): insertar `.hdr-rank` chip
  - Sección `<body>` nav (~línea 1252): insertar `#status-bar`
  - Función `renderFixture()` (~línea 1614): reemplazar generación de `.partido-row`
  - Función `renderRanking()` (~línea 1673): agregar actualización del chip de posición
  - Función `recalc()` (~línea 1601): agregar llamada a `renderStatusBar()`

---

## Task 1: Variables CSS y estilos base

**Files:**
- Modify: `index.html` — sección `<style>`, línea ~11 (`:root`) y al final del bloque de estilos (~línea 310)

- [ ] **Step 1: Agregar variables al `:root`**

Encontrar la línea que contiene `:root{--negro:` y agregar las variables nuevas al final del bloque:

```css
:root{--negro:#0A0A0A;--negro2:#1A1A1A;--negro3:#2A2A2A;--blanco:#FFFFFF;--gris1:#F5F5F5;--gris2:#E8E8E8;--gris3:#999999;--dorado:#C8A020;--dorado2:#F0C040;--rojo:#C0392B;--r:10px;--naranja:#d97706;--naranja-bg:#fffbeb;--naranja-border:#fde68a;--verde:#16a34a;--verde-bg:#f0fdf4;--verde-border:#bbf7d0}
```

- [ ] **Step 2: Agregar CSS del header rank chip**

Insertar después del bloque `.btn-logout:hover{...}` (línea ~56):

```css
.hdr-rank{display:flex;align-items:center;gap:7px;background:rgba(200,160,32,.1);border:1px solid rgba(200,160,32,.25);border-radius:8px;padding:4px 10px;flex-shrink:0}
.hdr-rank-pos{font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--dorado);line-height:1;letter-spacing:.03em}
.hdr-rank-info{display:flex;flex-direction:column;line-height:1.2}
.hdr-rank-pts{font-size:12px;font-weight:700;color:var(--blanco)}
.hdr-rank-lbl{font-size:9px;color:var(--gris3);letter-spacing:.06em;text-transform:uppercase}
@media(max-width:480px){.hdr-rank-info{display:none}}
```

- [ ] **Step 3: Agregar CSS del status bar**

Insertar después del CSS del `.hdr-rank` (paso anterior):

```css
#status-bar{background:var(--blanco);border-bottom:1px solid var(--gris2);padding:9px 1.25rem;display:flex;align-items:center;gap:0}
.sb-item{display:flex;align-items:center;gap:5px;padding:0 12px;border-right:1px solid var(--gris2)}
.sb-item:first-child{padding-left:0}
.sb-val{font-size:12px;font-weight:700;color:var(--negro)}
.sb-lbl{font-size:11px;color:var(--gris3)}
.sb-pill{margin-left:auto;font-size:10px;font-weight:700;font-family:'Bebas Neue',sans-serif;letter-spacing:.06em;background:var(--naranja-bg);color:var(--naranja);border:1px solid var(--naranja-border);padding:3px 10px;border-radius:20px;display:flex;align-items:center;gap:4px}
@media(max-width:480px){.sb-item:nth-child(2){display:none}.sb-pill{font-size:9px;padding:2px 8px}}
```

- [ ] **Step 4: Agregar CSS de match cards**

Insertar después del CSS del `#status-bar`:

```css
.match-card{background:var(--blanco);border:1px solid var(--gris2);border-radius:8px;margin-bottom:6px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.04);transition:box-shadow .15s}
.match-card:last-child{margin-bottom:0}
.match-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.08)}
.match-strip{height:3px;background:var(--gris2)}
.match-card.mc-saved .match-strip{background:var(--verde)}
.match-card.mc-pending .match-strip{background:var(--naranja)}
.match-body{display:grid;grid-template-columns:1fr auto;align-items:center;padding:9px 14px;gap:14px}
.match-teams{display:flex;flex-direction:column;gap:7px}
.match-team{display:flex;align-items:center;gap:8px}
.match-flag{font-size:16px;width:22px;text-align:center;flex-shrink:0;line-height:1}
.match-team-name{font-size:13px;font-weight:600;color:var(--negro);line-height:1}
.match-inputs{display:flex;flex-direction:column;gap:7px;align-items:center}
.match-inputs .score-in{width:42px;height:32px;padding:0;font-size:18px}
.match-inputs .score-in.mc-filled{border-color:var(--dorado);background:#FFFDF0}
.match-footer{display:flex;align-items:center;justify-content:space-between;padding:5px 14px 9px;border-top:1px solid var(--gris1)}
.match-deadline{display:flex;align-items:center;gap:5px;font-size:11px}
.match-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.match-dot.md-warn{background:var(--naranja)}
.match-dot.md-ok{background:var(--verde)}
.match-dot.md-off{background:var(--gris3)}
.match-dl-text{font-size:11px}
.match-dl-text.md-warn{color:var(--naranja);font-weight:600}
.match-dl-text.md-ok{color:var(--verde);font-weight:600}
.match-dl-text.md-off{color:var(--gris3)}
.match-pts{font-size:10px;color:var(--gris3)}
.match-pts span{color:var(--negro2);font-weight:600}
.match-chip-wrap{display:flex;align-items:center;gap:6px}
@media(max-width:480px){.match-inputs .score-in{width:36px;font-size:16px}.match-team-name{font-size:12px}.match-flag{font-size:14px;width:20px}}
```

- [ ] **Step 5: Ajustar padding del `.card` que contiene match-cards**

Insertar regla para que cuando una `.card` contiene `.match-card`, el padding lateral sea menor:

```css
.card:has(.match-card){padding:0.75rem 0.75rem}
```

- [ ] **Step 6: Verificar visualmente**

Abrir `index.html` en el navegador. Sin hacer login todavía, inspeccionar el DOM y confirmar que las nuevas variables CSS existen: en DevTools → Elements → `<html>` → computed, buscar `--naranja`. Deben aparecer las 6 variables nuevas.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "style: add CSS for rank chip, status bar, and match cards"
```

---

## Task 2: Header — chip de posición y puntos

**Files:**
- Modify: `index.html` — sección `<body>` header (~línea 1230) y función `renderRanking()` (~línea 1673)

- [ ] **Step 1: Insertar el chip en el HTML**

Localizar en el `<body>` la línea:
```html
<div class="pts-badge" id="hdr-pts">0 PTS</div>
```

Reemplazarla con:
```html
<div class="hdr-rank" id="hdr-rank" style="display:none">
  <div class="hdr-rank-pos" id="hdr-rank-pos">#–</div>
  <div class="hdr-rank-info">
    <span class="hdr-rank-pts" id="hdr-rank-pts-val">0 pts</span>
    <span class="hdr-rank-lbl">tu posición</span>
  </div>
</div>
<div class="pts-badge" id="hdr-pts" style="display:none">0 PTS</div>
```

> El `pts-badge` existente queda oculto (lo reemplaza el nuevo chip). El `display:none` inicial evita un flash de "#–" antes de tener datos.

- [ ] **Step 2: Actualizar `renderRanking()` para poblar el chip**

Localizar en `renderRanking()` la línea:
```js
const myUid=uidKey();
```

Justo después de esa línea, y antes del `tbody.innerHTML=''`, agregar:

```js
  // Actualizar chip de posición en el header
  const myPos = rows.findIndex(r => r.uid === myUid);
  const hdrRank = document.getElementById('hdr-rank');
  const hdrPos = document.getElementById('hdr-rank-pos');
  const hdrPts = document.getElementById('hdr-rank-pts-val');
  if (hdrRank && myPos !== -1) {
    hdrPos.textContent = '#' + (myPos + 1);
    hdrPts.textContent = (rows[myPos].total || 0) + ' pts';
    hdrRank.style.display = 'flex';
  }
```

- [ ] **Step 3: Verificar**

Abrir la app con login. Ir al tab Posiciones para que `renderRanking()` se ejecute. Confirmar que el chip dorado aparece en el header con `#N` y los puntos. En mobile (DevTools device toolbar), confirmar que solo se ve `#N` sin el sub-texto.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add rank position chip to header"
```

---

## Task 3: Barra de estado debajo del nav

**Files:**
- Modify: `index.html` — sección `<body>` (~línea 1252 después del `</nav>`) y nuevo JS después de `renderFixture()`

- [ ] **Step 1: Insertar el elemento HTML**

Localizar en `<body>` la línea `</nav>` (el cierre del nav con los botones de tabs).

Insertar inmediatamente después:

```html
<div id="status-bar" style="display:none">
  <div class="sb-item">
    <span class="sb-val" id="sb-completados">0/0</span>
    <span class="sb-lbl">completados</span>
  </div>
  <div class="sb-item">
    <span class="sb-val" id="sb-exactos">0</span>
    <span class="sb-lbl">exactos</span>
  </div>
  <span class="sb-pill" id="sb-pill" style="display:none">⚡ <span id="sb-pill-text"></span></span>
</div>
```

- [ ] **Step 2: Agregar la función `renderStatusBar()`**

Localizar la función `renderFixture()` y agregar la siguiente función ANTES de ella (línea ~1613):

```js
function renderStatusBar() {
  const bar = document.getElementById('status-bar');
  if (!bar) return;

  // Conteo de pronósticos completados
  const todos = [...partidos, ...ELIM];
  const total = todos.length;
  const completados = todos.filter(p => {
    const pr = misPronos[p.id];
    return pr && pr.l != null && pr.v != null;
  }).length;
  const elComp = document.getElementById('sb-completados');
  if (elComp) elComp.textContent = completados + '/' + total;

  // Exactos
  const exactos = document.getElementById('sb-exactos');
  if (exactos) {
    const r = calcPuntos();
    exactos.textContent = r.exactos;
  }

  // Pill: próximo cierre
  const pill = document.getElementById('sb-pill');
  const pillTxt = document.getElementById('sb-pill-text');
  const fa = getFaseActual();
  let deadlineStr = null;
  if (fa.estado === 'pre-torneo') {
    const t = diasRestantes(FASES[0].plazoProno);
    if (t) deadlineStr = 'Grupos cierra en ' + t;
  } else if (fa.estado === 'abierto' && fa.fase) {
    const t = diasRestantes(fa.fase.plazoProno);
    if (t) deadlineStr = fa.fase.nombre + ' cierra en ' + t;
  }
  if (pill && pillTxt) {
    if (deadlineStr) {
      pillTxt.textContent = deadlineStr;
      pill.style.display = 'flex';
    } else {
      pill.style.display = 'none';
    }
  }

  bar.style.display = 'flex';
}
```

- [ ] **Step 3: Llamar `renderStatusBar()` desde los lugares correctos**

a) Al final de `recalc()`, antes del cierre `}`:
```js
  renderStatusBar();
```

b) Al final de `renderFixture()`, antes del cierre `}`:
```js
  renderStatusBar();
```

c) Cuando se carga el ranking (listener de Firebase, línea ~1529, justo después de `renderRanking()`):
Localizar:
```js
window._onValue(window._ref(window._db,'ranking'),snap=>{rankingData=snap.val()||{};renderRanking();});
```
Reemplazar con:
```js
window._onValue(window._ref(window._db,'ranking'),snap=>{rankingData=snap.val()||{};renderRanking();renderStatusBar();});
```

- [ ] **Step 4: Verificar**

Abrir la app con login. La barra debe aparecer debajo del nav mostrando:
- `X/Y completados` (donde Y es la cantidad total de partidos)
- `N exactos`
- La pill naranja si el torneo aún no empezó o está en curso con pronósticos abiertos

Probar ingresar un pronóstico → el contador debe actualizarse en tiempo real.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add status bar with completion count and next deadline"
```

---

## Task 4: Mapa de banderas

**Files:**
- Modify: `index.html` — justo después de la definición de `ELIM` (~línea 1461)

- [ ] **Step 1: Agregar el mapa de banderas**

Insertar después del cierre `];` de `const ELIM`:

```js
const FLAGS = {
  'Argentina':'🇦🇷','Brasil':'🇧🇷','Francia':'🇫🇷','Alemania':'🇩🇪','España':'🇪🇸',
  'Inglaterra':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Portugal':'🇵🇹','Países Bajos':'🇳🇱','Bélgica':'🇧🇪','Uruguay':'🇺🇾',
  'México':'🇲🇽','EE.UU.':'🇺🇸','Canadá':'🇨🇦','Japón':'🇯🇵','Corea del Sur':'🇰🇷',
  'Marruecos':'🇲🇦','Senegal':'🇸🇳','Nigeria':'🇳🇬','Ghana':'🇬🇭','Costa de Marfil':'🇨🇮',
  'Egipto':'🇪🇬','Argelia':'🇩🇿','Camerún':'🇨🇲','Congo':'🇨🇩','Cabo Verde':'🇨🇻',
  'Australia':'🇦🇺','Nueva Zelanda':'🇳🇿','Arabia Saudita':'🇸🇦','Irán':'🇮🇷',
  'Qatar':'🇶🇦','Uzbekistán':'🇺🇿','Jordania':'🇯🇴',
  'Colombia':'🇨🇴','Ecuador':'🇪🇨','Paraguay':'🇵🇾','Bolivia':'🇧🇴','Chile':'🇨🇱','Perú':'🇵🇪','Venezuela':'🇻🇪',
  'Croacia':'🇭🇷','Polonia':'🇵🇱','Suiza':'🇨🇭','Suecia':'🇸🇪','Dinamarca':'🇩🇰','Austria':'🇦🇹',
  'Escocia':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','Rep. Checa':'🇨🇿','Turquía':'🇹🇷','Eslovenia':'🇸🇮','Bosnia':'🇧🇦','Curazao':'🇨🇼',
  'Sudáfrica':'🇿🇦','Haití':'🇭🇹','Túnez':'🇹🇳','Panamá':'🇵🇦'
};
function getFlag(name){ return FLAGS[name] || '🏳️'; }
```

- [ ] **Step 2: Verificar que `getFlag()` funciona**

Abrir DevTools Console y ejecutar:
```js
getFlag('Argentina') // → "🇦🇷"
getFlag('DesconocidoXYZ') // → "🏳️"
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add country flag emoji map"
```

---

## Task 5: Rediseño de `renderFixture()`

**Files:**
- Modify: `index.html` — función `renderFixture()` (~línea 1614–1652)

- [ ] **Step 1: Reemplazar la función completa**

Localizar el bloque completo de `renderFixture()` (desde `function renderFixture(){` hasta el `}` de cierre, ~líneas 1614-1652).

Reemplazarlo por:

```js
function renderFixture(){
  const cont=document.getElementById('fixture-container');cont.innerHTML='';

  // ── Helper: construye una match-card ──────────────────────────
  function buildMatchCard(p, localName, visitName, esElim) {
    const pr = misPronos[p.id] || {};
    const lVal = pr.l != null ? pr.l : '';
    const vVal = pr.v != null ? pr.v : '';
    const hasPron = lVal !== '' && vVal !== '';
    const mcClass = hasPron ? 'mc-saved' : 'mc-pending';
    const filledClass = hasPron ? 'mc-filled' : '';
    const ptsLabel = esElim
      ? 'Exacto <span>+4</span> · Ganador <span>+2</span>'
      : 'Exacto <span>+3</span> · Ganador <span>+1</span>';

    const card = document.createElement('div');
    card.className = 'match-card ' + mcClass;
    card.innerHTML =
      '<div class="match-strip"></div>' +
      '<div class="match-body">' +
        '<div class="match-teams">' +
          '<div class="match-team"><span class="match-flag">' + getFlag(localName) + '</span><span class="match-team-name">' + localName + '</span></div>' +
          '<div class="match-team"><span class="match-flag">' + getFlag(visitName) + '</span><span class="match-team-name">' + visitName + '</span></div>' +
        '</div>' +
        '<div class="match-inputs">' +
          '<input class="score-in ' + filledClass + '" type="number" min="0" max="20" value="' + lVal + '" placeholder="—" data-pid="' + p.id + '" data-side="l">' +
          '<input class="score-in ' + filledClass + '" type="number" min="0" max="20" value="' + vVal + '" placeholder="—" data-pid="' + p.id + '" data-side="v">' +
        '</div>' +
      '</div>' +
      '<div class="match-footer">' +
        '<div class="match-deadline">' +
          '<div class="match-dot md-warn" id="dot-' + p.id + '"></div>' +
          '<span class="match-dl-text md-warn" id="dl-' + p.id + '">Cierra en...</span>' +
        '</div>' +
        '<div class="match-chip-wrap">' +
          '<div class="match-pts">' + ptsLabel + '</div>' +
          '<div class="chip c-pend" id="chip-' + p.id + '">?</div>' +
        '</div>' +
      '</div>';
    return card;
  }

  // ── Grupos ────────────────────────────────────────────────────
  const hg=document.createElement('div');hg.className='etapa-header';hg.textContent='FASE DE GRUPOS';cont.appendChild(hg);
  Object.keys(GRUPOS).forEach(g=>{
    const card=document.createElement('div');card.className='card';
    card.innerHTML='<div class="grupo-header"><div class="grupo-badge">G'+g+'</div><span style="font-size:13px;font-weight:600;color:var(--gris3)">Grupo '+g+'</span></div>';
    GRUPOS[g].forEach(([loc,vis])=>{
      const p=partidos.find(x=>x.grupo===g&&x.local===loc&&x.visit===vis);if(!p)return;
      card.appendChild(buildMatchCard(p, loc, vis, false));
    });
    cont.appendChild(card);
  });

  // ── Eliminatorias ─────────────────────────────────────────────
  const etapas=[...new Set(ELIM.map(p=>p.etapa))];
  etapas.forEach(etapa=>{
    const he=document.createElement('div');he.className='etapa-header';he.textContent=etapa.toUpperCase();cont.appendChild(he);
    const card=document.createElement('div');card.className='card';
    ELIM.filter(p=>p.etapa===etapa).forEach(p=>{
      card.appendChild(buildMatchCard(p, getElimLocal(p), getElimVisit(p), true));
    });
    cont.appendChild(card);
  });

  // ── Event listeners en todos los inputs ───────────────────────
  document.querySelectorAll('.score-in').forEach(inp=>{
    inp.addEventListener('change',function(){
      const pid=this.dataset.pid,side=this.dataset.side;
      if(!misPronos[pid])misPronos[pid]={};
      misPronos[pid][side]=this.value===''?null:parseInt(this.value);
      saveProno(pid,side,this.value);
      // Actualizar clase mc-saved/mc-pending y filled en los inputs del mismo partido
      const card=this.closest('.match-card');
      if(card){
        const pr=misPronos[pid]||{};
        const hasPron=pr.l!=null&&pr.v!=null;
        card.classList.toggle('mc-saved',hasPron);
        card.classList.toggle('mc-pending',!hasPron);
        card.querySelectorAll('.score-in').forEach(i=>{
          i.classList.toggle('mc-filled',hasPron);
        });
      }
      updateChip(pid);recalc();
    });
  });

  refreshChips();
  renderStatusBar();
}
```

- [ ] **Step 2: Actualizar los deadlines de los partidos**

Los textos `"Cierra en..."` del footer necesitan llenarse. Agregar la función `updateMatchDeadlines()` justo después de `renderFixture()`:

```js
function updateMatchDeadlines() {
  const fa = getFaseActual();
  let deadline = null;
  let urgente = false;

  if (fa.estado === 'pre-torneo') {
    deadline = FASES[0].plazoProno;
  } else if (fa.estado === 'abierto' && fa.fase) {
    deadline = fa.fase.plazoProno;
  }

  const todos = [...partidos, ...ELIM];
  todos.forEach(p => {
    const dot = document.getElementById('dot-' + p.id);
    const dl = document.getElementById('dl-' + p.id);
    if (!dot || !dl) return;
    if (!deadline) {
      dot.className = 'match-dot md-off';
      dl.className = 'match-dl-text md-off';
      dl.textContent = 'Cerrado';
      return;
    }
    const t = diasRestantes(deadline);
    if (!t) {
      dot.className = 'match-dot md-off';
      dl.className = 'match-dl-text md-off';
      dl.textContent = 'Cerrado';
      return;
    }
    // Urgente si queda menos de 2 horas
    const diff = deadline - new Date();
    urgente = diff < 2 * 60 * 60 * 1000;
    dot.className = 'match-dot ' + (urgente ? 'md-warn' : 'md-ok');
    dl.className = 'match-dl-text ' + (urgente ? 'md-warn' : 'md-ok');
    dl.textContent = 'Cierra en ' + t;
  });
}
```

- [ ] **Step 3: Llamar `updateMatchDeadlines()` al cargar y cada minuto**

Localizar en el código el bloque de countdown existente. Buscar donde se llama `setInterval` para el countdown (~línea 2150 aprox). Agregar dentro del mismo interval:

```js
updateMatchDeadlines();
```

Y también llamarla una vez al cargar, después de la primera llamada a `renderFixture()`:

```js
updateMatchDeadlines();
```

> Buscar la línea `renderFixture();recalc();` en el listener de pronos (~línea 1504) y agregar `updateMatchDeadlines();` después.

- [ ] **Step 4: Verificar**

Abrir la app con login. El tab Pronósticos debe mostrar:
- Grupos: cada partido con el equipo local arriba, visitante abajo, banderas, inputs apilados
- Footer de cada partido: "Cierra en Xd Yh" o "Cerrado"
- El chip `?` a la derecha (que ya existía, ahora en el footer)
- Al ingresar un resultado en ambos campos: la línea de color superior cambia a verde

- [ ] **Step 5: Verificar compatibilidad con `aplicarBloqueoFases()`**

En DevTools Console:
```js
aplicarBloqueoFases()
```
Debe ejecutarse sin errores. Los `.score-in` de grupos deben quedar bloqueados/desbloqueados correctamente según el admin config.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: redesign match cards to sports-style layout with per-match deadlines"
```

---

## Task 6: Ajuste del setInterval de countdown

**Files:**
- Modify: `index.html` — bloque `setInterval` del countdown (~línea 2150)

- [ ] **Step 1: Ubicar el setInterval del countdown**

Buscar el patrón `setInterval(` cerca de donde se actualiza `hero-dias`, `hero-horas`, `mini-tiempo`, etc.

- [ ] **Step 2: Agregar `updateMatchDeadlines()` dentro del intervalo**

Dentro del callback del `setInterval` existente, al final, agregar:

```js
updateMatchDeadlines();
renderStatusBar();
```

- [ ] **Step 3: Verificar**

Esperar ~65 segundos con la app abierta. Los textos "Cierra en..." y la pill del status bar deben actualizarse solos.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: update match deadlines and status bar every minute"
```

---

## Self-Review checklist

- [x] **Spec coverage:** Header chip (Task 2) ✓ · Status bar (Task 3) ✓ · Match cards (Task 5) ✓ · Variables CSS (Task 1) ✓ · Banderas (Task 4) ✓
- [x] **Placeholder scan:** Sin TBDs. Todos los pasos tienen código real.
- [x] **Type consistency:** `buildMatchCard()` usa `p.id` que coincide con lo que usa `updateChip(pid)`. `renderStatusBar()` llama a `calcPuntos()` que ya existe. `updateMatchDeadlines()` usa `FASES`, `getFaseActual()`, `diasRestantes()` — todas funciones existentes.
- [x] **Compatibilidad:** `.card` wrapper preservado para `aplicarBloqueoFases()`. `id="chip-{pid}"` preservado para `updateChip()`. `data-pid` y `data-side` preservados en inputs. Los wrappers de `renderFixture` (`_origRenderFixture`) agregan `card-anim` a `.card` — sigue funcionando.
