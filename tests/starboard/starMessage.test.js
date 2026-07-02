/*
 * Tests for the "Star Message" MESSAGE context-menu command
 * (modules/starboard/commands/star-message.js).
 *
 * The command force-stars the right-clicked message by reusing handleStarboard() with
 * {force: true}, synthesizing the minimal msgReaction handleStarboard reads (the configured emoji,
 * a count, and a no-op users stub). handleStarboard is mocked so we assert the delegation and the
 * force flag, not the starboard posting logic.
 */
jest.mock('../../src/functions/localize', () => ({localize: (file, key) => `${file}.${key}`}));
jest.mock('../../modules/starboard/handleStarboard.js', () => jest.fn().mockResolvedValue());

const handleStarboard = require('../../modules/starboard/handleStarboard.js');
const command = require('../../modules/starboard/commands/star-message');

function makeInteraction({
                             config = {
                                 emoji: '⭐',
                                 minStars: 3
                             }
                         } = {}) {
    return {
        targetMessage: {id: 'tm1'},
        user: {id: 'staff1'},
        client: {
            configurations: {starboard: {config}}
        },
        reply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => handleStarboard.mockClear());

describe('Star Message context command', () => {
    test('config is an Everyone MESSAGE context command', () => {
        expect(command.config.name).toBe('Star Message');
        expect(command.config.type).toBe('MESSAGE');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toBeUndefined();
    });

    test('delegates to handleStarboard with a forced synthetic reaction and confirms', async () => {
        const interaction = makeInteraction();
        await command.run(interaction);

        expect(handleStarboard).toHaveBeenCalledTimes(1);
        const [client, msgReaction, user, isReactionRemove, options] = handleStarboard.mock.calls[0];
        expect(client).toBe(interaction.client);
        expect(msgReaction.message).toBe(interaction.targetMessage);
        expect(msgReaction.emoji.toString()).toBe('⭐');
        expect(msgReaction.count).toBe(3);
        expect(user).toBe(interaction.user);
        expect(isReactionRemove).toBe(false);
        expect(options).toEqual({force: true});

        // The synthesized users stub must be safe to call.
        await expect(msgReaction.users.remove()).resolves.toBeUndefined();
        expect(msgReaction.users.cache.has()).toBe(false);

        expect(interaction.reply.mock.calls[0][0].ephemeral).toBe(true);
    });

    test('falls back to count 1 when minStars is not a number', async () => {
        const interaction = makeInteraction({
            config: {
                emoji: '⭐',
                minStars: 'abc'
            }
        });
        await command.run(interaction);
        expect(handleStarboard.mock.calls[0][1].count).toBe(1);
    });
});