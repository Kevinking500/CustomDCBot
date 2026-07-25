const {localize} = require('../../../src/functions/localize');
const {buildReviewModal} = require('../context-actions');

module.exports.config = {
    name: 'Submit Review',
    type: 'USER',
    contextMenu: true,
    description: localize('staff-management-system', 'submit-review-context-description')
};

/*
 * Thin adapter for the /staff-management review submit subcommand. Open to everyone; the
 * onlyAllowStaffReview restriction (target must be staff) is enforced at runtime inside the shared
 * submitReview core, exactly as for the slash flow. The modal collects the same fields the slash
 * flow does (stars 1-5 / comment); its customId encodes the target user id so the submit handler
 * in events/interactionCreate.js runs submitReview. showModal must be first, so we must NOT defer.
 */
module.exports.run = async function (interaction) {
    return interaction.showModal(buildReviewModal(interaction.targetUser.id));
};
