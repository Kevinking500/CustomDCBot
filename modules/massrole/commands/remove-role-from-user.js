const {localize} = require('../../../src/functions/localize');
const {
    ActionRowBuilder,
    RoleSelectMenuBuilder
} = require('discord.js');

module.exports.config = {
    name: 'Remove Role from User',
    type: 'USER',
    contextMenu: true,
    defaultMemberPermissions: ['ADMINISTRATOR'],
    description: localize('massrole', 'remove-role-from-user-context-description')
};

/*
 * Thin adapter for the massrole remove logic, applied to a SINGLE target member. Discord modals
 * cannot contain select menus, so we reply ephemerally with a role select whose customId encodes
 * the action + target user id (massrole-ctx:remove:<userId>). The select is handled in
 * events/interactionCreate.js, which calls the shared applyRoleToMember core.
 */
module.exports.run = async function (interaction) {
    if (interaction.member.roles.cache.filter(m => interaction.client.configurations['massrole']['config'].adminRoles.includes(m.id)).size === 0) {
        return interaction.reply({
            ephemeral: true,
            content: localize('massrole', 'not-admin')
        });
    }
    return interaction.reply({
        ephemeral: true,
        content: localize('massrole', 'remove-role-from-user-context-prompt'),
        components: [
            new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId(`massrole-ctx:remove:${interaction.targetUser.id}`)
                    .setPlaceholder(localize('massrole', 'role-option-remove-description'))
                    .setMinValues(1)
                    .setMaxValues(1)
            )
        ]
    });
};