import { migrate, runOwner } from './migrate';
import { seed } from './seed';
await runOwner(async client => { await migrate(client); await seed(client); });
console.log('Development database migrated and seeded.');
