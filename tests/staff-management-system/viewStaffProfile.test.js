/*
 * The "View Staff Profile" USER context command is a thin adapter: it defers ephemerally (the
 * shared core responds via editReply) and hands off to handleProfileView, exactly like
 * /staff-management profile view, so the rendered profile is identical for the targeted user.
 */
jest.mock('../../modules/staff-management-system/commands/staff-management', () => ({
    handleProfileView: jest.fn().mockResolvedValue('rendered')
}));

const {MessageFlags} = require('discord.js');
const {handleProfileView} = require('../../modules/staff-management-system/commands/staff-management');
const command = require('../../modules/staff-management-system/commands/view-staff-profile');

beforeEach(() => handleProfileView.mockClear());

describe('View Staff Profile context command', () => {
    test('config: USER context, everyone (no permissions)', () => {
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toBeUndefined();
    });

    test('defers ephemerally then delegates to handleProfileView with the target user', async () => {
        const deferReply = jest.fn().mockResolvedValue();
        const interaction = {
            client: {id: 'client'},
            targetUser: {id: 'staff1'},
            deferReply
        };
        await command.run(interaction);
        expect(deferReply).toHaveBeenCalledWith({flags: MessageFlags.Ephemeral});
        expect(handleProfileView).toHaveBeenCalledWith(interaction.client, interaction, interaction.targetUser);
    });
});
