# Desempate + Premios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar sistema de desempate en cascada (total → ptsBonus → exactos → tsRegistro) y sección de premios + gift card en el panel de ayuda, antes del lanzamiento a 115 usuarios.

**Architecture:** App single-file HTML + Firebase RTDB. Sin tooling de tests automatizados — verificación es smoke test manual en navegador + inspección de RTDB en Firebase Console. Cambios surgical en 2 archivos: `database.rules.json` (validaciones nuevas) e `index.html` (escritura, sort, panel ayuda).

**Tech Stack:** HTML/JS vanilla, Firebase Realtime Database (Blaze plan), Firebase Auth (Google), DM Sans/Bebas Neue fonts.

**Pre-requisito:** Acceso a Firebase Console para `prode-ba-arena` con cuenta Movistar Arena (ya transferida).

---

### Task 1: Actualizar `database.rules.json` con validaciones para `exactos` y `tsRegistro`

**Files:**
- Modify: `database.rules.json:13-24` (sección `ranking/$uid`)

- [ ] **Step 1: Editar `database.rules.json`**

Reemplazar la sección `ranking/$uid` actual:

```json
"$uid": {
  ".write": "auth != null && (auth.uid === $uid || auth.token.email === 'mateopiccardi@movistararena.com.ar' || auth.token.email === 'federicosegovia@movistararena.com.ar')",
  ".validate": "newData.hasChildren(['nombre','total']) || !newData.exists()",
  "nombre":    { ".validate": "newData.isString() && newData.val().length <= 100" },
  "foto":      { ".validate": "newData.isString() && (newData.val() === '' || newData.val().beginsWith('https://'))" },
  "total":     { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 500" },
  "ptsGrupos": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 500" },
  "ptsElim":   { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 500" },
  "ptsBonus":  { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100" },
  "exactos":    { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 200" },
  "tsRegistro": { ".validate": "newData.isNumber()" },
  "ts":        { ".validate": "newData.isNumber()" },
  "$other":    { ".validate": false }
}
```

Los dos campos nuevos (`exactos`, `tsRegistro`) van **antes** de `ts` para mantener orden cronológico de cambios.

- [ ] **Step 2: Validar JSON con sintaxis**

Run: `node -e "JSON.parse(require('fs').readFileSync('database.rules.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Deploy de las reglas a Firebase**

Opción A — Firebase Console (manual, recomendado si no tenés Firebase CLI):
1. Abrir [Firebase Console → Realtime Database → Rules](https://console.firebase.google.com/project/prode-ba-arena/database/prode-ba-arena-default-rtdb/rules)
2. Pegar el contenido completo del archivo `database.rules.json`
3. Click "Publish"

Opción B — Firebase CLI (si ya está configurado):
```bash
firebase deploy --only database
```

- [ ] **Step 4: Verificar en consola que las reglas se publicaron**

En Firebase Console → Rules, debe figurar "Last published: 2026-06-04" (o la fecha actual) y los campos `exactos` + `tsRegistro` visibles.

- [ ] **Step 5: Commit**

```bash
git add database.rules.json
git commit -m "security: validar campos exactos y tsRegistro en ranking"
```

---

### Task 2: Modificar `guardarRanking()` para escribir `exactos` y `tsRegistro`

**Files:**
- Modify: `index.html:2082-2085` (función `guardarRanking`)
- Modify: `index.html:1837` (caller en `recalc()`)

- [ ] **Step 1: Reemplazar la función `guardarRanking`**

Buscar en `index.html`:

```js
function guardarRanking(total,ptsGrupos,ptsElim,ptsBonus){
  const uid=uidKey();if(!uid||!currentUser)return;
  window._set(window._ref(window._db,'ranking/'+uid),{nombre:currentUser.displayName||'Sin nombre',foto:currentUser.photoURL||'',total,ptsGrupos,ptsElim,ptsBonus,ts:Date.now()});
}
```

Reemplazar por:

```js
function guardarRanking(r){
  const uid=uidKey();if(!uid||!currentUser)return;
  const existing = rankingData[uid] || {};
  const tsRegistro = existing.tsRegistro || Date.now();
  window._set(window._ref(window._db,'ranking/'+uid),{
    nombre:currentUser.displayName||'Sin nombre',
    foto:currentUser.photoURL||'',
    total:r.total,
    ptsGrupos:r.ptsGrupos,
    ptsElim:r.ptsElim,
    ptsBonus:r.ptsBonus,
    exactos:r.exactos,
    tsRegistro,
    ts:Date.now()
  });
}
```

- [ ] **Step 2: Actualizar el caller en `recalc()`**

Buscar en `index.html` (línea ~1837):

```js
guardarRanking(r.total,r.ptsGrupos,r.ptsElim,r.ptsBonus);
```

Reemplazar por:

```js
guardarRanking(r);
```

- [ ] **Step 3: Verificación de sintaxis JS**

Run:
```bash
node -e "const fs=require('fs');const html=fs.readFileSync('index.html','utf8');const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);scripts.forEach((s,i)=>{if(s.trim().startsWith('import '))return;try{new Function(s);console.log(i+': OK')}catch(e){console.log(i+': '+e.message)}})"
```
Expected: `1: OK` (el bloque ES module se skipea, el bloque principal pasa)

- [ ] **Step 4: Smoke test en navegador**

1. `python -m http.server 8765` desde el directorio del proyecto.
2. Abrir `http://localhost:8765/index.html` y loguearte.
3. Abrir DevTools → Network tab → filter por "WebSocket" o por "google".
4. Cargar un pronóstico nuevo.
5. En Firebase Console → Realtime Database → Data → `ranking/<tu-uid>`, verificar que aparecen `exactos: <número>` y `tsRegistro: <timestamp>`.

Expected: ambos campos presentes; `tsRegistro` no cambia con sucesivos cambios de pronóstico (solo se setea una vez).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: persistir exactos y tsRegistro en ranking para desempate"
```

---

### Task 3: Reemplazar comparador de sort en `renderRanking()` con cascada

**Files:**
- Modify: `index.html:2089`

- [ ] **Step 1: Reemplazar el sort**

Buscar en `index.html` (línea ~2089):

```js
const rows=Object.entries(rankingData).map(([uid,d])=>Object.assign({},d,{uid})).sort((a,b)=>b.total-a.total);
```

Reemplazar por:

```js
const rows = Object.entries(rankingData).map(([uid,d]) => Object.assign({},d,{uid})).sort((a,b) => {
  if ((b.total||0) !== (a.total||0)) return (b.total||0) - (a.total||0);
  if ((b.ptsBonus||0) !== (a.ptsBonus||0)) return (b.ptsBonus||0) - (a.ptsBonus||0);
  if ((b.exactos||0) !== (a.exactos||0)) return (b.exactos||0) - (a.exactos||0);
  return (a.tsRegistro||a.ts||0) - (b.tsRegistro||b.ts||0);
});
```

- [ ] **Step 2: Verificación de sintaxis JS**

Run el mismo comando de Task 2 Step 3.
Expected: `1: OK`

- [ ] **Step 3: Smoke test del orden**

Sin manera de generar 2 usuarios con misma puntuación en local sin segunda cuenta, el test es por inspección:
1. Abrir `http://localhost:8765/index.html` y loguearte.
2. Cargar 1-2 pronósticos.
3. En la pestaña Ranking, debe seguir apareciendo correctamente tu fila.
4. Si tenés acceso a una segunda cuenta (Fede), abrir en incógnito y loguearse, verificar que el orden refleja correctamente quién tiene más puntos / bonus / exactos.

Expected: ranking se muestra ordenado; ningún error en console.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: cascada de desempate en ranking (bonus > exactos > tsRegistro)"
```

---

### Task 4: Agregar sección "Premios" en panel de ayuda

**Files:**
- Modify: `index.html:3124` (justo antes de la sección "Tips")

- [ ] **Step 1: Insertar bloque HTML de Premios**

Buscar en `index.html` (línea ~3124):

```html
  </div>
  <div class="ayuda-seccion">
    <div class="ayuda-seccion-titulo">Tips</div>
```

Reemplazar por:

```html
  </div>
  <div class="ayuda-seccion">
    <div class="ayuda-seccion-titulo">Premios</div>
    <table class="ayuda-pts-tabla">
      <tr><td>1°</td><td>Gift card Casa del Audio <strong style="color:#fff">$700.000</strong></td></tr>
      <tr><td>2°</td><td>Gift card Casa del Audio <strong style="color:#fff">$500.000</strong></td></tr>
      <tr><td>3°</td><td>Gift card Casa del Audio <strong style="color:#fff">$300.000</strong></td></tr>
      <tr><td>4°–7°</td><td>Gift card Casa del Audio <strong style="color:#fff">$100.000</strong> c/u</td></tr>
    </table>
    <div class="ayuda-tip" style="margin-top:.6rem">Todos los premios se entregan en formato gift card de Casa del Audio.</div>
  </div>
  <div class="ayuda-seccion">
    <div class="ayuda-seccion-titulo">Tips</div>
```

- [ ] **Step 2: Smoke test visual**

1. Refrescar `http://localhost:8765/index.html`.
2. Click en el botón flotante "?".
3. Verificar que aparece la sección "Premios" entre "Sistema de puntos" y "Tips".
4. Verificar que los 4 montos se ven correctamente y la línea de gift card también.
5. Probarlo en mobile (DevTools → device toolbar → iPhone) — la tabla debe seguir legible.

Expected: sección visible, montos en negrita blanca, sin desbordes.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: agregar seccion Premios en panel de ayuda"
```

---

### Task 5: Agregar sección "Desempate" en panel de ayuda

**Files:**
- Modify: `index.html` (justo después de la sección "Premios" creada en Task 4)

- [ ] **Step 1: Insertar bloque HTML de Desempate**

Buscar en `index.html` (el bloque agregado en Task 4):

```html
    <div class="ayuda-tip" style="margin-top:.6rem">Todos los premios se entregan en formato gift card de Casa del Audio.</div>
  </div>
  <div class="ayuda-seccion">
    <div class="ayuda-seccion-titulo">Tips</div>
```

Reemplazar por:

```html
    <div class="ayuda-tip" style="margin-top:.6rem">Todos los premios se entregan en formato gift card de Casa del Audio.</div>
  </div>
  <div class="ayuda-seccion">
    <div class="ayuda-seccion-titulo">Desempate</div>
    <p class="ayuda-intro" style="margin-bottom:.5rem">Si dos personas empatan en puntos, el orden se resuelve en cascada:</p>
    <ul class="ayuda-pasos">
      <li><span class="ayuda-num">1</span><span>Más <strong style="color:#fff">puntos de bonus</strong> (campeón + goleador).</span></li>
      <li><span class="ayuda-num">2</span><span>Más <strong style="color:#fff">resultados exactos</strong> a lo largo del torneo.</span></li>
      <li><span class="ayuda-num">3</span><span>Quien <strong style="color:#fff">registró primero</strong> sus pronósticos.</span></li>
    </ul>
  </div>
  <div class="ayuda-seccion">
    <div class="ayuda-seccion-titulo">Tips</div>
```

- [ ] **Step 2: Smoke test visual**

1. Refrescar `http://localhost:8765/index.html`.
2. Click en el botón flotante "?".
3. Verificar que aparece la sección "Desempate" entre "Premios" y "Tips".
4. Verificar que se ven los 3 criterios en orden, con números dorados y palabras clave en blanco.

Expected: sección visible, formato consistente con el resto del panel.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: agregar seccion Desempate en panel de ayuda"
```

---

### Task 6: Verificación end-to-end y deploy

**Files:** (sin cambios de código)

- [ ] **Step 1: Smoke test integral**

1. Refrescar `http://localhost:8765/index.html` con cache deshabilitada (DevTools → Network → Disable cache).
2. Loguearse.
3. Verificar:
   - Status bar muestra deadline del primer partido
   - Cargar 1 pronóstico → en RTDB Firebase Console, en `ranking/<tu-uid>`: `exactos` y `tsRegistro` presentes
   - Cargar bonus (campeón + goleador) → la fila propia en ranking se actualiza con ptsBonus correcto
   - Panel "?" → sección "Premios" visible con $700k/$500k/$300k/$100k + aclaración gift card
   - Panel "?" → sección "Desempate" visible con los 3 criterios en orden
   - Mobile view (DevTools): todo legible, sin overflows

- [ ] **Step 2: Confirmar que `tsRegistro` no se sobreescribe**

1. Anotar el valor de `tsRegistro` de tu uid en RTDB Console.
2. Cambiar varios pronósticos en distintos partidos.
3. Refrescar Firebase Console y verificar que `tsRegistro` mantiene el mismo valor mientras `ts` sí cambia.

Expected: `tsRegistro` constante, `ts` cambia con cada update.

- [ ] **Step 3: Deploy del HTML al hosting**

Esto depende de dónde está hosteada la app. Si es Firebase Hosting:

```bash
firebase deploy --only hosting
```

Si todavía no está hosteada en ningún lado, opciones:
- Firebase Hosting: `firebase init hosting` → seleccionar el directorio actual → deploy
- GitHub Pages, Vercel, Netlify, etc.

**Antes de hacer este step, confirmar con el usuario dónde se va a deployar.**

- [ ] **Step 4: Verificación post-deploy**

1. Abrir la URL pública con cache deshabilitada.
2. Repetir el smoke test del Step 1 contra la versión deployada.
3. Confirmar que las reglas de RTDB están actualizadas (Step 4 de Task 1 ya lo verificó, pero re-confirmar).

- [ ] **Step 5: Tag de release**

```bash
git tag v1.0.0-launch
git push origin master --tags
```

---

## Plan total

- **6 tasks**, ~30 minutos de trabajo total
- **2 archivos modificados**: `database.rules.json` (1 cambio), `index.html` (4 cambios)
- **5 commits** + 1 tag

## Riesgos durante implementación

- **Si el deploy de rules viene DESPUÉS del HTML**: las escrituras nuevas con `exactos`/`tsRegistro` van a fallar silenciosamente porque las reglas viejas tienen `$other: false`. **Mitigación**: ejecutar Task 1 (rules) ANTES de Task 2 (HTML) — el orden del plan ya lo garantiza.
- **Si el usuario ya tiene la app abierta durante deploy**: su código viejo no escribe los campos nuevos. Se autocorrige al refresh o al próximo recalc. Aceptable.
