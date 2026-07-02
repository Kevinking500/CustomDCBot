/*
 * Integration guard for the startup-provider chain.
 *
 * Requiring a real persistent-message module's botReady file must register a
 * provider (at module load time) that, when run via loadProtectedMessages,
 * pulls the module's persisted message ids out of client.models and marks them
 * protected. This locks the contract so a future rename of the DB field
 * (channelID / messageID) or the client.models key is caught here rather than
 * silently letting auto-delete eat the panel.
 *
 * team-list is used as the representative in-row module (channelID +
 * messageID stored on the row).
 */

jest.mock('../../src/functions/localize', () => ({localize: (m, k) => k}));

const {
    loadProtectedMessages,
    isMessageProtected
} = require('../../src/functions/protectedMessages');

/*
 * NOTE: providers register at require time and require is cached, so a provider
 * registers only once for the whole file. We must NOT clear the provider list
 * between tests here (a later test's require would not re-register it). The
 * per-module enabled / models guards keep accumulated providers from interfering
 * across tests since each test only wires up client.modules/models for its own
 * module.
 */

test('team-list registers a provider that protects its stored ids on load', async () => {
    // requiring the botReady file runs its top-level registerProtectedMessageProvider call
    require('../../modules/team-list/events/botReady');

    const client = {
        modules: {'team-list': {enabled: true}},
        models: {
            'team-list': {
                TeamListMessage: {
                    findAll: async () => [
                        {channelID: 'chan-1', messageID: 'msg-1'},
                        {channelID: 'chan-2', messageID: 'msg-2'},
                        {channelID: null, messageID: 'no-channel'}
                    ]
                }
            }
        }
    };

    await loadProtectedMessages(client);

    expect(isMessageProtected(client, 'chan-1', 'msg-1')).toBe(true);
    expect(isMessageProtected(client, 'chan-2', 'msg-2')).toBe(true);
    // a row missing a channel id is skipped, not protected under a bogus key
    expect(isMessageProtected(client, null, 'no-channel')).toBe(false);
});

test('a disabled module contributes nothing', async () => {
    require('../../modules/team-list/events/botReady');
    const client = {
        modules: {'team-list': {enabled: false}},
        models: {'team-list': {TeamListMessage: {findAll: async () => [{channelID: 'c', messageID: 'm'}]}}}
    };
    await loadProtectedMessages(client);
    expect(isMessageProtected(client, 'c', 'm')).toBe(false);
});

test('suggestions provider derives the channel from config and maps every row id', async () => {
    require('../../modules/suggestions/events/messageCreate');
    const client = {
        modules: {'suggestions': {enabled: true}},
        configurations: {'suggestions': {'config': {suggestionChannel: 'sug-chan'}}},
        models: {
            'suggestions': {
                Suggestion: {
                    findAll: async () => [{messageID: 's1'}, {messageID: 's2'}, {messageID: null}]
                }
            }
        }
    };
    await loadProtectedMessages(client);
    expect(isMessageProtected(client, 'sug-chan', 's1')).toBe(true);
    expect(isMessageProtected(client, 'sug-chan', 's2')).toBe(true);
    // a row with no messageID is skipped
    expect(client.protectedMessages.get('sug-chan').size).toBe(2);
});

test('suggestions provider yields nothing when the channel is not configured', async () => {
    require('../../modules/suggestions/events/messageCreate');
    const client = {
        modules: {'suggestions': {enabled: true}},
        configurations: {'suggestions': {'config': {}}},
        models: {'suggestions': {Suggestion: {findAll: async () => [{messageID: 's1'}]}}}
    };
    await loadProtectedMessages(client);
    expect(client.protectedMessages).toBeUndefined();
});

test('starboard provider uses the StarMsg.starMsg id and the configured channel', async () => {
    require('../../modules/starboard/events/botReady');
    const client = {
        modules: {'starboard': {enabled: true}},
        configurations: {'starboard': {'config': {channelId: 'star-chan'}}},
        models: {
            'starboard': {
                StarMsg: {
                    findAll: async () => [{starMsg: 'sb1'}, {starMsg: 'sb2'}]
                }
            }
        }
    };
    await loadProtectedMessages(client);
    expect(isMessageProtected(client, 'star-chan', 'sb1')).toBe(true);
    expect(isMessageProtected(client, 'star-chan', 'sb2')).toBe(true);
});

test('a provider whose model query rejects is skipped without breaking others', async () => {
    require('../../modules/team-list/events/botReady');
    require('../../modules/starboard/events/botReady');
    const client = {
        modules: {
            'team-list': {enabled: true},
            'starboard': {enabled: true}
        },
        configurations: {'starboard': {'config': {channelId: 'star-chan'}}},
        models: {
            'team-list': {
                TeamListMessage: {
                    findAll: async () => {
                        throw new Error('db unavailable');
                    }
                }
            },
            'starboard': {StarMsg: {findAll: async () => [{starMsg: 'sb1'}]}}
        }
    };
    await loadProtectedMessages(client);
    // team-list threw, but starboard still got protected
    expect(isMessageProtected(client, 'star-chan', 'sb1')).toBe(true);
});
