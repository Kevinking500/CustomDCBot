/*
 * The "Challenge to Connect Four" USER context command is a thin adapter: it reuses the
 * /connect-four run() unchanged by handing it the interaction with options.getMember('user')
 * overridden to the right-clicked target and field_size forced to its default, so the challenge
 * and game flow is identical against that user with the default board size.
 */
jest.mock('../../modules/connect-four/commands/connect-four', () => ({
    run: jest.fn().mockResolvedValue('started')
}));

const {
    allowingChannel,
    denyingChannel
} = require('../__helpers__/permissionChannel');
const connectFour = require('../../modules/connect-four/commands/connect-four');
const command = require('../../modules/connect-four/commands/challenge-to-connect-four');

beforeEach(() => connectFour.run.mockClear());

describe('Challenge to Connect Four context command', () => {
    test('config: USER context, everyone (no permissions)', () => {
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toBeUndefined();
    });

    test('delegates to run() with the target as opponent and the default field size', async () => {
        const targetMember = {user: {id: 'target'}};
        const interaction = {
            client: {id: 'client'},
            member: {id: 'invoker'},
            channel: allowingChannel(),
            targetMember,
            targetUser: {id: 'target'},
            options: {
                getMember: jest.fn().mockReturnValue({user: {id: 'other'}}),
                getInteger: jest.fn().mockReturnValue(10)
            }
        };
        await command.run(interaction);

        expect(connectFour.run).toHaveBeenCalledTimes(1);
        const proxy = connectFour.run.mock.calls[0][0];
        expect(proxy.options.getMember('user')).toBe(targetMember);
        // field_size resolves to null so run()'s `|| 7` default applies.
        expect(proxy.options.getInteger('field_size')).toBeNull();
        expect(proxy.client).toBe(interaction.client);
    });

    test('passes other option names through to the real interaction options', async () => {
        const interaction = {
            client: {},
            member: {id: 'invoker'},
            channel: allowingChannel(),
            targetMember: {user: {id: 'target'}},
            targetUser: {id: 'target'},
            options: {
                getMember: jest.fn().mockReturnValue({user: {id: 'other'}}),
                getInteger: jest.fn().mockReturnValue(3)
            }
        };
        await command.run(interaction);
        const proxy = connectFour.run.mock.calls[0][0];
        expect(proxy.options.getInteger('other')).toBe(3);
        expect(interaction.options.getInteger).toHaveBeenCalledWith('other');
    });

    test('replies ephemerally and does NOT start the game when the member cannot send', async () => {
        const interaction = {
            client: {},
            member: {id: 'invoker'},
            channel: denyingChannel(),
            targetMember: {user: {id: 'target'}},
            targetUser: {id: 'target'},
            options: {
                getMember: jest.fn(),
                getInteger: jest.fn()
            },
            reply: jest.fn().mockResolvedValue()
        };
        await command.run(interaction);

        expect(connectFour.run).not.toHaveBeenCalled();
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.ephemeral).toBe(true);
        expect(payload.content).toContain('command.no-send-permission');
    });
});