/*
 * Tests for the protected-messages registry (src/functions/protectedMessages.js).
 *
 * The registry lets modules that post a "persistent" message (sticky messages,
 * live messages, panels, ...) flag it so the auto-delete module leaves it alone.
 * It hangs off the shared client as channelId -> Set<messageId>.
 *
 * Covers:
 *   - protectMessage records an id and lazily creates the client registry / channel set
 *   - isMessageProtected reflects what was registered (and is false before anything is)
 *   - unprotectMessage removes an id and prunes the now-empty channel set
 *   - every entry point no-ops on a missing client / channelId / messageId
 */

const {
    protectMessage,
    unprotectMessage,
    isMessageProtected,
    registerProtectedMessageProvider,
    loadProtectedMessages,
    clearProtectedMessageProviders
} = require('../../src/functions/protectedMessages');

describe('protectedMessages registry', () => {
    test('protects an id and reports it as protected', () => {
        const client = {};
        expect(isMessageProtected(client, 'chan', 'msg')).toBe(false);
        protectMessage(client, 'chan', 'msg');
        expect(isMessageProtected(client, 'chan', 'msg')).toBe(true);
        // unrelated ids/channels stay unprotected
        expect(isMessageProtected(client, 'chan', 'other')).toBe(false);
        expect(isMessageProtected(client, 'elsewhere', 'msg')).toBe(false);
    });

    test('tracks several ids per channel and across channels', () => {
        const client = {};
        protectMessage(client, 'a', '1');
        protectMessage(client, 'a', '2');
        protectMessage(client, 'b', '3');
        expect(isMessageProtected(client, 'a', '1')).toBe(true);
        expect(isMessageProtected(client, 'a', '2')).toBe(true);
        expect(isMessageProtected(client, 'b', '3')).toBe(true);
    });

    test('unprotect removes an id and prunes the empty channel set', () => {
        const client = {};
        protectMessage(client, 'a', '1');
        unprotectMessage(client, 'a', '1');
        expect(isMessageProtected(client, 'a', '1')).toBe(false);
        // the channel bucket is pruned once empty
        expect(client.protectedMessages.has('a')).toBe(false);
    });

    test('unprotect keeps other ids in the same channel', () => {
        const client = {};
        protectMessage(client, 'a', '1');
        protectMessage(client, 'a', '2');
        unprotectMessage(client, 'a', '1');
        expect(isMessageProtected(client, 'a', '1')).toBe(false);
        expect(isMessageProtected(client, 'a', '2')).toBe(true);
    });

    test('unprotect is a no-op for an unknown channel or id', () => {
        const client = {};
        // nothing registered yet -> registry Map does not even exist
        expect(() => unprotectMessage(client, 'nope', 'x')).not.toThrow();
        expect(client.protectedMessages).toBeUndefined();
        protectMessage(client, 'a', '1');
        // registry now exists, but this channel has no bucket
        expect(() => unprotectMessage(client, 'unknown-channel', '1')).not.toThrow();
        // known channel, unknown id
        expect(() => unprotectMessage(client, 'a', 'unknown')).not.toThrow();
        expect(isMessageProtected(client, 'a', '1')).toBe(true);
    });

    test('every entry point no-ops on missing client / channelId / messageId', () => {
        // missing client
        expect(() => protectMessage(null, 'a', '1')).not.toThrow();
        expect(() => unprotectMessage(null, 'a', '1')).not.toThrow();
        expect(isMessageProtected(null, 'a', '1')).toBe(false);
        // missing channelId / messageId
        const client = {};
        protectMessage(client, '', '1');
        protectMessage(client, 'a', '');
        unprotectMessage(client, '', '1');
        unprotectMessage(client, 'a', '');
        expect(client.protectedMessages).toBeUndefined();
        // isMessageProtected before the registry exists
        expect(isMessageProtected(client, 'a', '1')).toBe(false);
    });
});

describe('startup providers', () => {
    afterEach(() => clearProtectedMessageProviders());

    test('loadProtectedMessages populates the registry from all providers (sync + async)', async () => {
        const client = {};
        registerProtectedMessageProvider(() => [{
            channelId: 'a',
            messageId: '1'
        }]);
        registerProtectedMessageProvider(async () => [
            {channelId: 'a', messageId: '2'},
            {channelId: 'b', messageId: '3'}
        ]);
        await loadProtectedMessages(client);
        expect(isMessageProtected(client, 'a', '1')).toBe(true);
        expect(isMessageProtected(client, 'a', '2')).toBe(true);
        expect(isMessageProtected(client, 'b', '3')).toBe(true);
    });

    test('a provider that throws or returns a non-array is skipped, others still run', async () => {
        const client = {};
        registerProtectedMessageProvider(() => {
            throw new Error('db down');
        });
        registerProtectedMessageProvider(() => null);
        registerProtectedMessageProvider(() => 'not-an-array');
        registerProtectedMessageProvider(() => [
            {channelId: 'a', messageId: '1'},
            null
        ]);
        await loadProtectedMessages(client);
        // the good provider still applied, the null entry was ignored
        expect(isMessageProtected(client, 'a', '1')).toBe(true);
        expect(client.protectedMessages.size).toBe(1);
    });

    test('registerProtectedMessageProvider ignores non-function input', async () => {
        const client = {};
        registerProtectedMessageProvider(null);
        registerProtectedMessageProvider('nope');
        await loadProtectedMessages(client);
        expect(client.protectedMessages).toBeUndefined();
    });

    test('loadProtectedMessages with no providers is a no-op', async () => {
        const client = {};
        await loadProtectedMessages(client);
        expect(client.protectedMessages).toBeUndefined();
    });
});
