const {localize} = require('../../../src/functions/localize');
const {memberCanSendInChannel} = require('../../../src/functions/helpers');
const unoCommand = require('./uno');

module.exports.config = {
    name: 'Challenge to Uno',
    type: 'USER',
    contextMenu: true,
    description: localize('uno', 'challenge-to-uno-context-description')
};

/*
 * Thin adapter: /uno run() opens an open join-lobby and reads no opponent from options, so we
 * reuse it unchanged to produce the identical lobby. Uno has no single opponent, so to honour the
 * right-clicked user as the challenged player we additionally ping them with a follow-up inviting
 * them to join the lobby. Self-targeting is harmless (the host is already in the lobby), so we skip
 * the ping in that case rather than block the game.
 */
module.exports.run = async function (interaction) {
    if (!memberCanSendInChannel(interaction.member, interaction.channel)) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('command', 'no-send-permission')
    });
    await unoCommand.run(interaction);
    if (interaction.targetUser && interaction.targetUser.id !== interaction.user.id) {
        await interaction.followUp({
            content: localize('uno', 'context-challenge-invite', {
                u: interaction.user.toString(),
                t: interaction.targetUser.toString()
            }),
            allowedMentions: {users: [interaction.targetUser.id]}
        }).catch(() => {
        });
    }
};