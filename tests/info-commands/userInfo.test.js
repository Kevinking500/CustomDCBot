/*
 * The "User Info" context command is a thin adapter: it defers the reply (the slash subcommand
 * gets this from beforeSubcommand) then delegates to the shared sendUserInfo core so its output is
 * byte-for-byte identical to /info user. These tests verify the deferral, member resolution and
 * delegation.
 */
jest.mock('../../modules/info-commands/commands/info', () => ({
    sendUserInfo: jest.fn().mockResolvedValue('rendered')
}));

const {sendUserInfo} = require('../../modules/info-commands/commands/info');
const command = require('../../modules/info-commands/commands/user-info');

beforeEach(() => sendUserInfo.mockClear());

describe('User Info context command', () => {
    test('config: USER context, everyone (no permissions)', () => {
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toBeUndefined();
    });

    test('defers ephemerally and delegates to sendUserInfo with the target member', async () => {
        const member = {user: {id: 'u1'}};
        const interaction = {
            targetUser: {id: 'u1'},
            targetMember: member,
            deferReply: jest.fn().mockResolvedValue()
        };
        await command.run(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({ephemeral: true});
        expect(sendUserInfo).toHaveBeenCalledWith(interaction, member);
    });

    test('fetches the member when targetMember is missing', async () => {
        const fetched = {user: {id: 'u2'}};
        const interaction = {
            targetUser: {id: 'u2'},
            targetMember: null,
            deferReply: jest.fn().mockResolvedValue(),
            guild: {members: {fetch: jest.fn().mockResolvedValue(fetched)}}
        };
        await command.run(interaction);
        expect(interaction.guild.members.fetch).toHaveBeenCalledWith('u2');
        expect(sendUserInfo).toHaveBeenCalledWith(interaction, fetched);
    });
});
