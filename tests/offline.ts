// Tests must provide their own HTTP transport. A local database does not imply
// access to AI providers, translation services or any other external network.
globalThis.fetch = async () => { throw new Error('Network disabled in tests. Mock fetch for this request.'); };
// Pure modules can import server helpers without opening a connection. Keep
// module initialization independent of credentials when integration is skipped.
process.env.TEST_DATABASE_URL ||= 'postgres://offline:offline@127.0.0.1:1/groundwork_test';
process.env.TEST_DATABASE_URL_OWNER ||= 'postgres://offline:offline@127.0.0.1:1/groundwork_test';
