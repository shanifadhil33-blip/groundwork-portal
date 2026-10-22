import { afterAll, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/services/push', () => ({ sendPush: vi.fn(), office: vi.fn(async () => []), pushJobChange: vi.fn() }));
import { closePools, withSystem } from '../lib/db';
import * as database from '../lib/db';
import { ids } from '../lib/fixture';
import { startDemo } from '../lib/services/demo';
import { getRating } from '../lib/services/ratings';
import { myFixes } from '../lib/services/job-report';
import { technicianRating, technicianThanks } from '../lib/services/technician-ratings';

const rows = (sql: string, args: unknown[] = []) => withSystem(async db => (await db.query(sql, args)).rows);
afterAll(closePools);

describe.each(['real', 'demo'])('%s technician ratings', mode => {
  it('reads only his own thanks, while supervisors and clients keep low ratings', async () => {
    let ws: string = ids.ridgeline;
    let people: Record<string, string> = { ravi: ids.ravi, sam: ids.sam, omar: ids.omar };
    if (mode === 'demo') {
      ws = (await startDemo({ persona: 'imran' }, 'local-rating-tests')).body.workspace_id;
      people = Object.fromEntries((await rows('SELECT demo_persona,id FROM users WHERE demo_workspace_id=$1', [ws])).map(u => [u.demo_persona, u.id]));
    }
    people.tariq = (await rows(`INSERT INTO users(name,is_demo,demo_workspace_id,demo_persona)
      VALUES('Tariq',$1,$2,$3) RETURNING id`, [mode === 'demo', mode === 'demo' ? ws : null, mode === 'demo' ? 'tariq' : null]))[0].id;
    await rows("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'technician')", [ws, people.tariq]);
    const site = (await rows(`SELECT s.id,s.client_id FROM sites s JOIN members m ON m.workspace_id=s.workspace_id AND m.client_id=s.client_id WHERE s.workspace_id=$1 AND m.user_id=$2 LIMIT 1`, [ws, people.omar]))[0];
    const before = await technicianThanks(people.ravi, ws);
    const jobs: string[] = [];
    for (const [assignee, stars] of [[people.ravi, 4], [people.tariq, 5], [people.ravi, 2], [people.ravi, 3]] as const) {
      const job = (await rows(`INSERT INTO work_orders(workspace_id,client_id,site_id,title,status,assignee_id,created_by)
        VALUES($1,$2,$3,'Rating read test','done',$4,$5) RETURNING id`, [ws, site.client_id, site.id, assignee, people.sam]))[0];
      jobs.push(job.id);
      await rows(`INSERT INTO job_ratings(workspace_id,client_id,work_order_id,rated_by,stars,note) VALUES($1,$2,$3,$4,$5,'Careful work')`, [ws, site.client_id, job.id, people.omar, stars]);
    }
    const ownerRead = vi.spyOn(database, 'withSystem');
    try {
      expect((await getRating(people.ravi, ws, jobs[0])).rating).toMatchObject({ stars: 4, note: 'Careful work' });
      expect(ownerRead).toHaveBeenCalledWith(expect.any(Function), people.ravi);
      ownerRead.mockClear();
      await technicianThanks(people.ravi, ws);
      expect(ownerRead).toHaveBeenCalledWith(expect.any(Function), people.ravi);
    } finally {
      ownerRead.mockRestore();
    }
    for (const id of jobs.slice(1)) expect(await technicianRating(people.ravi, ws, id)).toBeNull();
    for (const id of jobs.slice(2)) expect((await getRating(people.ravi, ws, id)).rating).toBeNull();
    await expect(getRating(people.ravi, ws, jobs[1])).rejects.toThrow();
    expect((await myFixes(people.ravi, ws)).summary.thanks).toBe(before + 1);
    for (const user of [people.sam, people.omar]) expect((await getRating(user, ws, jobs[2])).rating?.stars).toBe(2);
    // The owner query itself must enforce membership, independent of the outer service.
    await rows('UPDATE members SET archived_at=now() WHERE workspace_id=$1 AND user_id=$2', [ws, people.ravi]);
    try {
      expect(await technicianRating(people.ravi, ws, jobs[0])).toBeNull();
      expect(await technicianThanks(people.ravi, ws)).toBe(0);
    } finally {
      await rows('UPDATE members SET archived_at=NULL WHERE workspace_id=$1 AND user_id=$2', [ws, people.ravi]);
    }
    expect(await technicianRating(people.sam, ws, jobs[0])).toBeNull();
    expect(await technicianRating(people.ravi, ids.summit, jobs[0])).toBeNull();
    if (mode === 'demo') {
      await rows("UPDATE workspaces SET demo_expires_at=now()-interval '1 minute' WHERE id=$1", [ws]);
      expect(await technicianRating(people.ravi, ws, jobs[0])).toBeNull();
      expect(await technicianThanks(people.ravi, ws)).toBe(0);
    }
  });
});
