/*
 * The "View Level Profile" context command is a thin adapter: it resolves the target member
 * and delegates to the shared sendProfile core from profile.js so its output is byte-for-byte
 * identical to /profile. These tests verify the delegation and member resolution.
 */
jest.mock('../../modules/levels/commands/profile', () => ({
    sendProfile: jest.fn().mockResolvedValue('rendered')
}));

const {sendProfile} = require('../../modules/levels/commands/profile');
const command = require('../../modules/levels/commands/view-profile');

beforeEach(() => sendProfile.mockClear());

describe('View Profile context command', () => {
    test('config: USER context, everyone (no permissions)', () => {
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toBeUndefined();
    });

    test('delegates to sendProfile with the resolved target member', async () => {
        const member = {user: {id: 'u1'}};
        const interaction = {
            targetUser: {id: 'u1'},
            targetMember: member
        };
        await command.run(interaction);
        expect(sendProfile).toHaveBeenCalledWith(interaction, member);
    });

    test('fetches the member when targetMember is missing (user left the guild cache)', async () => {
        const fetched = {user: {id: 'u2'}};
        const interaction = {
            targetUser: {id: 'u2'},
            targetMember: null,
            guild: {members: {fetch: jest.fn().mockResolvedValue(fetched)}}
        };
        await command.run(interaction);
        expect(interaction.guild.members.fetch).toHaveBeenCalledWith('u2');
        expect(sendProfile).toHaveBeenCalledWith(interaction, fetched);
    });
});