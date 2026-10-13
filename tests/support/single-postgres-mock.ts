import { afterAll,vi } from 'vitest';
import { stop } from './single-postgres.mjs';
vi.mock('pg',async original=>({...await original<typeof import('pg')>(),Pool:(await import('./single-postgres.mjs')).Pool}));
afterAll(stop);
