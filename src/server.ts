require("dotenv").config();
import * as bodyParser from "body-parser";
import express from "express";
import session from "express-session";
import { v4 as uuid } from "uuid";
import e, { Request, Response } from "express";
import { XeroClient } from "xero-node";
import { sequelize } from "./models/index";
import cookieParser from "cookie-parser";
import jwtDecode from "jwt-decode";
import User from "./models/user";

const path = require("path");
const cors = require("cors");

const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const redirectUrl = process.env.REDIRECT_URI;
const scopes = "offline_access openid profile email accounting.transactions.read accounting.settings";

const xero = new XeroClient({
  clientId: client_id,
  clientSecret: client_secret,
  redirectUris: [redirectUrl],
  scopes: scopes.split(" "),
  httpTimeout: 2000
});

if (!client_id || !client_secret || !redirectUrl) {
  throw Error('Environment Variables not all set - please check your .env file in the project root or create one!')
}

function findUserWithSession(session: string) {
  return User.findOne({ where: { session: session} });
}

function deeplinkToInvoice(invoiceId, shortCode) {
  console.log(`https://go.xero.com/organisationlogin/default.aspx?shortcode=${shortCode}&redirecturl=/AccountsReceivable/View.aspx?InvoiceID=${invoiceId}`)
  return `https://go.xero.com/organisationlogin/default.aspx?shortcode=${shortCode}&redirecturl=/AccountsReceivable/View.aspx?InvoiceID=${invoiceId}`
}

class App {
  public app: express.Application;
  public consentUrl: Promise<string>

  constructor() {
    this.app = express();
    this.config();
    this.routes();
    this.app.set("views", path.join(__dirname, "views"));
    this.app.set("view engine", "ejs");
    this.app.use(express.static(path.join(__dirname, "../public")));

    this.consentUrl = xero.buildConsentUrl()
  }

  private config(): void {
		var corsOptions = {
			origin: "http://localhost:8081"
		};
		
		this.app.use(cors(corsOptions));
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));

    this.app.use(session({
      secret: process.env.SESSION_SECRET,
      resave: true,
      saveUninitialized: true
    }));

    // add {force: true} to reset db every time
    // sequelize.sync({force: true}).then(async() => {
    sequelize.sync().then(async() => {
      this.app.listen(process.env.PORT, () => {
        console.log(`Example app listening on port ${process.env.PORT}!`)
      });
    });
  }
  
  private routes(): void {
    const router = express.Router();
    
    router.get("/", async (req: Request, res: Response) => {
      if(req.signedCookies.recentSession) {
        res.redirect("/dashboard");
      }
			res.render("home", {
				authorizeUrl: await xero.buildConsentUrl()
			});
    });

    router.get("/dashboard", async (req: Request, res: Response) => {
      if (req.signedCookies.recentSession){
        const user = await findUserWithSession(req.signedCookies.recentSession)
        try {
          if (!user) {
            res.redirect("/logout"); // signed cookie does not match a user
          }
          const tokenSet = user.token_set
          await xero.setTokenSet(tokenSet)
          await xero.refreshToken()
          await xero.updateTenants()

          const activeTenant = xero.tenants[0]
          const invoicesRequest = await xero.accountingApi.getInvoices(activeTenant.tenantId)
          const invoices = invoicesRequest.body.invoices
          
          console.log('activeTenant: ',activeTenant)

          const dataSet = invoices.map(inv => {
            return [
              inv.contact.name,
              inv.type,
              inv.amountDue,
              inv.invoiceNumber,
              inv.payments.length.toString(),
              inv.lineItems.length.toString(),
              deeplinkToInvoice(inv.invoiceID, activeTenant.orgData.shortCode)
            ]
          })
          console.log('dataSet: ',dataSet)

          // const dataSet = [
          //   [ "Angry Ale's", 'ACCREC', '1500', 'INV-0001', '1', '0', 'https://go.xero.com/organisationlogin/default.aspx?shortcode=!yrcgp&redirecturl=/AccountsReceivable/View.aspx?InvoiceID=e9f1bf65-8155-4521-a4ed-5b747816f9b5'],
          //   [ 'Test User: 983139', 'ACCREC', '7000', 'XERO:438024', '0', '0', 'https://go.xero.com/organisationlogin/default.aspx?shortcode=!yrcgp&redirecturl=/AccountsReceivable/View.aspx?InvoiceID=4b27906a-4650-421a-b983-49246994f8f3']
          // ]
          res.render("dashboard", {user, dataSet});
        } catch(e) {
          console.log(':e ', e)
          res.status(res.statusCode);

          res.render("shared/error", {
            error: e
          });
        }
      } else {
        res.redirect("/");
      }
    });

    router.get("/callback", async (req: Request, res: Response) => {
      try {
        const tokenSet = await xero.apiCallback(req.url);
        await xero.updateTenants()
        
        const activeTenantId = xero.tenants[0].tenantId
        const orgDetails = await xero.accountingApi.getOrganisations(activeTenantId)
        const decodedIdToken = jwtDecode(tokenSet.id_token)

        const recentSession = uuid()
        const user = await User.findOne({where: { email: decodedIdToken.email }})
        const address = orgDetails.body.organisations[0].addresses[0]

        const userParams = {
          firstName: decodedIdToken.given_name,
          lastName: decodedIdToken.family_name,
          address: address ? address.postalCode : '',
          email: decodedIdToken.email,
          xero_userid: decodedIdToken.xero_userid,
          decoded_id_token: decodedIdToken,
          token_set: tokenSet,
          active_tenant_id: activeTenantId,
          session: recentSession
        }

        if (user) {
          await user.update(userParams).then(updatedRecord => {
            console.log(`UPDATED record ${JSON.stringify(updatedRecord.email,null,2)}`)
            return updatedRecord
          })
        } else {
          await User.create(userParams).then(createdRecord => {
            console.log(`CREATED record ${JSON.stringify(createdRecord.email,null,2)}`)
            return createdRecord
          })
        }
        res.cookie('recentSession', recentSession, { signed: true, maxAge: 1 * 60 * 60 * 1000 }) // 1 hour
        res.redirect("dashboard");
      } catch (e) {
        res.status(res.statusCode);

        res.render("shared/error", {
          error: e
        });
      }
    });

    router.get('/logout', (req, res) => {      
      if (req.signedCookies.recentSession) {
        res.clearCookie('recentSession')
      }
      res.redirect('/');
    });

    this.app.use(require('express-session')({
      secret: process.env.SESSION_SECRET,
      resave: true,
      saveUninitialized: true
    }));

    this.app.use(cookieParser(process.env.SESSION_SECRET));

    this.app.use("/", router);
  }
}

export default new App().app;
