/*
 * Tests for the channel-publishing side effects in economy-system.js:
 *   createLeaderboard / shopMsg each keep ONE persistent message, tracked by id in
 *   the economy-system `LiveMessage` model (keyed by type: 'leaderboard' | 'shop').
 *   They fetch their own stored message and edit it, or send + store a fresh one.
 *   Targeting by stored id (instead of "the last bot message in the channel") is
 *   what stops the leaderboard from editing the shop message - and vice versa -
 *   when both are configured to the same channel (bug #cmqq4r), which would throw
 *   MESSAGE_CANNOT_USE_LEGACY_FIELDS_WITH_COMPONENTS_V2 if the shop uses the
 *   Components V2 editor.
 * The Discord client, channel and the LiveMessage model are mocked.
 */
const eco = require('../../modules/economy-system/economy-system');
const {isMessageProtected} = require('../../src/functions/protectedMessages');

/*
 * In-memory stand-in for the LiveMessage table: one row per `type`, with a
 * working save() that persists channelID/messageID onto the row object.
 */
function makeLiveMessageModel() {
    const rows = {};
    return {
        rows,
        findOrCreate: jest.fn(async ({
                                         where,
                                         defaults
                                     }) => {
            const type = where.type;
            if (!rows[type]) {
                rows[type] = {
                    channelID: null,
                    messageID: null,
                    ...defaults,
                    save: jest.fn(async () => {
                    })
                };
                return [rows[type], true];
            }
            return [rows[type], false];
        })
    };
}

/*
 * A channel that stores sent messages by id so messages.fetch(id) can return the
 * same object later (mimicking Discord retaining the message we created).
 */
function makeChannel(id = 'chan') {
    const store = {};
    let counter = 0;
    return {
        id,
        store,
        guild: {
            roles: {fetch: jest.fn().mockResolvedValue({members: {size: 0}})}
        },
        messages: {
            fetch: jest.fn(async (mid) => {
                if (store[mid]) return store[mid];
                throw new Error('Unknown Message');
            })
        },
        send: jest.fn(async (payload) => {
            counter++;
            const msg = {
                id: `m${counter}`,
                url: `https://discord/${counter}`,
                payload,
                edit: jest.fn(async () => {
                })
            };
            store[msg.id] = msg;
            return msg;
        })
    };
}

function makeClient({
                        leaderboardChannel = '',
                        shopChannel = '',
                        channel = null,
                        balanceRows = [],
                        shopItems = [],
                        liveMessage = makeLiveMessageModel()
                    } = {}) {
    return {
        user: {
            id: 'bot',
            username: 'Bot',
            avatarURL: () => 'https://cdn.example.com/a.png'
        },
        strings: {
            footer: 'f',
            disableFooterTimestamp: false
        },
        logger: {
            fatal: jest.fn(),
            error: jest.fn(),
            info: jest.fn()
        },
        configurations: {
            'economy-system': {
                config: {
                    leaderboardChannel,
                    shopChannel,
                    currencySymbol: '$',
                    startMoney: 0
                },
                strings: {
                    leaderboardEmbed: {
                        title: 'T',
                        description: 'D',
                        color: 'GREEN',
                        thumbnail: '',
                        image: ''
                    },
                    itemString: '%itemName%',
                    shopMsg: 'SHOP %shopItems%'
                }
            }
        },
        protectedMessages: new Map(),
        channels: {fetch: jest.fn().mockResolvedValue(channel)},
        models: {
            'economy-system': {
                Balance: {findAll: jest.fn().mockResolvedValue(balanceRows)},
                Shop: {findAll: jest.fn().mockResolvedValue(shopItems)},
                LiveMessage: liveMessage
            }
        }
    };
}

describe('createLeaderboard', () => {
    test('does nothing when no leaderboard channel is configured', async () => {
        const client = makeClient({leaderboardChannel: ''});
        await eco.createLeaderboard(client);
        expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    test('logs fatal and bails when the channel cannot be fetched', async () => {
        const client = makeClient({
            leaderboardChannel: 'lb',
            channel: null
        });
        await eco.createLeaderboard(client);
        expect(client.logger.fatal).toHaveBeenCalled();
    });

    test('sends a fresh embed and stores its id when none is tracked yet', async () => {
        const channel = makeChannel('lb');
        const client = makeClient({
            leaderboardChannel: 'lb',
            channel
        });
        await eco.createLeaderboard(client);
        expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({embeds: expect.any(Array)}));
        const row = client.models['economy-system'].LiveMessage.rows.leaderboard;
        expect(row.channelID).toBe('lb');
        expect(row.messageID).toBe('m1');
        // Persistent message must be shielded from auto-delete.
        expect(isMessageProtected(client, 'lb', 'm1')).toBe(true);
    });

    test('edits the tracked leaderboard message instead of fetching the last bot message', async () => {
        const channel = makeChannel('lb');
        const liveMessage = makeLiveMessageModel();
        liveMessage.rows.leaderboard = {
            channelID: 'lb',
            messageID: 'existing',
            save: jest.fn(async () => {
            })
        };
        channel.store.existing = {
            id: 'existing',
            edit: jest.fn(async () => {
            })
        };
        const client = makeClient({
            leaderboardChannel: 'lb',
            channel,
            liveMessage
        });
        await eco.createLeaderboard(client);
        expect(channel.messages.fetch).toHaveBeenCalledWith('existing');
        expect(channel.store.existing.edit).toHaveBeenCalled();
        expect(channel.send).not.toHaveBeenCalled();
    });
});

describe('shopMsg', () => {
    test('does nothing without a shop channel', async () => {
        const client = makeClient({shopChannel: ''});
        await eco.shopMsg(client);
        expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    test('logs an error instead of throwing when the shop channel cannot be fetched', async () => {
        const client = makeClient({
            shopChannel: 'sc',
            channel: null
        });
        await expect(eco.shopMsg(client)).resolves.toBeUndefined();
        expect(client.logger.error).toHaveBeenCalled();
    });

    test('sends a fresh shop message and stores its id when none is tracked yet', async () => {
        const channel = makeChannel('sc');
        const client = makeClient({
            shopChannel: 'sc',
            channel,
            shopItems: []
        });
        await eco.shopMsg(client);
        expect(channel.send).toHaveBeenCalled();
        const row = client.models['economy-system'].LiveMessage.rows.shop;
        expect(row.channelID).toBe('sc');
        expect(row.messageID).toBe('m1');
        expect(isMessageProtected(client, 'sc', 'm1')).toBe(true);
    });

    test('edits the tracked shop message when present', async () => {
        const channel = makeChannel('sc');
        const liveMessage = makeLiveMessageModel();
        liveMessage.rows.shop = {
            channelID: 'sc',
            messageID: 'existing',
            save: jest.fn(async () => {
            })
        };
        channel.store.existing = {
            id: 'existing',
            edit: jest.fn(async () => {
            })
        };
        const client = makeClient({
            shopChannel: 'sc',
            channel,
            liveMessage
        });
        await eco.shopMsg(client);
        expect(channel.messages.fetch).toHaveBeenCalledWith('existing');
        expect(channel.store.existing.edit).toHaveBeenCalled();
        expect(channel.send).not.toHaveBeenCalled();
    });
});

describe('shared channel (bug #cmqq4r)', () => {
    test('leaderboard and shop keep separate messages in one shared channel', async () => {
        const channel = makeChannel('shared');
        const liveMessage = makeLiveMessageModel();

        /*
         * Shop and leaderboard both point at the same channel - the exact misconfig
         * from the report. Each must own its own message id and never edit the other.
         */
        const client = makeClient({
            shopChannel: 'shared',
            leaderboardChannel: 'shared',
            channel,
            liveMessage,
            shopItems: []
        });

        // First boot: both create their own message.
        await eco.shopMsg(client);
        await eco.createLeaderboard(client);

        const shopId = liveMessage.rows.shop.messageID;
        const lbId = liveMessage.rows.leaderboard.messageID;
        expect(shopId).toBeTruthy();
        expect(lbId).toBeTruthy();
        expect(shopId).not.toBe(lbId);

        /*
         * Subsequent update: the leaderboard edits ONLY its own message, never the
         * shop message (which, with the Components V2 editor, would throw 50035).
         */
        await eco.createLeaderboard(client);
        expect(channel.store[lbId].edit).toHaveBeenCalled();
        expect(channel.store[shopId].edit).not.toHaveBeenCalled();
    });

    test('concurrent leaderboard updates create a single message, not a duplicate', async () => {
        const channel = makeChannel('lb');
        const client = makeClient({
            leaderboardChannel: 'lb',
            channel
        });

        /*
         * leaderboard() is fired on every balance change and calls can overlap (e.g.
         * editBank 'deposit'). Without serialization, two concurrent first-run calls
         * both find no tracked message and both send(), orphaning one. Updates for a
         * given type must be serialized so the second call edits what the first sent.
         */
        await Promise.all([eco.createLeaderboard(client), eco.createLeaderboard(client)]);
        expect(channel.send).toHaveBeenCalledTimes(1);
        expect(channel.store.m1.edit).toHaveBeenCalledTimes(1);
    });
});