require("dotenv").config();
import * as bodyParser from "body-parser";
import express from "express";
import session from "express-session";
import { v4 as uuid } from "uuid";
import { Request, Response } from "express";
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

    // add {force: true} to sync() to reset db
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
          console.log('user: ',user)
          await xero.setTokenSet(tokenSet)
          await xero.refreshToken()
          await xero.updateTenants()

          const activeTenant: any = user.active_tenant
          const invoicesRequest = await xero.accountingApi.getInvoices(activeTenant.tenantId)
          const invoices = invoicesRequest.body.invoices
          

          const dataSet = invoices.map(inv => {
            return {
              'ContactName': inv.contact.name,
              'Type': inv.type,
              'AmountDue': inv.amountDue,
              'InvoiceNumber': inv.invoiceNumber,
              'Payments': inv.payments.length.toString(),
              'LineItems': inv.lineItems.length.toString(),
              'weblink': deeplinkToInvoice(inv.invoiceID, activeTenant.orgData.shortCode)
            }
          })

        //   const dataSet = [
        //     { "information": "A1", "weblink": "http://www.microsoft.com" },
        //     { "information": "A2", "weblink": "http://www.yahoo.com" },
        //     { "information": "A3", "weblink": "http://www.google.com" },
        //     { "information": "A4", "weblink": "http://www.duckduckgo.com" }
        // ];

          res.render("dashboard", {
            user,
            dataSet,
            allTenants: xero.tenants
          });
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
        
        const activeTenant = xero.tenants[0]
        const orgDetails = await xero.accountingApi.getOrganisations(activeTenant.tenantId)
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
          active_tenant: activeTenant,
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

    router.post("/change_organisation", async (req: Request, res: Response) => {
      try {
        const activeOrgId = req.body.active_org_id
        const picked = xero.tenants.filter((tenant) => tenant.tenantId == activeOrgId)[0]
        const userParams = {
          active_tenant: picked
        }

        const user = await findUserWithSession(req.signedCookies.recentSession)

        await user.update(userParams).then(updatedUser => {
          console.log(`UPDATED record ${JSON.stringify(updatedUser.email,null,2)}`)
          return updatedUser
        })

        res.redirect('/dashboard')
      } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
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
