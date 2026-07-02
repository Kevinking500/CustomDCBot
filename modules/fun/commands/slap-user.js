const {localize} = require('../../../src/functions/localize');
const {memberCanSendInChannel} = require('../../../src/functions/helpers');
const {run: runSlap} = require('./slap');

module.exports.config = {
    name: 'Slap',
    type: 'USER',
    contextMenu: true,
    description: localize('fun', 'slap-context-description')
};

/*
 * Thin adapter: the /slap run() reads its recipient from interaction.options.getUser('user').
 * We delegate to that exact run() with a proxy whose options.getUser returns the context-menu
 * targetUser, so the rendered slap (message + gif) is identical to the slash command, including
 * the self-target guard the original enforces.
 */
module.exports.run = async function (interaction) {
    if (!memberCanSendInChannel(interaction.member, interaction.channel)) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('command', 'no-send-permission')
    });
    const proxy = Object.create(interaction);
    proxy.options = {getUser: () => interaction.targetUser};
    return runSlap(proxy);
};
