import { Sequelize, DataTypes } from 'sequelize'
import validator from 'validator';
import User from './user'

const sequelize = new Sequelize(
  process.env.DATABASE,
  process.env.DATABASE_USER,
  process.env.DATABASE_PASSWORD,
  {
    dialect: 'postgres',
  },
);
 
const models = {
  User
};

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    firstName: {
      type: DataTypes.STRING
    },
    lastName: {
      type: DataTypes.STRING
    },
    address: {
      type: DataTypes.STRING
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true
      },
      unique: true
    },
    xero_userid: {
      type:  DataTypes.UUID
    },
    id_token: {
      type: DataTypes.JSONB
    },
    access_token: {
      type: DataTypes.JSONB
    },
    session: {
      type: DataTypes.STRING
    }
  },
  {
    tableName: "users",
    sequelize
  }
);

 
Object.keys(models).forEach(key => {
  if ('associate' in models[key]) {
    models[key].associate(models);
  }
});
 
export { sequelize };
 
export default models;
