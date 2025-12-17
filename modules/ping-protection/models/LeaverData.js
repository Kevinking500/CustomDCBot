const { DataTypes, Model } = require('sequelize');

module.exports = class PingProtectionLeaverData extends Model {
    static init(sequelize) {
        return super.init({
            userId: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            // Timestamp of when the user left, used for cooldown calculations
            leftAt: {
                type: DataTypes.DATE,
                defaultValue: DataTypes.NOW
            }
        }, {
            tableName: 'ping_protection_leaver_data',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'LeaverData',
    module: 'ping-protection'
};