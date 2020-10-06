"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv").config();
const bodyParser = __importStar(require("body-parser"));
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const uuid_1 = require("uuid");
const xero_node_1 = require("xero-node");
const index_1 = require("./models/index");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const jwt_decode_1 = __importDefault(require("jwt-decode"));
const user_1 = __importDefault(require("./models/user"));
const path = require("path");
const cors = require("cors");
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const redirectUrl = process.env.REDIRECT_URI;
const scopes = "offline_access openid profile email accounting.transactions accounting.settings";
const xero = new xero_node_1.XeroClient({
    clientId: client_id,
    clientSecret: client_secret,
    redirectUris: [redirectUrl],
    scopes: scopes.split(" "),
    httpTimeout: 2000
});
if (!client_id || !client_secret || !redirectUrl) {
    throw Error('Environment Variables not all set - please check your .env file in the project root or create one!');
}
function findUserWithSession(session) {
    return user_1.default.findOne({ where: { session: session } });
}
class App {
    constructor() {
        this.app = express_1.default();
        this.config();
        this.routes();
        this.app.set("views", path.join(__dirname, "views"));
        this.app.set("view engine", "ejs");
        this.app.use(express_1.default.static(path.join(__dirname, "public")));
        this.consentUrl = xero.buildConsentUrl();
    }
    config() {
        var corsOptions = {
            origin: "http://localhost:8081"
        };
        this.app.use(cors(corsOptions));
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use(express_session_1.default({
            secret: process.env.SESSION_SECRET,
            resave: true,
            saveUninitialized: true
        }));
        index_1.sequelize.sync().then(() => __awaiter(this, void 0, void 0, function* () {
            this.app.listen(process.env.PORT, () => {
                console.log(`Example app listening on port ${process.env.PORT}!`);
            });
        }));
    }
    routes() {
        const router = express_1.default.Router();
        router.get("/", (req, res) => __awaiter(this, void 0, void 0, function* () {
            if (req.signedCookies.recentSession) {
                res.redirect("/dashboard");
            }
            res.render("home", {
                authorizeUrl: yield xero.buildConsentUrl()
            });
        }));
        router.get("/dashboard", (req, res) => __awaiter(this, void 0, void 0, function* () {
            if (req.signedCookies.recentSession) {
                const user = yield findUserWithSession(req.signedCookies.recentSession);
                if (!user) {
                    // user has logged in on different device
                    // or signed cookie does not match a user
                    res.redirect("/logout");
                }
                res.render("dashboard", { user });
            }
            else {
                res.redirect("/");
            }
        }));
        router.get("/callback", (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const tokenSet = yield xero.apiCallback(req.url);
                yield xero.updateTenants();
                const activeTenantId = xero.tenants[0].tenantId;
                const orgDetails = yield xero.accountingApi.getOrganisations(activeTenantId);
                const decodedIdToken = jwt_decode_1.default(tokenSet.id_token);
                const recentSession = uuid_1.v4();
                const user = yield user_1.default.findOne({ where: { email: decodedIdToken.email } });
                const userParams = {
                    firstName: decodedIdToken.given_name,
                    lastName: decodedIdToken.family_name,
                    address: orgDetails.body.organisations[0].addresses[0].postalCode,
                    email: decodedIdToken.email,
                    xero_userid: decodedIdToken.xero_userid,
                    id_token: decodedIdToken,
                    access_token: tokenSet.access_token,
                    active_tenant_id: activeTenantId,
                    session: recentSession
                };
                if (user) {
                    user.update(userParams).then(updatedRecord => {
                        console.log(`UPDATED record ${JSON.stringify(updatedRecord, null, 2)}`);
                        return updatedRecord;
                    });
                }
                else {
                    user_1.default.create(userParams).then(createdRecord => {
                        console.log(`CREATED record ${JSON.stringify(createdRecord, null, 2)}`);
                        return createdRecord;
                    });
                }
                res.cookie('recentSession', recentSession, { signed: true, maxAge: 1 * 60 * 60 * 1000 }); // 1 hour
                res.render("dashboard", {
                    user
                });
            }
            catch (e) {
                res.status(res.statusCode);
                res.render("shared/error", {
                    error: e
                });
            }
        }));
        router.get('/logout', (req, res) => {
            if (req.signedCookies.recentSession) {
                res.clearCookie('recentSession');
            }
            res.redirect('/');
        });
        this.app.use(require('express-session')({
            secret: process.env.SESSION_SECRET,
            resave: true,
            saveUninitialized: true
        }));
        this.app.use(cookie_parser_1.default(process.env.SESSION_SECRET));
        this.app.use("/", router);
    }
}
exports.default = new App().app;
//# sourceMappingURL=server.js.map