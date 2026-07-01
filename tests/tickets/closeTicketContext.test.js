/*
 * The "Close Ticket" MESSAGE context command is a thin adapter over the shared closeTicket()
 * core in events/interactionCreate.js. It resolves the open Ticket for the message's channel
 * and delegates; if the channel is not an open ticket channel it replies ephemerally and does
 * not close anything. The description localize key is not asserted.
 */
jest.mock('../../src/functions/localize', () => ({localize: (file, key) => `${file}.${key}`}));
jest.mock('../../modules/tickets/events/interactionCreate', () => ({
    closeTicket: jest.fn().mockResolvedValue('closed'),
    createTicket: jest.fn()
}));

const {closeTicket} = require('../../modules/tickets/events/interactionCreate');
const command = require('../../modules/tickets/commands/close-ticket');

function makeInteraction({ticket = null} = {}) {
    return {
        channel: {id: 'chan1'},
        client: {
            models: {tickets: {Ticket: {findOne: jest.fn().mockResolvedValue(ticket)}}},
            configurations: {tickets: {config: [{name: 'Support'}]}}
        },
        reply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => closeTicket.mockClear());

describe('Close Ticket context command', () => {
    test('config: MESSAGE context, staff (MANAGE_CHANNELS)', () => {
        expect(command.config.name).toBe('Close Ticket');
        expect(command.config.type).toBe('MESSAGE');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toEqual(['MANAGE_CHANNELS']);
    });

    test('replies ephemerally and does not close when not a ticket channel', async () => {
        const interaction = makeInteraction();
        await command.run(interaction);
        expect(closeTicket).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
    });

    test('delegates to closeTicket with the resolved ticket and config element', async () => {
        const ticket = {
            type: 0,
            open: true
        };
        const interaction = makeInteraction({ticket});
        await command.run(interaction);
        expect(closeTicket).toHaveBeenCalledWith(
            interaction.client, interaction, ticket, interaction.client.configurations.tickets.config[0]
        );
    });
});