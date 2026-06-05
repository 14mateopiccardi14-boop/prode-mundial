# PRODE ZAZA PACHULIA — versión amigos del PRODE Movistar Arena

**Fecha:** 2026-06-05
**Estado:** Diseño aprobado, ejecución pendiente.

## Objetivo

Crear una copia independiente y separada del PRODE actual (`prode-ba-arena`) para usar con un grupo de amigos. Misma funcionalidad (pronósticos, ranking, panel admin, bonus, desempate, premios) pero con su propia base de datos, su propio hosting, su propio código y restricciones de acceso pensadas para amigos (no para cuentas corporativas).

## Decisiones tomadas

| Aspecto | Decisión |
|---|---|
| Estrategia código | Fork — carpeta separada `PRODE-ZAZA/` al lado de `PRODE/` |
| Repositorio git | Nuevo repo independiente (no comparten historia) |
| Firebase project | Nuevo proyecto, sugerido `prode-zaza-pachulia` |
| Cuenta Google | Personal (`14mateopiccardi14@gmail.com`), no la laboral |
| Auth | Google sign-in + código de invitación validado server-side por reglas |
| Admin | Único: `14mateopiccardi14@gmail.com` (Mateo) |
| Datos iniciales | Copiar solo fixture (partidos) del original; sin resultados, pronósticos ni puntajes |
| Branding | Quitar logo Movistar Arena, título "PRODE ZAZA PACHULIA". Mantener branding FIFA World Cup 2026 |

## Arquitectura

```
PRODE/                    PRODE-ZAZA/  (nuevo, hermano)
├── index.html       →    ├── index.html       (branding y auth modificados)
├── firebase.json         ├── firebase.json    (igual)
├── .firebaserc           ├── .firebaserc      (→ prode-zaza-pachulia)
├── database.rules.json   ├── database.rules.json  (reglas amigos)
└── .git/                 └── .git/            (repo independiente)
       ↓                          ↓
  prode-ba-arena             prode-zaza-pachulia
  (Firebase actual)          (Firebase nuevo)
```

Los dos proyectos quedan **completamente aislados**: bases de datos, hosting URLs, configs, usuarios. Un cambio en uno no afecta al otro. La intersección de código se hace a mano (si querés portar un bugfix, lo copiás manualmente).

## Sección 1 — Auth con código de invitación

### Flujo de ingreso

1. Usuario abre la URL → ve pantalla de login con botón "Entrar con Google".
2. Click → completa Google sign-in normal.
3. La app consulta `/accessGranted/{uid}` en la DB:
   - **Si ya existe** → entra directo al PRODE.
   - **Si NO existe** → muestra modal "Ingresá el código de invitación".
4. Usuario tipea el código → la app intenta escribir en `/accessGranted/{uid}` el objeto `{code: "<lo-que-tipeo>", ts: <timestamp>}`.
5. **Las reglas de Firebase validan server-side** que `newData.child('code').val() === root.child('config/inviteCode').val()`. Si matchea: write OK, entra. Si no: error "Código incorrecto", se queda en el modal.
6. Las próximas veces, ya queda registrado, entra sin pedirlo de nuevo.

### Seguridad

- El código vive en `/config/inviteCode`. Esa rama tiene `.read: false` para todos los clientes — **el código nunca se descarga al navegador**.
- Las reglas pueden comparar `root.child('config/inviteCode').val()` server-side sin que el cliente lo vea.
- Solo el admin (Mateo) puede leer y modificar `/config`.
- Todas las demás ramas (`/admin`, `/ranking`, `/usuarios`) requieren que exista `/accessGranted/{uid}` para leer/escribir. Sin entrar por la puerta, no se accede a nada.

### Reglas DB (esquema)

```json
{
  "rules": {
    ".read": false,
    ".write": false,

    "config": {
      ".read": "auth != null && auth.token.email === '14mateopiccardi14@gmail.com'",
      ".write": "auth != null && auth.token.email === '14mateopiccardi14@gmail.com'"
    },

    "accessGranted": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid && newData.child('code').val() === root.child('config/inviteCode').val()",
        "code": { ".validate": "newData.isString()" },
        "ts":   { ".validate": "newData.isNumber()" },
        "$other": { ".validate": false }
      }
    },

    "admin": {
      ".read":  "auth != null && root.child('accessGranted').child(auth.uid).exists()",
      ".write": "auth != null && auth.token.email === '14mateopiccardi14@gmail.com'"
    },

    "ranking": {
      ".read": "auth != null && root.child('accessGranted').child(auth.uid).exists()",
      "$uid": {
        ".write": "auth != null && (auth.uid === $uid || auth.token.email === '14mateopiccardi14@gmail.com')",
        // ...mismas validaciones de campos que el original (nombre, total, ptsGrupos, etc.)
      }
    },

    "usuarios": {
      "$uid": {
        ".read":  "auth != null && (auth.uid === $uid || auth.token.email === '14mateopiccardi14@gmail.com')",
        ".write": "auth != null && (auth.uid === $uid || auth.token.email === '14mateopiccardi14@gmail.com')"
        // ...mismas validaciones de pronos/bonus/historial que el original
      }
    }
  }
}
```

### Panel admin

Se agrega una sección nueva "Código de invitación":
- Muestra el código actual.
- Botón para copiar al portapapeles (para mandar al grupo).
- Input para cambiarlo. Cambiarlo no expulsa a los que ya entraron (siguen con `/accessGranted/{uid}` registrado); solo afecta a los nuevos.

## Sección 2 — Branding (cambios visuales)

### Cambios

| Lugar | Antes | Después |
|---|---|---|
| `<title>` del navegador (línea ~6) | `Copa del Mundo 2026 — Movistar Arena` | `PRODE ZAZA PACHULIA` |
| Subtítulo login (línea ~1252) | `Solo para cuentas @movistararena.com.ar` | `Ingresá con Google y el código de invitación` |
| Subtítulo modal bienvenida (línea ~1265) | `Copa del Mundo 2026 — Movistar Arena` | `Copa del Mundo 2026 — PRODE ZAZA PACHULIA` |
| Tooltip y toast (líneas ~2263-2265) | `Movistar Arena` | `PRODE ZAZA PACHULIA` |
| Logo Movistar Arena (3 lugares: loading, login, header) | Imagen del logo | Texto "PRODE ZAZA PACHULIA" estilizado, mismo tamaño y alineación |

### Lo que NO cambia

- Logo y branding de FIFA World Cup 2026 (sigue al lado del nuevo título).
- Imagen de fondo (`fondo-maradona`).
- Paleta de colores, layout, tipografías base.
- Todo el sistema de puntajes, desempate, premios, ranking, fixture, bonus.

## Sección 3 — Copia del fixture

### Procedimiento (manual, una sola vez)

1. **Exportar** desde Firebase Console (cuenta del proyecto actual): Realtime Database → nodo `/admin` → menú ⋮ → "Export JSON". Guardar como `admin-export.json`.

2. **Limpiar resultados localmente.** Yo te paso un script chiquito (Node.js o página HTML standalone) que toma el `admin-export.json`, recorre los partidos, borra los campos de resultado (probablemente `gl`/`gv` o equivalentes — lo confirmamos al ver el JSON), y devuelve `admin-clean.json`. Conserva: equipos, fechas, horas, grupo/fase, IDs.

3. **Importar** `admin-clean.json` en Firebase Console del proyecto nuevo: Realtime Database → ⋮ → "Import JSON" en el nodo raíz (lo subimos a `/admin`).

4. **No se copian:** `/ranking`, `/usuarios`, `/accessGranted`. Esos arrancan vacíos.

5. **Sembrar** manualmente el código de invitación inicial: en la Console, crear `/config/inviteCode` con el string que vayas a compartir (ej. "zaza2026").

## Sección 4 — Pasos pendientes (qué hace el usuario)

Estos son los pasos que Mateo tiene que ejecutar antes de que yo pueda continuar con la implementación:

1. **Crear proyecto Firebase nuevo** con la cuenta personal `14mateopiccardi14@gmail.com`:
   - Console → Add project → nombre `prode-zaza-pachulia`
   - Habilitar Authentication → Sign-in method → Google
   - Habilitar Realtime Database (modo locked)
   - Habilitar Hosting
   - Engranaje → Project settings → Web app → registrar app → **copiar el `firebaseConfig`** (apiKey, authDomain, databaseURL, projectId, etc.) y pasármelo.

2. **Exportar `/admin`** del proyecto actual desde la Firebase Console y guardar el JSON (lo procesamos juntos en la sesión siguiente).

3. **Decidir el código de invitación inicial** (un string corto y memorable, ej. "zaza2026" o algo así).

## Sección 5 — Pasos que ejecuta Claude (cuando se retome)

Cuando Mateo provea las credenciales del Firebase nuevo + el `admin-export.json`, yo voy a:

1. Copiar la carpeta `PRODE/` → `PRODE-ZAZA/` (sin `.git`, `.firebase/`, `.claude/`, `.superpowers/`).
2. Inicializar git en la nueva carpeta (repo independiente).
3. Editar `.firebaserc` apuntando a `prode-zaza-pachulia`.
4. Reemplazar el bloque `firebaseConfig` en `index.html` (línea ~1464) con las credenciales nuevas.
5. Reescribir `database.rules.json` con el esquema de la Sección 1.
6. Aplicar los cambios de branding de la Sección 2 (título, logos, textos).
7. Reemplazar el `ADMIN_EMAILS` array (línea ~1500) con `['14mateopiccardi14@gmail.com']`.
8. Quitar el filtro `@movistararena.com.ar` (líneas ~1483, ~1490).
9. Agregar:
   - Modal de "Ingresá el código de invitación" (mostrado al primer login).
   - Sección "Código de invitación" en el panel admin.
10. Crear un script chiquito de limpieza del JSON exportado.
11. Validar reglas con el simulador de Firebase.
12. Deploy: `firebase deploy` desde `PRODE-ZAZA/`.
13. Sembrar `/config/inviteCode` desde la Console (o desde el panel admin después del primer login del admin).

## Riesgos y consideraciones

- **Pisar el deploy del original:** mitigado por carpetas separadas con `.firebaserc` distintos. Cero riesgo si siempre se deploya desde la carpeta correcta.
- **Olvidar quitar un email hardcoded:** revisión completa de los 6 grep hits de `movistararena.com.ar` durante implementación.
- **Código de invitación filtrado:** el código nunca se sirve al cliente; solo se compara server-side en la regla. Resistente a inspección de DevTools.
- **Atacante con DevTools intentando escribir directo en `/accessGranted/{uid}` sin código válido:** bloqueado por la validación de la regla (`newData.child('code').val() === root.child('config/inviteCode').val()`).
- **Costo Firebase:** plan Spark (gratis) alcanza sobrado para un grupo de amigos. Sin riesgo de cargos.

## Pendiente (no incluido en este spec)

- Plan de implementación detallado paso a paso (se hace con la skill `writing-plans` cuando se retome el trabajo).
- Decisión sobre si querés permitir que vos mismo entres con tu cuenta laboral además de la personal (por ahora: solo personal).
- Definición del logo/tipografía exacta del texto "PRODE ZAZA PACHULIA" (puede iterarse al ver el render).
