import { describe, expect, it } from 'vitest';
import { RequestError } from '../lib/ui/api';
import { bulkLimitCopy, canUndo, cleanMapping, duplicateImport, importError, issueCopy, mappingOptions, sendLabel, validationCopy } from '../lib/ui/imports';
describe('spreadsheet review presentation', () => {
  it('offers detected headers unchanged and an explicit skip option', () => {
    expect(mappingOptions(['Work title', 'Site / address'])).toEqual([{ value: '', label: "Don't import" }, { value: 'Work title', label: 'Work title' }, { value: 'Site / address', label: 'Site / address' }]);
  });
  it('omits skipped fields instead of sending empty header names', () => {
    expect(cleanMapping({ title: 'Title', description: '', site: 'Site' })).toEqual({ title: 'Title', site: 'Site' });
    expect(cleanMapping({})).toEqual({});
  });
  it('includes warnings in the eligible count, including zero-row imports', () => {
    expect(sendLabel({ valid: 35, warning: 2 })).toBe('Send 37 valid rows to queue');
    expect(sendLabel({ valid: 0, warning: 0 })).toBe('Send 0 valid rows to queue');
  });
  it('expires undo at the exact server deadline and rejects malformed deadlines', () => {
    const until = '2026-10-10T12:10:00Z', deadline = Date.parse(until);
    expect(canUndo(until, deadline - 1)).toBe(true);
    expect(canUndo(until, deadline)).toBe(false);
    expect(canUndo(until, deadline + 1)).toBe(false);
    expect(canUndo('invalid', deadline)).toBe(false);
  });
  it('limits staff to 25 while allowing admins to approve the full page', () => {
    expect(bulkLimitCopy('staff', 25)).toBeNull();
    expect(bulkLimitCopy('staff', 26)).toBe('You can add 25 at a time. Pick 25 or fewer.');
    expect(bulkLimitCopy('admin', 50)).toBeNull();
    expect(importError(new RequestError(403, 'secret'), 'bulk')).toBe(bulkLimitCopy('staff', 26));
  });
  it('uses plain errors and never exposes arbitrary server or provider messages', () => {
    expect(importError(new RequestError(409, 'provider internals'), 'undo')).toBe('Undo has expired');
    expect(importError(new RequestError(422, 'stack trace'), 'upload')).toContain('500 rows');
    expect(importError(new Error('secret'), 'approve')).not.toContain('secret');
    expect(issueCopy({ field: 'site', code: 'unknown_site', message: 'secret' })).toBe('Choose a known site and its matching client.');
    expect(issueCopy({ field: 'title', code: 'duplicate_file', message: 'Duplicate of row 4' })).toBe('Duplicate of row 4.');
    expect(issueCopy({ field: 'title', code: 'duplicate_open', message: 'server detail' })).toBe('A matching job is already open.');
    expect(issueCopy({ field: 'title', code: 'unexpected', message: 'secret' })).not.toContain('secret');
  });
  it('maps server validation keys to safe labeled field errors', () => {
    expect(validationCopy({ title: ['secret'], 'edits.site': ['secret'], scheduled_for: ['secret'], arbitrary: ['secret'] })).toEqual({ title: 'Enter a title of 1 to 200 characters.', site: 'Choose a known site and matching client.', scheduled_for: 'Enter a valid date or a timestamp with a timezone.' });
    expect(validationCopy()).toEqual({});
  });
  it('reconstructs duplicate copy using only the date and existing import id', () => {
    expect(duplicateImport(new RequestError(409, 'You already imported this file on 2026-10-10.', { import_id: ['existing'] }, 'already_imported'))).toEqual({ id: 'existing', message: 'You already imported this file on 2026-10-10.' });
    expect(duplicateImport(new RequestError(409, 'secret', { import_id: ['existing'] }, 'already_imported'))?.message).toBe('You already imported this file.');
    expect(duplicateImport(new RequestError(409, 'secret', {}, 'already_imported'))).toBeNull();
    expect(duplicateImport(new RequestError(500, 'secret'))).toBeNull();
  });
});

it('places external reference conflicts under their own field',()=>{expect(validationCopy({external_ref:['External reference already used by WO-1.']})).toEqual({external_ref:'This external reference is already used. Choose a unique reference.'});});
