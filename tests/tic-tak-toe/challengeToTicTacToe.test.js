/*
 * The "Challenge to Tic Tac Toe" USER context command is a thin adapter: it reuses the
 * /tic-tac-toe run() unchanged by handing it the interaction with options.getMember('user')
 * overridden to return the right-clicked target, so the challenge and game flow is identical.
 */
jest.mock('../../modules/tic-tak-toe/commands/tic-tac-toe', () => ({
    run: jest.fn().mockResolvedValue('started')
}));

const {
    allowingChannel,
    denyingChannel
} = require('../__helpers__/permissionChannel');
const ticTacToe = require('../../modules/tic-tak-toe/commands/tic-tac-toe');
const command = require('../../modules/tic-tak-toe/commands/challenge-to-tic-tac-toe');

beforeEach(() => ticTacToe.run.mockClear());

describe('Challenge to Tic Tac Toe context command', () => {
    test('config: USER context, everyone (no permissions)', () => {
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toBeUndefined();
    });

    test('delegates to run() with the target resolved as the opponent', async () => {
        const targetMember = {user: {id: 'target'}};
        const interaction = {
            client: {id: 'client'},
            member: {id: 'invoker'},
            channel: allowingChannel(),
            targetMember,
            targetUser: {id: 'target'},
            options: {getMember: jest.fn().mockReturnValue({user: {id: 'other'}})}
        };
        await command.run(interaction);

        expect(ticTacToe.run).toHaveBeenCalledTimes(1);
        const proxy = ticTacToe.run.mock.calls[0][0];
        expect(proxy.options.getMember('user')).toBe(targetMember);
        expect(proxy.client).toBe(interaction.client);
    });

    test('passes other option names through to the real interaction options', async () => {
        const interaction = {
            client: {},
            member: {id: 'invoker'},
            channel: allowingChannel(),
            targetMember: {user: {id: 'target'}},
            targetUser: {id: 'target'},
            options: {getMember: jest.fn().mockReturnValue({user: {id: 'other'}})}
        };
        await command.run(interaction);
        const proxy = ticTacToe.run.mock.calls[0][0];
        expect(proxy.options.getMember('somethingElse')).toEqual({user: {id: 'other'}});
        expect(interaction.options.getMember).toHaveBeenCalledWith('somethingElse');
    });

    test('replies ephemerally and does NOT start the game when the member cannot send', async () => {
        const interaction = {
            client: {},
            member: {id: 'invoker'},
            channel: denyingChannel(),
            targetMember: {user: {id: 'target'}},
            targetUser: {id: 'target'},
            options: {getMember: jest.fn()},
            reply: jest.fn().mockResolvedValue()
        };
        await command.run(interaction);

        expect(ticTacToe.run).not.toHaveBeenCalled();
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.ephemeral).toBe(true);
        expect(payload.content).toContain('command.no-send-permission');
    });
});