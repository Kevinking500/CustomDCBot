const {localize} = require('../../../src/functions/localize');
const {sendUserInfo} = require('./info');

module.exports.config = {
    name: 'User Info',
    type: 'USER',
    contextMenu: true,
    description: localize('info-commands', 'user-info-context-description')
};

/*
 * Thin adapter: defer (sendUserInfo replies via editReply, normally deferred by beforeSubcommand)
 * and hand the target member off to the shared sendUserInfo core so the output is identical to
 * /info user.
 */
module.exports.run = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
    let member = interaction.targetMember;
    if (!member) member = await interaction.guild.members.fetch(interaction.targetUser.id);
    return sendUserInfo(interaction, member);
};
