/*
 * The "View Ping History" USER context command is a thin adapter: it reuses the exact payload
 * generateHistoryResponse produces for /ping-protection user history and replies ephemerally,
 * so the output is identical for the targeted user. These tests verify the delegation.
 */
jest.mock('../../modules/ping-protection/ping-protection', () => ({
    generateHistoryResponse: jest.fn().mockResolvedValue({
        embeds: ['E'],
        components: ['C']
    }),
    generateActionsResponse: jest.fn()
}));

const {MessageFlags} = require('discord.js');
const {generateHistoryResponse} = require('../../modules/ping-protection/ping-protection');
const command = require('../../modules/ping-protection/commands/view-ping-history');

beforeEach(() => generateHistoryResponse.mockClear());

describe('View Ping History context command', () => {
    test('config: USER context, staff-gated', () => {
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toEqual(['MODERATE_MEMBERS']);
    });

    test('reuses generateHistoryResponse for the target and replies ephemerally with its payload', async () => {
        const reply = jest.fn().mockResolvedValue('ok');
        const interaction = {
            client: {id: 'client'},
            targetUser: {id: 'victim'},
            reply
        };
        await command.run(interaction);
        expect(generateHistoryResponse).toHaveBeenCalledWith(interaction.client, 'victim', 1);
        expect(reply).toHaveBeenCalledWith({
            embeds: ['E'],
            components: ['C'],
            flags: MessageFlags.Ephemeral
        });
    });
});