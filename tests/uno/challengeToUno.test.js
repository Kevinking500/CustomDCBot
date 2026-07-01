/*
 * The "Challenge to Uno" USER context command is a thin adapter. Uno's /uno run() opens an open
 * join-lobby and reads no opponent from options, so the adapter reuses run() unchanged to produce
 * the identical lobby, then pings the right-clicked target to invite them as the challenged player.
 */
jest.mock('../../modules/uno/commands/uno', () => ({
    run: jest.fn().mockResolvedValue('lobby')
}));

const {
    allowingChannel,
    denyingChannel
} = require('../__helpers__/permissionChannel');
const uno = require('../../modules/uno/commands/uno');
const command = require('../../modules/uno/commands/challenge-to-uno');

beforeEach(() => uno.run.mockClear());

function makeInteraction({
                             invokerId = 'host',
                             targetId = 'target',
                             canSend = true
                         } = {}) {
    return {
        user: {
            id: invokerId,
            toString: () => `<@${invokerId}>`
        },
        member: {id: invokerId},
        channel: canSend ? allowingChannel() : denyingChannel(),
        targetUser: {
            id: targetId,
            toString: () => `<@${targetId}>`
        },
        followUp: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue()
    };
}

describe('Challenge to Uno context command', () => {
    test('config: USER context, everyone (no permissions)', () => {
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toBeUndefined();
    });

    test('starts the same uno lobby and pings the target to invite them', async () => {
        const interaction = makeInteraction({
            invokerId: 'host',
            targetId: 'target'
        });
        await command.run(interaction);

        expect(uno.run).toHaveBeenCalledTimes(1);
        expect(uno.run).toHaveBeenCalledWith(interaction);
        expect(interaction.followUp).toHaveBeenCalledTimes(1);
        const followUp = interaction.followUp.mock.calls[0][0];
        expect(followUp.allowedMentions).toEqual({users: ['target']});
    });

    test('skips the invite ping when the user targets themselves', async () => {
        const interaction = makeInteraction({
            invokerId: 'host',
            targetId: 'host'
        });
        await command.run(interaction);

        expect(uno.run).toHaveBeenCalledWith(interaction);
        expect(interaction.followUp).not.toHaveBeenCalled();
    });

    test('replies ephemerally and does NOT start the lobby when the member cannot send', async () => {
        const interaction = makeInteraction({canSend: false});
        await command.run(interaction);

        expect(uno.run).not.toHaveBeenCalled();
        expect(interaction.followUp).not.toHaveBeenCalled();
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.ephemeral).toBe(true);
        expect(payload.content).toContain('command.no-send-permission');
    });
});