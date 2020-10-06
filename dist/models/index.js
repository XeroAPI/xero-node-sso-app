"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sequelize = void 0;
const sequelize_1 = require("sequelize");
const user_1 = __importDefault(require("./user"));
const sequelize = new sequelize_1.Sequelize(process.env.DATABASE, process.env.DATABASE_USER, process.env.DATABASE_PASSWORD, {
    dialect: 'postgres',
});
exports.sequelize = sequelize;
const models = {
    User: user_1.default
};
user_1.default.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    firstName: {
        type: sequelize_1.DataTypes.STRING
    },
    lastName: {
        type: sequelize_1.DataTypes.STRING
    },
    address: {
        type: sequelize_1.DataTypes.STRING
    },
    email: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
        validate: {
            isEmail: true
        },
        unique: true
    },
    xero_userid: {
        type: sequelize_1.DataTypes.UUID
    },
    id_token: {
        type: sequelize_1.DataTypes.JSONB
    },
    access_token: {
        type: sequelize_1.DataTypes.JSONB
    },
    session: {
        type: sequelize_1.DataTypes.STRING
    }
}, {
    tableName: "users",
    sequelize
});
Object.keys(models).forEach(key => {
    if ('associate' in models[key]) {
        models[key].associate(models);
    }
});
exports.default = models;
//# sourceMappingURL=index.js.map