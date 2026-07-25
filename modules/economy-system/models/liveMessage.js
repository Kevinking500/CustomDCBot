const {
    DataTypes,
    Model
} = require('sequelize');

module.exports = class LiveMessage extends Model {
    static init(sequelize) {
        return super.init({
            type: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            channelID: DataTypes.STRING,
            messageID: DataTypes.STRING
        }, {
            tableName: 'economy_liveMessage',
            timestamps: true,
            sequelize
        });
    }
};

module.exports.config = {
    'name': 'LiveMessage',
    'module': 'economy-system'
};