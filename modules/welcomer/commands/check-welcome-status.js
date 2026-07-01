const {localize} = require('../../../src/functions/localize');
const {
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const {
    isInHoldingState,
    evaluateMember
} = require('../baseRoles');

module.exports.config = {
    name: 'Check Welcome Status',
    type: 'USER',
    contextMenu: true,
    defaultMemberPermissions: ['MANAGE_GUILD'],
    description: localize('welcomer', 'check-welcome-status-context-description')
};

/*
 * Staff-only (MANAGE_GUILD) read-only adapter: reports a member's welcomer state using the same
 * primitives the automatic base-role sync uses. isInHoldingState() decides whether the member is
 * currently withheld from welcome roles (pending onboarding, quarantine, join-gate hold, etc.),
 * and evaluateMember() reports which configured join roles the member is missing - identical
 * logic to runSync(), surfaced as an ephemeral embed instead of mutating roles.
 */
module.exports.run = async function (interaction) {
    await interaction.deferReply({flags: MessageFlags.Ephemeral});
    const client = interaction.client;
    const target = interaction.targetMember || await interaction.guild.members.fetch(interaction.targetUser.id).catch(() => null);
    if (!target) return interaction.editReply({content: '⚠️ ' + localize('welcomer', 'status-no-member')});

    const welcomerConfig = client.configurations['welcomer']['config'];
    const joinRoleIDs = welcomerConfig['give-roles-on-join'] || [];
    const holding = await isInHoldingState(target, client);
    const {
        skip,
        missingRoleIDs
    } = await evaluateMember(target, client);

    function formatRoles(ids) {
        if (!ids.length) return localize('welcomer', 'status-none');
        return ids.map(id => `<@&${id}>`).join(', ');
    }

    let color = 0x57F287;
    if (holding) color = 0xED4245;
    else if (missingRoleIDs.length) color = 0xFEE75C;

    const embed = new EmbedBuilder()
        .setTitle(localize('welcomer', 'status-title'))
        .setColor(color)
        .setDescription(localize('welcomer', 'status-for', {u: target.user.toString()}))
        .addFields(
            {
                name: localize('welcomer', 'status-holding'),
                value: holding ? localize('welcomer', 'status-yes') : localize('welcomer', 'status-no'),
                inline: true
            },
            {
                name: localize('welcomer', 'status-base-roles'),
                value: welcomerConfig['treat-welcome-roles-as-base-roles'] ? localize('welcomer', 'status-yes') : localize('welcomer', 'status-no'),
                inline: true
            },
            {
                name: localize('welcomer', 'status-join-roles'),
                value: formatRoles(joinRoleIDs)
            },
            {
                name: localize('welcomer', 'status-missing-roles'),
                value: skip ? localize('welcomer', 'status-skipped') : formatRoles(missingRoleIDs)
            }
        );

    return interaction.editReply({embeds: [embed]});
};