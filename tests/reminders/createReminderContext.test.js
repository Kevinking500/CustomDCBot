/*
 * The "Create Reminder" MESSAGE context command opens a modal collecting WHEN. showModal must
 * be the first response, so it must NOT defer first. The modal customId encodes the targeted
 * message (channel + message id) so the modal-submit handler can reconstruct it and run the
 * existing planReminder() flow. The description localize key is not asserted.
 */
jest.mock('../../src/functions/localize', () => ({localize: (file, key) => `${file}.${key}`}));

const {
    allowingChannel,
    denyingChannel
} = require('../__helpers__/permissionChannel');
const command = require('../../modules/reminders/commands/create-reminder');

function makeInteraction({canSend = true} = {}) {
    return {
        channelId: 'chan1',
        channel: canSend ? allowingChannel() : denyingChannel(),
        member: {id: 'u1'},
        targetMessage: {
            id: 'm1',
            url: 'https://discord.com/channels/g/c/m1'
        },
        showModal: jest.fn().mockResolvedValue(),
        deferReply: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue()
    };
}

describe('Create Reminder context command', () => {
    test('config: MESSAGE context, everyone (no permissions)', () => {
        expect(command.config.name).toBe('Create Reminder');
        expect(command.config.type).toBe('MESSAGE');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toBeUndefined();
    });

    test('opens a modal encoding channel + message id and does not defer', async () => {
        const interaction = makeInteraction();
        await command.run(interaction);

        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(interaction.showModal).toHaveBeenCalledTimes(1);

        const json = interaction.showModal.mock.calls[0][0].toJSON();
        expect(json.custom_id).toBe('create-reminder:chan1:m1');
        const input = json.components[0].components[0];
        expect(input.custom_id).toBe('in');
        expect(input.required).toBe(true);
    });

    test('replies ephemerally and does NOT open the modal when the member cannot send', async () => {
        const interaction = makeInteraction({canSend: false});
        await command.run(interaction);

        expect(interaction.showModal).not.toHaveBeenCalled();
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.ephemeral).toBe(true);
        expect(payload.content).toContain('command.no-send-permission');
    });
});