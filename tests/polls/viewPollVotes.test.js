/*
 * Tests for the "View Poll Votes" MESSAGE context-menu command
 * (modules/polls/commands/view-poll-votes.js).
 *
 * The command resolves the poll from the right-clicked message (Poll.messageID === targetMessage.id)
 * and renders the per-option voter list with the shared buildPublicVotesEmbed (the same embed the
 * polls-public-votes button uses). It replies ephemerally, and ephemerally errors when the message
 * is not a poll. polls.js is mocked so we assert on delegation, not embed formatting.
 */
jest.mock('../../src/functions/localize', () => ({localize: (file, key) => `${file}.${key}`}));
jest.mock('../../modules/polls/polls', () => ({
    buildPublicVotesEmbed: jest.fn(() => ({mock: 'embed'}))
}));

const {buildPublicVotesEmbed} = require('../../modules/polls/polls');
const command = require('../../modules/polls/commands/view-poll-votes');

function makeInteraction({
                             poll = {messageID: 'm1'},
                             targetId = 'm1'
                         } = {}) {
    return {
        targetMessage: {id: targetId},
        client: {
            models: {polls: {Poll: {findOne: jest.fn().mockResolvedValue(poll)}}}
        },
        reply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => buildPublicVotesEmbed.mockClear());

describe('View Poll Votes context command', () => {
    test('config is an Everyone MESSAGE context command', () => {
        expect(command.config.name).toBe('View Poll Votes');
        expect(command.config.type).toBe('MESSAGE');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toBeUndefined();
        expect(command.config.options).toBeUndefined();
    });

    test('looks the poll up by the target message id and renders via buildPublicVotesEmbed (ephemeral)', async () => {
        const poll = {messageID: 'm1'};
        const interaction = makeInteraction({
            poll,
            targetId: 'm1'
        });
        await command.run(interaction);

        expect(interaction.client.models.polls.Poll.findOne).toHaveBeenCalledWith({where: {messageID: 'm1'}});
        expect(buildPublicVotesEmbed).toHaveBeenCalledWith(interaction, poll);
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.ephemeral).toBe(true);
        expect(payload.embeds).toEqual([{mock: 'embed'}]);
    });

    test('errors ephemerally when the message is not a poll', async () => {
        const interaction = makeInteraction({poll: null});
        await command.run(interaction);
        expect(buildPublicVotesEmbed).not.toHaveBeenCalled();
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.ephemeral).toBe(true);
        expect(payload.content).toContain('polls.not-a-poll');
    });
});