/*
 * The "View Balance" context command is a thin adapter: it sets the str/config the slash
 * subcommand would receive from beforeSubcommand, then delegates to the shared sendBalance core
 * so its output is byte-for-byte identical to /economy balance. These tests verify the
 * delegation, the target user, and the config wiring.
 */
jest.mock('../../modules/economy-system/commands/economy-system', () => ({
    sendBalance: jest.fn().mockResolvedValue('rendered')
}));

const {sendBalance} = require('../../modules/economy-system/commands/economy-system');
const command = require('../../modules/economy-system/commands/view-balance');

beforeEach(() => sendBalance.mockClear());

describe('View Balance context command', () => {
    test('config: USER context, everyone (no permissions)', () => {
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toBeUndefined();
    });

    test('delegates to sendBalance with the target user and wires str/config', async () => {
        const strings = {balanceReply: 'x'};
        const config = {publicCommandReplies: true};
        const interaction = {
            targetUser: {id: 'u1'},
            client: {
                configurations: {
                    'economy-system': {
                        strings,
                        config
                    }
                }
            }
        };
        await command.run(interaction);
        expect(interaction.str).toBe(strings);
        expect(interaction.config).toBe(config);
        expect(sendBalance).toHaveBeenCalledWith(interaction, interaction.targetUser);
    });
});