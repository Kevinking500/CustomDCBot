/*
 * Integration + reload coverage for auto-delete's use of the protected-messages
 * registry.
 *
 * auto-delete/events/botReady.js calls loadProtectedMessages(client) BEFORE its
 * startup sweep, so every persistent-message module's DB-backed ids are protected
 * before anything is deleted. These tests drive the real botReady against a fake
 * channel and assert:
 *   - a provider-supplied id is excluded from the startup bulkDelete
 *   - RELOAD: botReady is re-emitted on every config reload; running it twice must
 *     keep protecting, and a runtime-only protection (no provider, e.g. a sticky
 *     message whose state lives only in memory) MUST survive the second run -
 *     i.e. loadProtectedMessages is additive and never clears the registry.
 *
 * localize/main are auto-stubbed via the jest moduleNameMapper.
 */

const {Collection} = require('discord.js');
const botReady = require('../../modules/auto-delete/events/botReady');
const {
    protectMessage,
    registerProtectedMessageProvider,
    clearProtectedMessageProviders
} = require('../../src/functions/protectedMessages');

afterEach(() => clearProtectedMessageProviders());

function msg(id, {pinned = false, deletable = true} = {}) {
    return {
        id,
        pinned,
        deletable,
        createdAt: new Date()
    };
}

function makeTextChannel(messages) {
    const coll = new Collection();
    messages.forEach(m => coll.set(m.id, m));
    return {
        name: 'general',
        messages: {fetch: jest.fn().mockResolvedValue(coll)},
        bulkDelete: jest.fn().mockResolvedValue()
    };
}

function makeClient(channel) {
    return {
        configurations: {
            'auto-delete': {
                channels: [{
                    channelID: 'c1',
                    keepMessageCount: '0'
                }],
                'voice-channels': []
            }
        },
        modules: {'auto-delete': {}},
        channels: {fetch: jest.fn().mockResolvedValue(channel)},
        logger: {error: jest.fn()}
    };
}

function deletedIds(channel, call = 0) {
    return [...channel.bulkDelete.mock.calls[call][0].values()].map(m => m.id);
}

test('a provider-supplied id is loaded and excluded from the startup sweep', async () => {
    registerProtectedMessageProvider(() => [{
        channelId: 'c1',
        messageId: 'panel'
    }]);
    const channel = makeTextChannel([msg('chatter'), msg('panel')]);
    const client = makeClient(channel);

    await botReady.run(client);

    expect(deletedIds(channel)).toEqual(['chatter']);
});

test('RELOAD: re-running botReady keeps protecting, and runtime-only protection survives', async () => {
    // a sticky-style message protected at runtime, with NO provider backing it
    const channel = makeTextChannel([msg('chatter'), msg('sticky')]);
    const client = makeClient(channel);
    protectMessage(client, 'c1', 'sticky');

    // first boot
    await botReady.run(client);
    expect(deletedIds(channel, 0)).toEqual(['chatter']);

    // second botReady (config reload): runtime-only 'sticky' protection must survive.
    await botReady.run(client);
    expect(deletedIds(channel, 1)).toEqual(['chatter']);
});
