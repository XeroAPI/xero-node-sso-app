# Xero Single Sign on Sample app
This app shows a user authentication strategy using [OAuth 2.0](https://oauth.net/2/) and [OpenID Connect](https://openid.net/connect/). Single Sign On with Xero can be a valuable tool to increase signup converion and pull/push important business data to a businesses General Ledger.

### Checkout the two part blog for more context
* 1) [What travel visas teach us about software authentication](#TODO-medium-link)
* 2) [How to build Single Sign-on (SSO) using OAuth2.0 & OpenID Connect](#TODO-medium-link)

# <a href="https://xero-sso.herokuapp.com" target="_blank">Hosted Demo of app</a>
![sso-demo](/sso-vid.gif)

---
# Code Walkthrough
The following steps are the core pieces of code you will need to implement this in any application.

## Steps 
### 1. Scopes & Authorization URL
### 2. Callback URL
### 3. `id_token` validation & decoding
### 5. Create || update, then 'login' a user

---
1. **Scopes & Authorization URL**

This will look something like:
> `https://login.xero.com/identity/connect/authorize?client_id=<CLIENT_ID>&scope=offline_access openid profile email accounting.transactions&response_type=code&redirect_uri=<CALLBACK_URI>`

* **offline_access**: This will ensure a `refresh_token` is returned by the api so you can persist long standing API connections
* **openid profile email**: These are Xero's supported OIDC scopes. They will return a JWT called `id_token` which you can Base64Url decode to utilize the user's information
* **accounting.transactions**: This is a Xero specific scope that enables the interaction with an organisations accounting transactions ie. invoices & bank transactions, etc.

---
2. **Callback URL**

In the same route that matches the authorization url and the app settings in your [Xero App Dashboard](https://developer.xero.com/myapps/), you will need to catch the authorization flow temporary code and exchange for `token_set`

In this example we are using the [xero-node SDK](https://github.com/XeroAPI/xero-node) which has a helper to do this exchange.
```javascript
const tokenSet = await xero.apiCallback(requestUrl);
```

---
3. **`id_token` validation and decoding**

The SDK also handles this under the hood with an OIDC Certified library called [node-openid-client ](https://openid.net/developers/certified/) which does a sequence of cryptographic checks to ensure the token is valid and has not been tampered with.
```javascript
await this.validateIdToken(tokenset, checks.nonce, 'authorization', checks.max_age, checks.state);
```
Once validated we can decode the JWT and access the user data within for use in our user management & login code.
```javascript
const decodedIdToken = jwtDecode(tokenSet.id_token)

const userParams = {
  firstName: decodedIdToken.given_name,
  lastName: decodedIdToken.family_name,
  email: decodedIdToken.email,
  xero_userid: decodedIdToken.xero_userid,
  decoded_id_token: decodedIdToken,
  token_set: tokenSet,
  ...
}
```

---
4. **Create || update, then 'login' a user**

Now that we have verified user data out of our `id_token` we can lookup to see if that user already exists or not. If they do, we update any incoming data like a name change, and if not we create a new user record in our database and log them, setting a secure signed cookie variable that will persist their login session for one hour.
```javascript
const user = await User.findOne({where: { email: decodedIdToken.email }})

if (user) {
  await user.update(userParams).then(updatedRecord => {
    console.log(`UPDATED user ${JSON.stringify(updatedRecord.email,null,2)}`)
    return updatedRecord
  })
} else {
  await User.create(userParams).then(createdRecord => {
    console.log(`CREATED user ${JSON.stringify(createdRecord.email,null,2)}`)
    return createdRecord
  })
}
res.cookie('recentSession', recentSession, { signed: true, maxAge: 1 * 60 * 60 * 1000 }) // 1 hour
res.redirect("dashboard");
```

---

While every web application's user management flow can vary in complexity, this code shows the basics of how to securely leverage OA2 and OIDC's `access_token` and `id_token` to provision accounts and leverage the power of Xero's Accounting API.


---

### Running app
To contribute or extend to this repo get running locally through these steps:

1. Install postgres

On mac I recommend using [homebrew](https://wiki.postgresql.org/wiki/Homebrew) to install. For windows or Ubuntu please follow [postgres' guides](https://www.postgresql.org/download/).
> Helpful guides if you get stuck:
* [MacOS Install](https://www.robinwieruch.de/postgres-sql-macos-setup) to set that up

2) Install sequelize-cli
```bash
npm install --save-dev sequelize-cli
```
3) Create a Postgres user and database
> To setup your initial PG user I reccomend reading https://medium.com/coding-blocks/creating-user-database-and-adding-access-on-postgresql-8bfcd2f4a91e

### Configure with your XeroAPI & Database credentials
1) Login to Xero Developer center https://developer.xero.com/myapps and create a new API application
2) Create a `.env` file in the root of your project
3) Replace the variables in .env
```
CLIENT_ID=...
CLIENT_SECRET=...
REDIRECT_URI=...
DATABASE=...
DATABASE_USER=...
DATABASE_PASSWORD=...
PORT=5000
```

### Build and run
> `yarn` and `npm` are interchangeable
```sh
yarn install
yarn start
```
open `http://localhost:5000/`
