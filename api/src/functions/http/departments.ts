/**
 * Department lookup for GL coding.
 *
 *   GET  /api/departments          list / search
 *   POST /api/departments          find-or-create by name
 *
 * The review queues let a reviewer type a department name; if it does not
 * exist yet it is created. `findOrCreate` is a single upsert so two reviewers
 * typing the same name concurrently cannot create duplicates.
 */

import { app } from '@azure/functions';
import { createMethodHandler, ok } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import { query, queryOne } from '../../shared/db';

interface DepartmentRow {
  id: string;
  erp_department_id: string;
  name: string;
}

app.http('departments', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'departments',
  handler: createMethodHandler({
    GET: {
      roles: Roles.any,
      handler: async ({ req }) => {
        const url = new URL(req.url);
        const search = url.searchParams.get('search');

        const rows = search
          ? await query<DepartmentRow>(
              `SELECT id, erp_department_id, name
                 FROM erp_departments
                WHERE name ILIKE $1
                ORDER BY name
                LIMIT 20`,
              [`%${search}%`]
            )
          : await query<DepartmentRow>(
              `SELECT id, erp_department_id, name FROM erp_departments ORDER BY name LIMIT 200`
            );

        return ok({ departments: rows });
      },
    },
    POST: {
      roles: Roles.reviewer,
      handler: async ({ req }) => {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const name = typeof body['name'] === 'string' ? body['name'].trim() : '';

        if (!name) throw AppError.validation('Department name is required');

        // Match on name first so re-typing an existing department reuses it.
        const existing = await queryOne<DepartmentRow>(
          `SELECT id, erp_department_id, name FROM erp_departments WHERE lower(name) = lower($1)`,
          [name]
        );
        if (existing) return ok(existing);

        const created = await queryOne<DepartmentRow>(
          `INSERT INTO erp_departments (erp_department_id, name)
           VALUES ($1, $2)
           ON CONFLICT (erp_department_id) DO UPDATE SET name = EXCLUDED.name
           RETURNING id, erp_department_id, name`,
          [name.toUpperCase().replace(/\s+/g, '_').slice(0, 60), name]
        );

        if (!created) throw new Error('Department insert returned no row');
        return ok(created);
      },
    },
  }),
});

export {};
