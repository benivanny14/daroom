import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as typeof globalThis & {
  darRoomPrisma?: PrismaClient;
};

/**
 * `DATABASE_POOL_URL` lets the runtime use Supabase's transaction pooler while
 * `prisma migrate deploy` keeps using the session pooler on `DATABASE_URL`.
 * Serverless functions multiply connections, and the session pooler only allows
 * ~15 clients in total.
 */
const connectionString =
  process.env.DATABASE_POOL_URL ||
  process.env.DATABASE_URL ||
  "postgresql://unconfigured:unconfigured@127.0.0.1:1/darroom";

/**
 * Supabase signs its pooler certificates with its own root CA ("Supabase Root
 * 2021 CA"), which is not in the Node trust store. Pinning it keeps full chain
 * verification ON instead of disabling certificate checks.
 */
const SUPABASE_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`;

/**
 * Supabase's session pooler allows only ~15 connections in total while every
 * serverless function instance opens its own pool (pg defaults to 10), so the
 * pool is kept deliberately small and released quickly when idle.
 */
const POOL_LIMITS = {
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true
} as const;

type DbPoolConfig = {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: { ca: string; rejectUnauthorized: true };
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  allowExitOnIdle: boolean;
};

/**
 * pg's connection-string parsing merges `ssl` differently from an explicit
 * config, so a pinned CA is only honoured when host/user/password are passed
 * directly. Local Postgres (no TLS) keeps the plain connection string.
 */
function poolConfig(): DbPoolConfig {
  if (!/\.supabase\.(co|com)$/i.test(new URL(connectionString).hostname)) {
    return { connectionString, ...POOL_LIMITS };
  }
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true },
    ...POOL_LIMITS
  };
}

export const prisma = globalForPrisma.darRoomPrisma ?? new PrismaClient({
  adapter: new PrismaPg(poolConfig()),
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
});

if (process.env.NODE_ENV !== "production") globalForPrisma.darRoomPrisma = prisma;
