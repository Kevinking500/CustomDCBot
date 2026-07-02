const {localize} = require('../../../src/functions/localize');
const {memberCanSendInChannel} = require('../../../src/functions/helpers');
const duelCommand = require('./duel');

module.exports.config = {
    name: 'Duel',
    type: 'USER',
    contextMenu: true,
    description: localize('duel', 'duel-context-description')
};

/*
 * Thin adapter: /duel run() resolves its opponent via interaction.options.getMember('user', true).
 * We reuse run() unchanged by handing it the real interaction with getMember overridden to return
 * the right-clicked member, so the challenge -> accept -> duel flow is identical against that user.
 * The self-challenge guard inside run() applies unchanged.
 */
module.exports.run = async function (interaction) {
    if (!memberCanSendInChannel(interaction.member, interaction.channel)) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('command', 'no-send-permission')
    });
    const proxy = Object.create(interaction, {
        options: {
            value: {
                ...interaction.options,
                getMember: (name) => (name === 'user' ? interaction.targetMember : interaction.options.getMember(name))
            }
        }
    });
    return duelCommand.run(proxy);
};
