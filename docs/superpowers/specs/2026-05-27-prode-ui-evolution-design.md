# PRODE 2026 — Evolución UI

**Fecha:** 2026-05-27  
**Objetivo:** Mejorar la estética y la claridad funcional del app sin cambiar la estructura existente. El diseño debe comunicar por sí solo — sin que el usuario tenga que preguntar nada.

---

## Contexto

App interna de Movistar Arena para pronosticar partidos del Mundial 2026. Un solo archivo `index.html` con CSS y JS embebidos. Firebase como backend. Usuarios limitados a `@movistararena.com.ar`.

**Problema:** La interfaz actual funciona pero no comunica activamente el estado del usuario (posición, puntos, progreso) ni el urgencia de cada partido (cuándo cierra). Esto genera dudas que se podrían resolver visualmente.

**Principio guía:** El diseño habla solo. Cero explicaciones necesarias.

---

## Qué NO cambia

- Paleta de colores: `--negro #0A0A0A`, `--dorado #C8A020`, fondo `#F5F5F5`, cards blancas
- Tipografías: Bebas Neue (títulos/labels) + DM Sans (body)
- Estructura de tabs: Pronósticos / Resultados / Posiciones / Admin
- Header negro con borde dorado
- Cards de bonus (campeón + goleador)
- Card de reglas de puntaje
- Etapa headers, grupo badges
- Toda la lógica JS existente

---

## Cambios

### 1. Header — chip de posición y puntos

**Qué:** Agregar un chip dorado translúcido entre el logo mundial y el avatar/salir, mostrando posición (`#3`) y puntos (`47 pts`) del usuario logueado.

**Por qué:** El usuario no sabe cómo va sin ir al tab de Posiciones. Si lo ve en el header, siempre está informado.

**Cómo:**
- Nuevo elemento `.hdr-rank` en `.user-area` (o antes del avatar)
- Se popula desde el ranking calculado al cargar la app
- Estilo: `background: rgba(200,160,32,.1)`, `border: 1px solid rgba(200,160,32,.25)`, `border-radius: 8px`, `padding: 4px 10px`
- Posición: Bebas Neue 20px dorado | Puntos: DM Sans 12px blanco + label gris 9px
- Mobile (`max-width:480px`): se muestra solo la posición (`#3`), ocultar el sub-label

---

### 2. Barra de estado (nueva)

**Qué:** Franja blanca pegada debajo del nav con tres datos: pronósticos completados (`42/48`), exactos (`12`), y una alerta naranja del próximo partido que cierra.

**Por qué:** Un usuario que entra a completar predicciones necesita saber de un vistazo cuánto le falta y si hay urgencia.

**Cómo:**
- `<div id="status-bar">` insertado justo después del `<nav>`
- CSS: `background: var(--blanco)`, `border-bottom: 1px solid var(--gris2)`, `padding: 10px 1.25rem`, `display: flex`, `align-items: center`, `gap: 12px`
- Tres ítems: `completados X/Y`, `exactos Z`, y a la derecha la pill naranja con el partido más próximo a cerrar (texto: `⚡ ARG vs FRA cierra en 1h 45m`)
- La pill naranja usa `--naranja-bg: #fffbeb`, `--naranja: #d97706`, borde `#fde68a`
- Se oculta la pill si no hay partidos con cierre inminente (< 24h)
- JS: calcular al cargar y actualizar cada minuto con el mismo timer existente

---

### 3. Cards de partidos — rediseño estilo sports

**Qué:** Reemplazar el layout actual de partido (una sola fila horizontal: equipo — input — vs — input — equipo — chip) por un layout vertical: equipo arriba / equipo abajo, inputs apilados a la derecha, footer con deadline y hint de puntos.

**Por qué:** El layout actual es compacto pero poco legible en mobile, y no muestra el deadline ni el estado de forma prominente. El nuevo layout es más escaneable y hace evidente cuándo hay que actuar.

**Estructura HTML nueva por partido:**
```html
<div class="match-card [saved|pending|closed]">
  <div class="status-strip"></div>           <!-- línea de color top: verde/naranja/gris -->
  <div class="match-body">
    <div class="match-teams">
      <div class="match-team"><span class="match-flag">🇦🇷</span><span class="match-team-name">Argentina</span></div>
      <div class="match-team"><span class="match-flag">🇫🇷</span><span class="match-team-name">Francia</span></div>
    </div>
    <div class="match-inputs">
      <input class="score-in [filled]" type="number">
      <input class="score-in [filled]" type="number">
    </div>
  </div>
  <div class="match-footer">
    <div class="match-deadline">
      <div class="deadline-dot [warn|ok|off]"></div>
      <span class="deadline-text [warn|ok|off]">Cierra en 1h 45m</span>
    </div>
    <div class="match-pts">Exacto <span>+3</span> · Ganador <span>+1</span></div>
  </div>
</div>
```

**Estados:**
| Clase | Strip color | Dot color | Texto deadline |
|---|---|---|---|
| `saved` | verde `#16a34a` | verde | "Cierra en X" (naranja si < 2h) |
| `pending` | naranja `#d97706` | naranja | "Cierra en X" |
| `closed` | gris `#E8E8E8` | gris | "Cerrado · ya no se puede modificar" |

**CSS clave:**
- `.match-card`: `border-radius: 10px`, `border: 1px solid var(--gris2)`, misma sombra que `.card`
- `.status-strip`: `height: 3px`
- `.match-body`: `display: grid; grid-template-columns: 1fr auto; padding: 10px 14px; gap: 12px`
- `.match-team-name`: DM Sans 13px 600
- `.score-in.filled`: `border-color: var(--dorado); background: #FFFDF0`
- `.match-footer`: `display: flex; justify-content: space-between; padding: 6px 14px 10px; border-top: 1px solid var(--gris1)`

**JS cambios:**
- La función que renderiza cada partido en `#fixture-container` produce el nuevo HTML
- La clase del `.match-card` se determina: si hay valor en ambos inputs → `saved`; si el partido cerró → `closed`; si no → `pending`
- El texto del deadline usa el mismo cálculo de tiempo que ya tiene el countdown

---

## Alcance

**Dentro:** Header chip, status bar, match cards.  
**Fuera:** Tab Resultados, tab Posiciones, tab Admin, pantalla de login, pantalla de carga. Esos quedan para una segunda iteración.

---

## Variables CSS a agregar al `:root`

```css
--naranja: #d97706;
--naranja-bg: #fffbeb;
--naranja-border: #fde68a;
--verde: #16a34a;
--verde-bg: #f0fdf4;
--verde-border: #bbf7d0;
```

---

## Archivos afectados

- `index.html` — único archivo del proyecto (CSS + HTML + JS embebidos)
  - Sección `<style>`: agregar clases nuevas, mantener las existentes
  - Sección `<body>`: modificar `.user-area` en el header, insertar `#status-bar`, reemplazar la función que genera `.partido-row`
