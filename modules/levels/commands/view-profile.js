const {localize} = require('../../../src/functions/localize');
const {sendProfile} = require('./profile');

module.exports.config = {
    name: 'View Level Profile',
    type: 'USER',
    contextMenu: true,
    description: localize('levels', 'profile-context-description')
};

// Adapter: hands the target member to the shared sendProfile core (output identical to /profile).
module.exports.run = async function (interaction) {
    let member = interaction.targetMember;
    if (!member) member = await interaction.guild.members.fetch(interaction.targetUser.id);
    return sendProfile(interaction, member);
};
