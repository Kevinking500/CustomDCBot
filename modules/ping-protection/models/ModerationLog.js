const { DataTypes, Model } = require('sequelize');

module.exports = class ModerationLog extends Model {
    static init(sequelize) {
        return super.init({
            userId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            actionType: {
                type: DataTypes.STRING,
                allowNull: false
            },
            actionDuration: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            reason: {
                type: DataTypes.TEXT,
                allowNull: false
            },
            timestamp: {
                type: DataTypes.DATE,
                defaultValue: DataTypes.NOW
            }
        }, {
            tableName: 'ping_protection_mod_log',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'ModerationLog',
    module: 'ping-protection'
};