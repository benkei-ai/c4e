# CLAUDE.md — `@cryptobenkei/c4e`

Catálogo del org **c4e**: la comunidad. Este repo es **lógica de negocio de un
tenant**, no motor. Aquí se declara cómo es la comunidad c4e; el motor
(`benkei-orchestrator`) sólo la instala y la ejecuta.

> **c4e es uno de los cinco tenants y no tiene mecánica propia.** Mismo motor,
> mismo despliegue, mismas reglas que `context`, `deskandsit`, `hulahoop` y
> `neftis`. Lo único que lo distingue es lo que declara este `src/`: sus
> blueprints, sus procesos y sus acciones. Si encuentras aquí un procedimiento
> que no valga igual para los otros cuatro, sospecha del documento antes que del
> sistema — es lo que ya pasó con el bloque de despliegue de más abajo.

---

## El negocio

c4e es una **comunidad de miembros** con gobernanza, proyectos, eventos, noticias
y tesorería. La idea central: **cada miembro tiene su propio agente**, y su vía
de entrada principal es el bot de Telegram compartido.

### Árbol de agentes

```
did:orch:c4e (raíz — la crea el motor, no este catálogo)
├── members     manager  →  member       un agente por persona de la comunidad
├── projects    manager  →  project      iniciativas de la comunidad
├── events      manager  →  event        convocatorias
├── governance  manager  →  proposal     propuestas a votación
├── news        manager                  el feed de la comunidad
└── treasury    manager  →  transaction  movimientos
```

Profundidad máxima 3 (raíz → manager → hoja): un `member` no puede tener hijos.

### Los dos flujos que definen la comunidad

**`join-community`** — se lanza desde el manager `members`. Recoge los datos del
candidato (incluido su handle de Telegram), hace investigación pública, manda el
correo de invitación, y **el agente del miembro se crea en su primer login**, no
antes. Es decir: la invitación no mintea un agente huérfano.

**`user-interview`** — lo lanza el propio miembro sobre **su** agente, la primera
vez. Seis pasos conversacionales más investigación pública, y compone cuatro
secciones de wiki: Perfil, Experiencia, Productos y Servicios, y Eventos. El
resultado es que el agente del miembro sabe quién es su dueño.

Los otros dos procesos (`news-updates`, `news-reputation`) alimentan el feed y
puntúan la reputación de lo publicado.

### Dónde viven los datos

En la memoria del agente, no en este repo. Los namespaces `kind:'record'`
declarados en los blueprints (miembros, proyectos, propuestas, transacciones) se
validan contra su esquema zod y se escriben por `records.upsert`. **Nunca a
mano**: `_records.json` está bajo un event log firmado y una edición manual rompe
la integridad.

---

## Relación con Benkei

La regla: **el motor no sabe qué es c4e.** Sabe instalar catálogos. Todo lo que
hace a c4e ser c4e está en este repo.

| Vive aquí (negocio) | Vive en el motor (mecánica) |
|---|---|
| Blueprints: managers, hijos, lifecycles | El árbol de agentes, la profundidad ≤3 |
| Namespaces y sus esquemas zod | Storage, records, el índice y sus locks |
| Procesos (`join-community`, …) | El motor de procesos y el launcher |
| Acciones de `src/actions/` | El registro de capacidades y los permisos |
| El *binding* del dashboard | El componente React del dashboard |

Cuatro enganches lo conectan, y conviene saberlos porque **el tercero es el que
se olvida**:

1. **Dependencia** — `apps/agents-app/package.json` lo declara
   `"@cryptobenkei/c4e": "link:../../../benkei-c4e"`.
2. **Montaje y symlink** — `ba-mt-up.sh` monta este repo en `/benkei-c4e`, y
   `agent-entrypoint.sh` §6 recrea el symlink
   `node_modules/@cryptobenkei/c4e → /benkei-c4e` en cada arranque cuando
   `BENKEI_ORG_SLUG=c4e`.
3. **Registro** — `server/foundation/catalog-registry.ts` tiene la entrada
   `c4e` con `processesExport: 'C4E_PROCESSES'`. Eso lo hace *resoluble*.
4. **Procesos** — el motor siembra en bucle lo que exporte `C4E_PROCESSES`.
   ⚠️ **Un slug que esté en `blueprint.workflows` pero no en `C4E_PROCESSES` se
   descarta EN SILENCIO del launcher**: sin error, sin log, el agente parece
   sano y el botón simplemente no está. Es el fallo que más horas cuesta.

**Registrado ≠ instanciado.** Registrar el bundle lo hace resoluble en todos los
arranques (inerte, no crea agentes); un *seed* mintea los managers en este org.

---

## Editar → aplicar

**Local y prod NO usan el mismo contenedor, y el reparto es igual para los cinco
tenants.** Verificado el 2026-08-04 sondeando prod y la máquina local.

| | Contenedor | Cómo se aplica un cambio |
|---|---|---|
| **Local** | `benkei-mt-c4e` (uno por tenant, puerto propio) | `pnpm build` + `docker restart` |
| **Prod** | `benkei-agent-c4e` (uno por tenant) | `benkei-deploy c4e`, refs en `~/.benkei/agents/c4e/release.env` |

`benkei-agent-c4e` **no está obsoleto**: es el contenedor que sirve
`c4e-app.benkei.dev` ahora mismo. Este fichero afirmó lo contrario hasta el
2026-08-04 —y el de neftis todavía lo afirma—, que es el tipo de error que lleva
a buscar un problema de despliegue en el sitio equivocado.

```bash
# 1. Editar src/ aquí, en el host.
pnpm build                                    # tsup → dist/

# 2. LOCAL — recargar el catálogo en el contenedor de este tenant:
docker restart benkei-mt-c4e

# 3. PROD — se despliega por su tag, nunca copiando ficheros:
#    ssh benkei-prod 'benkei-deploy c4e --catalog v0.X.0'
```

⚠️ **Si mueves una carpeta bind-montada, RECREA el contenedor, no lo reinicies.**
Los bind mounts se fijan en `docker create`: con `stop`+`start` Docker crea un
directorio vacío en la ruta vieja y el agente arranca *healthy* con el catálogo
vacío, sin un solo error en el log.

- **`pnpm restart` de pm2 NO recarga un catálogo enlazado.** Hace falta reinicio
  de contenedor.
- **Nunca `pnpm install` dentro del contenedor vivo**: reescribe `node_modules` y
  borra el symlink org-gated → este catálogo deja de resolver y los agentes
  degradan a blueprint vacío, sin error.
- Si construyes dentro del contenedor, invoca `./node_modules/.bin/tsup`
  directamente: `pnpm build` ahí dentro entra en crash-loop por el chequeo de
  dependencias de pnpm 11 sin TTY.

## Versionado

Semver propio (`package.json` + `releases/<x.y.z>.md`), tags e historia
independientes del motor. Este catálogo se despliega a prod por separado, y por
eso existen los **suelos de versión**: el catálogo declara qué motor mínimo
necesita y el motor qué catálogo mínimo acepta.

La fundación se declara `@benkei-ai/core: ^0.6.0` — **la misma que los otros
cuatro catálogos** (comprobado el 2026-08-04). No es una coincidencia que haya
que mantener: el contrato de fundación (`did:pqc`, event log, formatos de sobre)
es uno solo para todo el árbol, así que **si subes la fundación, subes los cinco
catálogos a la vez**. Un `^` que excluya la versión que corre de verdad no falla
al arrancar: funciona hasta el primer `install` limpio, y entonces parte el
contrato sin decir nada.

## Reglas

- **No edites `benkei-orchestrator/benkei-templates` (subtree del motor)** para personalizar c4e: lo comparten
  todos los tenants. Forkea el fichero concreto a `src/blueprints/` y cambia el
  import.
- Los nombres de namespace en modo records deben casar `/^[a-z_][a-z0-9_]*$/`.
- `CATALOGS` se valida en el arranque de **todos** los tenants: un namespace
  `kind:'record'` sin `recordSchema` aquí **tumba también a los otros cuatro**.
  Valida con un import ESM real antes de reiniciar nada vivo.
- `npm publish` acumulado al final de la sesión, nunca por paso.
