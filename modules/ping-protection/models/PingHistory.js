const { DataTypes, Model } = require('sequelize');

module.exports = class PingHistory extends Model {
    static init(sequelize) {
        return super.init({
            userId: {
                type: DataTypes.STRING,
                allowNull: false
            },
            messageUrl: {
                type: DataTypes.STRING,
                allowNull: false
            },
            timestamp: {
                type: DataTypes.DATE,
                defaultValue: DataTypes.NOW
            }
        }, {
            tableName: 'ping_protection_history',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    name: 'PingHistory',
    module: 'ping-protection'
};