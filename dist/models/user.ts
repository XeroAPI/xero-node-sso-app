import{ Model } from "sequelize";

class User extends Model {
  public id!: number;
  public firstName!: string;
  public lastName!: string;
  public address!: string;
  public email!: string;
  public xero_userid!: string;
  public id_token!: string;
  public access_token!: string;
  public session!: string;
}

export default User