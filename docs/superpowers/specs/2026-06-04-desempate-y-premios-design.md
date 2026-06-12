# Sistema de desempate + sección de premios

**Fecha:** 2026-06-04
**Contexto:** lanzamiento del PRODE Mundial 2026 para los 115 usuarios de Movistar Arena. Antes de lanzar, hay que: (1) definir cómo se rompen empates en puntos para que el orden del ranking sea determinístico, y (2) comunicar los premios dentro de la app.

## Objetivos

1. Garantizar que el ranking tenga un orden estricto, sin ambigüedades, incluso cuando varios usuarios empatan en puntos totales.
2. Mostrar los premios y aclarar que son gift cards de Casa del Audio, para que cada usuario sepa qué obtiene al alcanzar cada posición.

## No-objetivos

- No cambiar el cálculo de puntos (3/1 grupos, 4/2 elim, 9 campeón, 9 goleador).
- No agregar columnas nuevas en la tabla del ranking — ya está apretada en mobile.
- No agregar una pestaña dedicada a premios — se mostrarán en el panel de ayuda existente.
- No diseñar un sistema de desempate para los premios 4°–7° entre sí (los cuatro reciben lo mismo, $100k cada uno).

## Diseño de desempate

### Cascada de criterios

Orden estricto, evaluado en cascada hasta encontrar diferencia:

1. **Total de puntos** — `total` (criterio principal, ya existente).
2. **Puntos de bonus** — `ptsBonus` (campeón + goleador, ya en ranking).
3. **Cantidad de exactos** — `exactos` (nuevo campo, ya se calcula en `calcPuntos()` pero no se guarda).
4. **Timestamp de registro** — `tsRegistro` (nuevo campo, se setea **una sola vez** la primera vez que el usuario guarda su ranking y nunca cambia; menor gana). El campo existente `ts` se sobreescribe en cada update y no sirve para esto.

### Premios

| Posición | Premio |
|---|---|
| 1° | Gift card Casa del Audio $700.000 |
| 2° | Gift card Casa del Audio $500.000 |
| 3° | Gift card Casa del Audio $300.000 |
| 4° – 7° | Gift card Casa del Audio $100.000 (cada uno) |

## Cambios de implementación

### 1. `index.html` — `guardarRanking()` (~ línea 2082)

Agregar `exactos` y `tsRegistro` al objeto que se escribe en `ranking/uid`. La firma de la función pasa a recibir un solo objeto `r` (el resultado de `calcPuntos()`) para no acumular parámetros. `tsRegistro` se preserva del valor existente en `rankingData[uid]` (cargado por el listener); solo se setea con `Date.now()` la primera vez.

```js
function guardarRanking(r){
  const uid=uidKey();if(!uid||!currentUser)return;
  const existing = rankingData[uid] || {};
  const tsRegistro = existing.tsRegistro || Date.now();
  window._set(window._ref(window._db,'ranking/'+uid),{
    nombre:currentUser.displayName||'Sin nombre',
    foto:currentUser.photoURL||'',
    total:r.total, ptsGrupos:r.ptsGrupos, ptsElim:r.ptsElim, ptsBonus:r.ptsBonus,
    exactos:r.exactos,
    tsRegistro,
    ts:Date.now()
  });
}
```

Actualizar el caller en `recalc()` (~ línea 1837): `guardarRanking(r)` en vez de pasar los 4 parámetros.

### 2. `database.rules.json` — validar nuevo campo

Agregar dentro de `ranking/$uid`:

```json
"exactos":    { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 200" },
"tsRegistro": { ".validate": "newData.isNumber()" }
```

Máximo conservador para `exactos`: 190 partidos × 1 exacto cada uno = 190 posibles. 200 deja margen.

### 3. `index.html` — `renderRanking()` (~ línea 2089)

Reemplazar el comparador actual:

```js
const rows = Object.entries(rankingData).map(([uid,d]) => Object.assign({},d,{uid})).sort((a,b) => {
  if (b.total !== a.total) return (b.total||0) - (a.total||0);
  if ((b.ptsBonus||0) !== (a.ptsBonus||0)) return (b.ptsBonus||0) - (a.ptsBonus||0);
  if ((b.exactos||0) !== (a.exactos||0)) return (b.exactos||0) - (a.exactos||0);
  return (a.tsRegistro||a.ts||0) - (b.tsRegistro||b.ts||0); // menor = registró primero = gana
});
```

**Compatibilidad**: rankings escritos antes del deploy no tienen `exactos` ni `tsRegistro`. Se tratan como 0 / como el `ts` viejo respectivamente. Se autocorrigen en cuanto el usuario abre la app o el admin toca un resultado (el listener dispara `recalc()` → `guardarRanking()` con los campos nuevos).

### 4. `index.html` — panel de ayuda (~ línea 3095, dentro de `#ayuda-panel`)

Agregar dos secciones nuevas después de la sección "Sistema de puntos" y antes de "Tips":

#### Sección "Premios"

```html
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
```

#### Sección "Desempate"

```html
<div class="ayuda-seccion">
  <div class="ayuda-seccion-titulo">Desempate</div>
  <p class="ayuda-intro" style="margin-bottom:.5rem">Si dos personas empatan en puntos, el orden se resuelve en cascada:</p>
  <ul class="ayuda-pasos">
    <li><span class="ayuda-num">1</span><span>Más <strong style="color:#fff">puntos de bonus</strong> (campeón + goleador).</span></li>
    <li><span class="ayuda-num">2</span><span>Más <strong style="color:#fff">resultados exactos</strong> a lo largo del torneo.</span></li>
    <li><span class="ayuda-num">3</span><span>Quien <strong style="color:#fff">registró primero</strong> sus pronósticos.</span></li>
  </ul>
</div>
```

## Plan de deploy

1. Aplicar cambios en `index.html` y `database.rules.json`.
2. Deploy de las reglas a Firebase (con el nuevo campo `exactos` validado).
3. Deploy del HTML al hosting.
4. Smoke test: abrir la app, verificar que se ve la sección "Premios" y "Desempate" en el panel de ayuda, que el ranking sigue ordenado correctamente.
5. Lanzar.

## Comunicación a los usuarios

Una línea en el mensaje del lanzamiento:

> "Los premios y la regla de desempate están explicados en la app — tocá el botón **?** en la esquina inferior derecha."

## Riesgos

- **Reglas RTDB rechazan escrituras**: si el deploy de rules no incluye `exactos`, todas las escrituras del nuevo código serán rechazadas. **Mitigación**: deployar rules ANTES que HTML, o ambos en simultáneo.
- **Race condition de compatibilidad**: si un usuario tiene la app abierta con el código viejo durante el deploy, sus escrituras siguen sin `exactos`. Se autocorrige al siguiente recalc. Aceptable.
