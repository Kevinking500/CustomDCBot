const { Op } = require('sequelize');
const { localize } = require('../../../src/functions/localize');

module.exports.run = async (client, member) => {
    if (member.guild.id !== client.guildID) return;

    const StaffShift = client.models['staff-management-system']['StaffShift'];
    const StaffProfile = client.models['staff-management-system']['StaffProfile'];

    try {
        const openShift = await StaffShift.findOne({
            where: {
                userId: member.id,
                endTime: null
            }
        });

        if (openShift) {
            const now = new Date();
            const duration = Math.floor((now - openShift.startTime) / 1000);

            await openShift.update({
                endTime: now,
                duration: duration
            });

            client.logger.info(localize('staff-management-system', 'log-shift-leave', { tag: member.user.tag }));
        }

        await StaffProfile.update(
            { onDuty: false },
            { where: { userId: member.id } }
        );

    } catch (e) {
        client.logger.error(localize('staff-management-system', 'log-leave-err', { error: e.message }));
    }
};