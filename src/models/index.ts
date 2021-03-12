import { Sequelize, DataTypes } from 'sequelize'
import User from './user'

var sequelize = null
if (process.env.DATABASE_URL) {
  // the application is executed on Heroku ... use the postgres database
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect:  'postgres',
    protocol: 'postgres',
    logging:  true, //false
    pool: {
      max: 15,
      min: 5,
      idle: 20000,
      evict: 15000,
      acquire: 30000
    }
  });
} else {
  sequelize = new Sequelize(
    process.env.DATABASE,
    process.env.DATABASE_USER,
    process.env.DATABASE_PASSWORD,
    {
      dialect: 'postgres',
    },
  );
}
 
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
      type: DataTypes.UUID
    },
    active_tenant: {
      type: DataTypes.JSONB
    },
    decoded_id_token: {
      type: DataTypes.JSONB
    },
    token_set: {
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
