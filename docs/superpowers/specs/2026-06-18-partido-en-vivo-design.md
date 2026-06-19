# Partido en vivo en la pantalla principal — Diseño

**Fecha:** 2026-06-18
**Estado:** aprobado, listo para plan de implementación

## Objetivo

Mostrar en la pantalla principal del PRODE qué partido del Mundial 2026 se está
jugando en ese momento y su marcador, actualizándose solo.

## Principio rector

**Aislamiento total del scoring.** Todo lo nuevo vive en piezas separadas que
nunca tocan `admin/resultados` ni `ranking`. Si el feed en vivo falla, se atrasa
o trae datos incorrectos, el prode (pronósticos, ranking, premios) queda intacto.

El sync que ya funciona (`scripts/sync-resultados.js` y su workflow
`.github/workflows/sync-resultados.yml`) **no se modifica**.

## Restricciones confirmadas

- **Firebase plan gratuito (Spark):** no se usan Cloud Functions ni nada que
  obligue al plan Blaze. La escritura del nodo en vivo la hace el service account
  **desde GitHub Actions** (no desde Firebase). El nodo es minúsculo.
- **No romper nada:** el flujo existente no se altera; lo nuevo es aditivo.
- **Plan gratuito de football-data.org:** el marcador viene con retraso (no es
  minuto a minuto; eso requeriría el plan pago ~€12/mes). Sumado a la latencia del
  cron de GitHub Actions, el marcador puede ir varios minutos atrás. Se etiqueta
  honestamente en la UI. El diseño queda listo para enchufar el plan pago después
  sin cambiar el frontend.

## Componentes

### 1. Nodo Firebase nuevo: `enVivo`

Mapa keyed por `pid` (mismos pids que `partidos-map.json` / `admin/resultados`):

```
enVivo/<pid> = {
  l:      <number>,   // goles local
  v:      <number>,   // goles visitante
  minuto: <number>,   // minuto de juego (puede faltar)
  estado: "IN_PLAY" | "PAUSED",
  ts:     <number>    // timestamp de la última actualización
}
```

- Separado de `admin/resultados`. No interviene en ningún cálculo de puntos.
- En cada corrida se **sobrescribe el nodo completo** con el set de partidos en
  juego. Auto-limpieza: cuando no hay partidos `LIVE`, queda vacío/null.

### 2. Script nuevo `scripts/sync-vivo.js`

No toca `sync-resultados.js`. Comparte estilo y guardas con él.

- Pide a football-data.org solo los partidos en juego:
  `GET /v4/competitions/WC/matches?status=LIVE` (LIVE = IN_PLAY + PAUSED).
- Mapea `api-id → pid` con `scripts/partidos-map.json` (ya existe).
- Arma el mapa `enVivo` y hace `db.ref('enVivo').set(mapa)` (o `null` si está vacío).
- **Solo escribe en `enVivo`.** Nunca toca `admin/resultados` ni `ranking`.
- Mismas guardas que el script actual:
  - Sin `FOOTBALL_DATA_TOKEN` → no hace nada (sale en verde).
  - Sin `FIREBASE_SERVICE_ACCOUNT` → modo informe (no escribe).
  - Después de `FIN_TORNEO` → no hace nada.
  - `--dry-run` muestra qué escribiría sin tocar Firebase.

### 3. Workflow nuevo `.github/workflows/sync-vivo.yml`

Separado del workflow que funciona.

- Cron cada 5 minutos dentro de la ventana de partidos (mismas franjas horarias
  que `sync-resultados.yml`). Caveat: el cron de GitHub Actions puede demorarse.
- Corre `node scripts/sync-vivo.js` con los secrets `FOOTBALL_DATA_TOKEN` y
  `FIREBASE_SERVICE_ACCOUNT` (los mismos que ya existen).
- Uso de API: ~1 llamada cada 5 min, muy por debajo del límite de 10/min del free.

### 4. Frontend: tarjeta de vivo en `index.html`

Retoque acotado, sin tocar la lógica de scoring/ranking.

- Nuevo contenedor `<div id="vivo-container">` ubicado **arriba de todo**: después
  del `</header>` / `hero-countdown` y antes de la `<nav>`. Visible en cualquier
  pestaña.
- Suscripción `onValue('enVivo')` → la tarjeta se actualiza en tiempo real cuando
  cambia el nodo.
- Por cada `pid` presente: busca el partido con
  `partidos.find(x=>x.id===pid) || ELIM.find(x=>x.id===pid)` (patrón ya usado en
  `saveProno`, index.html:1804) para obtener nombres, banderas y kickoff, y
  renderiza marcador + estado + minuto.
- **Fallback sin marcador:** si un partido está en ventana de juego
  (`kickoff <= ahora <= kickoff + ~2.5h`) pero `enVivo` todavía no lo trae, la
  tarjeta igual aparece con "EN JUEGO" y sin marcador. Evita estados raros.
- Regla de visibilidad del contenedor: visible si hay al menos una entrada en
  `enVivo` **o** al menos un partido en ventana de juego; si no, `display:none` y
  la pantalla queda **exactamente como hoy**.
- La reevaluación de la ventana de juego se engancha en el `actualizarCountdown`
  existente (corre cada 1s, index.html:3117).
- Estilo: reutiliza clases/paleta de las cards actuales. Etiqueta visible del tipo
  "el marcador puede demorar unos minutos".

### 5. `database.rules.json`

Agregar **solo** lectura de `enVivo` para usuarios logueados, siguiendo el patrón
de `ranking`/`admin`:

```json
"enVivo": {
  ".read": "auth != null && auth.token.email.endsWith('@movistararena.com.ar')"
}
```

La escritura la hace el service account (admin SDK), que saltea las rules, así que
no hace falta `.write`. Cambio mínimo y aditivo; **no** toca las reglas blindadas
de `pronos`, `ranking`, `bonus`, `deadlines`.

## Fuera de alcance (YAGNI)

- No se modifica `sync-resultados.js`, su workflow, ni la lógica de ranking.
- No se promete marcador segundo a segundo (sería plan pago).
- No se agrega estado de partido a `admin/resultados`.
- No se persiste historial de marcadores en vivo.

## Verificación

- `node scripts/sync-vivo.js --dry-run` imprime el mapa que escribiría sin tocar
  Firebase.
- La tarjeta del frontend se prueba escribiendo a mano un nodo `enVivo/<pid>` de
  ejemplo en la consola de Firebase y verificando que aparece y se oculta.
- Confirmar que con `enVivo` vacío/null la pantalla principal queda idéntica a hoy.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Marcador atrasado (free tier + cron) | Etiqueta honesta en la UI; diseño listo para plan pago |
| Falla del feed en vivo | Nodo aislado; el scoring no se ve afectado; fallback "EN JUEGO" sin marcador |
| Cron de Actions demorado/saltado | Aceptado; no afecta el prode, solo la frescura del marcador |
| Costos Firebase | Nodo minúsculo, sin Cloud Functions; se mantiene plan Spark gratuito |
