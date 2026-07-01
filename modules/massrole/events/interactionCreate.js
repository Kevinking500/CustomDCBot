const {localize} = require('../../../src/functions/localize');
const {applyRoleToMember} = require('../commands/massrole');

/*
 * Handles the role-select reply from the "Add Role to User" / "Remove Role from User" USER
 * context commands. customId is massrole-ctx:<add|remove>:<userId>. We re-check the slash
 * adminRoles guard, resolve the single target member and selected role, then call the shared
 * applyRoleToMember core so the result matches the massrole slash command.
 */
module.exports.run = async function (client, interaction) {
    if (!interaction.isRoleSelectMenu() || !interaction.customId.startsWith('massrole-ctx:')) return;
    if (interaction.guild.id !== client.guild.id) return;

    if (interaction.member.roles.cache.filter(m => client.configurations['massrole']['config'].adminRoles.includes(m.id)).size === 0) {
        return interaction.reply({
            ephemeral: true,
            content: localize('massrole', 'not-admin')
        });
    }

    const parts = interaction.customId.split(':');
    const action = parts[1];
    const targetId = parts[2];

    const member = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!member) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('massrole', 'context-target-not-found')
    });

    const role = interaction.roles.first() || interaction.guild.roles.cache.get(interaction.values[0]);
    if (!role) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('massrole', 'context-role-not-found')
    });

    return applyRoleToMember(interaction, member, role, action);
};