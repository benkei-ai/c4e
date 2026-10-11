/**
 * Los `projects` del agente de un socio, ahora sobre `ProjectBase`.
 *
 * ## Por qué este fichero es el PRIMER test de este catálogo
 *
 * Porque el cambio del 2026-10-11 retira un vocabulario. `ProjectRecordSchema`
 * declaraba `status: ['idea','active','paused','done','archived']`, donde la
 * plataforma dice `lead · active · paused · done · cancelled`. Un vocabulario
 * propio no es gratis: el kanban de cartera del motor y el índice del menú
 * agrupan por `status`, así que `idea` y `archived` eran dos columnas que
 * ninguna pantalla compartida sabía pintar — el mismo fallo que en hulahoop
 * dejó la pestaña Tareas diciendo «No tasks pending» con las tareas en disco.
 *
 * Retirar valores de un enum es la clase de cambio que puede dejar registros
 * fuera de validación, y un registro que no valida no se relee ni se edita. Así
 * que la decisión se tomó MIDIENDO, no razonando: en prod el 2026-10-11 este
 * namespace tiene UN registro, con `status: 'active'`, y `idea`/`archived`
 * tienen **cero** en los 29 agentes de socio. Eran valores declarados que nadie
 * escribió nunca.
 *
 * Lo que este test fija es eso: que el registro real sigue validando, que el
 * vocabulario es ya el de la plataforma, y que el esquema que el blueprint
 * publica es el mismo objeto — no una copia que pueda derivar.
 */

import { describe, expect, it } from 'bun:test';
import { PROJECT_STATUS } from '@benkei-ai/core';
import { memberChild } from '../src/blueprints/member.js';

/** El esquema TAL COMO LO PUBLICA el blueprint: es el que valida la escritura
 *  de verdad, y leerlo de aquí es lo que impide probar una copia. */
function projectsSchema() {
  const ns = memberChild.namespaceSchema?.find((n) => n.name === 'projects');
  if (ns === undefined || ns.recordSchema === undefined) {
    throw new Error('el blueprint `member` ya no publica un `projects` con esquema');
  }
  return ns.recordSchema as {
    safeParse: (v: unknown) => { success: boolean; data?: Record<string, unknown> };
  };
}

/** El ÚNICO registro vivo en prod, con sus claves reales (medido 2026-10-11). */
const PROYECTO_REAL = {
  title: 'Un proyecto del socio',
  summary: 'Qué está construyendo',
  status: 'active',
  startedAt: '2026-03-01',
  links: ['https://ejemplo.com/repo'],
  tags: ['web3'],
};

describe('projects del socio — sobre ProjectBase', () => {
  it('el blueprint publica el namespace con esquema', () => {
    // Un `kind:'record'` sin `recordSchema` tumba el arranque de los SEIS
    // tenants, no sólo c4e.
    const ns = memberChild.namespaceSchema?.find((n) => n.name === 'projects');
    expect(ns?.kind).toBe('record');
    expect(ns?.recordSchema).toBeDefined();
  });

  it('el registro que hay en producción sigue validando', () => {
    expect(projectsSchema().safeParse(PROYECTO_REAL).success).toBe(true);
  });

  it('acepta los cinco estados de la plataforma', () => {
    for (const status of PROJECT_STATUS) {
      expect(projectsSchema().safeParse({ ...PROYECTO_REAL, status }).success).toBe(true);
    }
  });

  it('ya NO acepta `idea` ni `archived` — cero registros los usaban', () => {
    // No es una pérdida teórica que se acepta: está medido que es cero. Si
    // algún día hace falta un estado «idea», el sitio es `PROJECT_STATUS`, para
    // que las pantallas compartidas sepan pintarlo.
    expect(projectsSchema().safeParse({ ...PROYECTO_REAL, status: 'idea' }).success).toBe(false);
    expect(projectsSchema().safeParse({ ...PROYECTO_REAL, status: 'archived' }).success).toBe(
      false,
    );
  });

  it('`summary` deja de ser obligatorio', () => {
    // Exigirlo impedía dar de alta un proyecto antes de saber describirlo.
    const { summary: _, ...sin } = PROYECTO_REAL;
    expect(projectsSchema().safeParse(sin).success).toBe(true);
  });

  it('hereda los campos de la base que antes se descartaban', () => {
    const r = projectsSchema().safeParse({
      ...PROYECTO_REAL,
      owner: 'alguien',
      budget: 1000,
      kind: 'web',
      archived: true,
      leadUserId: 'user-1',
    });
    expect(r.success).toBe(true);
    expect(r.data?.archived).toBe(true);
    expect(r.data?.kind).toBe('web');
  });

  it('sigue rechazando una clave inventada', () => {
    // `.strict()` se CONSERVA aquí, al contrario que en los catálogos cuyo
    // `projects`/`tasks` escribe el motor: a un socio no le llega triaje de
    // correo, así que una clave inesperada es un error del catálogo y no un
    // campo nuevo de la plataforma.
    expect(projectsSchema().safeParse({ ...PROYECTO_REAL, chorizo: 1 }).success).toBe(false);
  });

  it('exige `title` y `status`', () => {
    const { title: _t, ...sinTitulo } = PROYECTO_REAL;
    const { status: _s, ...sinEstado } = PROYECTO_REAL;
    expect(projectsSchema().safeParse(sinTitulo).success).toBe(false);
    expect(projectsSchema().safeParse(sinEstado).success).toBe(false);
  });
});
