// jsdom has no fetch; tests mock it per case.
if (!globalThis.fetch)
    (globalThis as any).fetch = () => Promise.reject(new Error('fetch not mocked'));
