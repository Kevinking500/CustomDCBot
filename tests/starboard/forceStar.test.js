/*
 * Tests for the {force: true} path added to handleStarboard for the "Star Message" context
 * command. force must bypass the self-star removal, the per-hour rate limit, and the minStars
 * threshold, so a forced star always posts the message to the starboard even below threshold and
 * even for the author's own message.
 */
jest.mock('../../src/functions/helpers', () => ({
    embedTypeV2: jest.fn().mockResolvedValue({content: 'rendered'}),
    disableModule: jest.fn(),
    formatDiscordUserName: (u) => (u && u.tag) || 'user',
    archiveDiscordAttachment: jest.fn().mockResolvedValue(null)
}));

const handleStarboard = require('../../modules/starboard/handleStarboard');

function makeStarConfig(overrides = {}) {
    return {
        emoji: '⭐',
        minStars: 5,
        starsPerHour: 1,
        selfStar: false,
        channelId: 'starboard-chan',
        excludedChannels: [],
        excludedRoles: [],
        message: 'cfg-message',
        ...overrides
    };
}

function makeMsg() {
    return {
        id: 'msg1',
        guild: {id: 'g1'},
        partial: false,
        url: 'https://discord/msg1',
        content: '',
        channel: {
            id: 'src-chan',
            name: 'general',
            nsfw: false
        },
        author: {
            id: 'author1',
            username: 'Author',
            tag: 'Author#1'
        },
        member: {
            displayName: 'Author',
            displayAvatarURL: () => 'avatar',
            roles: {cache: {has: () => false}}
        },
        attachments: {
            size: 0,
            first: () => null
        }
    };
}

function makeReaction(msg) {
    return {
        message: msg,
        partial: false,
        count: 1,
        emoji: {toString: () => '⭐'},
        users: {
            remove: jest.fn().mockResolvedValue(),
            cache: {has: () => false}
        }
    };
}

function makeClient(starConfig) {
    const channel = {
        nsfw: false,
        send: jest.fn().mockResolvedValue({id: 'posted'}),
        messages: {fetch: jest.fn().mockResolvedValue(null)}
    };
    return {
        botReadyAt: Date.now(),
        guildID: 'g1',
        channels: {cache: {get: (id) => (id === starConfig.channelId ? channel : null)}},
        configurations: {starboard: {config: starConfig}},
        models: {
            starboard: {
                StarUser: {
                    findAll: jest.fn().mockResolvedValue([{dataValues: {createdAt: Date.now()}}]),
                    create: jest.fn().mockResolvedValue()
                },
                StarMsg: {
                    findOne: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue(),
                    destroy: jest.fn().mockResolvedValue()
                }
            }
        },
        boardChannel: channel
    };
}

test('force posts to the starboard even below minStars, bypassing the rate limit and self-star', async () => {
    const cfg = makeStarConfig();
    const client = makeClient(cfg);
    const reaction = makeReaction(makeMsg());
    // user is the author (self-star) and the hourly limit is already reached and count < minStars.
    await handleStarboard(client, reaction, {
        id: 'author1',
        send: jest.fn()
    }, false, {force: true});

    expect(reaction.users.remove).not.toHaveBeenCalled();
    expect(client.models.starboard.StarUser.create).not.toHaveBeenCalled();
    expect(client.boardChannel.send).toHaveBeenCalledWith({content: 'rendered'});
    expect(client.models.starboard.StarMsg.create).toHaveBeenCalledWith(expect.objectContaining({
        msgId: 'msg1',
        starMsg: 'posted'
    }));
});