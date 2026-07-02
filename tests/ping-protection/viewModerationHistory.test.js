/*
 * The "View Moderation History" USER context command is a thin adapter: it reuses the exact
 * payload generateActionsResponse produces for /ping-protection user actions-history and replies
 * ephemerally, so the output is identical for the targeted user. These tests verify the delegation.
 */
jest.mock('../../modules/ping-protection/ping-protection', () => ({
    generateHistoryResponse: jest.fn(),
    generateActionsResponse: jest.fn().mockResolvedValue({
        embeds: ['E'],
        components: ['C']
    })
}));

const {MessageFlags} = require('discord.js');
const {generateActionsResponse} = require('../../modules/ping-protection/ping-protection');
const command = require('../../modules/ping-protection/commands/view-moderation-history');

beforeEach(() => generateActionsResponse.mockClear());

describe('View Moderation History context command', () => {
    test('config: USER context, staff-gated', () => {
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toEqual(['MODERATE_MEMBERS']);
    });

    test('reuses generateActionsResponse for the target and replies ephemerally with its payload', async () => {
        const reply = jest.fn().mockResolvedValue('ok');
        const interaction = {
            client: {id: 'client'},
            targetUser: {id: 'victim'},
            reply
        };
        await command.run(interaction);
        expect(generateActionsResponse).toHaveBeenCalledWith(interaction.client, 'victim', 1);
        expect(reply).toHaveBeenCalledWith({
            embeds: ['E'],
            components: ['C'],
            flags: MessageFlags.Ephemeral
        });
    });
});