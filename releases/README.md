# `releases/` — versionado de este catálogo

La versión de este catálogo es el campo `version` de su **`package.json`**.
Aquí **no hay fichero `VERSION`** —a diferencia del engine— porque esto sí es
un paquete npm: `src/catalog-meta.ts` ya exporta `CATALOG_VERSION =
pkg.version`, y el orchestrator estampa ese valor como `templateVersion` en
cada agente que acuña desde estos bundles. Un segundo fichero sólo crearía dos
verdades que se desincronizan.

| Qué | Dónde |
|---|---|
| versión que corre este checkout | `package.json` → `version` |
| manifiesto de esa release | `releases/<x.y.z>.md` |
| commit donde `package.json` dice `<x.y.z>` | tag `v<x.y.z>` |

## Cómo se corta una release

Desde el checkout del **orchestrator**, que es donde vive la herramienta:

```bash
bun scripts/release-catalog.ts ../c4e patch --summary "..."
bun scripts/release-catalog.ts ../c4e minor --summary "..." --push
```

Sube `package.json`, escribe el manifiesto, commitea y taggea `v<x.y.z>`.

## El resumen lo lee el cliente

Sale en **Settings → Versions** del workspace de este tenant, en el bloque
*Business logic*. Describe la capacidad, no la implementación: "Las facturas de
proveedor se concilian solas al llegar", no "añadido `reconcile.ts`". Una o dos
frases, sin SHAs ni nombres de fichero.

A diferencia del engine, aquí **sí** puedes nombrar a este cliente: el
manifiesto sólo lo ve él.

Convención del engine (misma forma, distinta fuente de versión):
`benkei-orchestrator/releases/README.md`.
