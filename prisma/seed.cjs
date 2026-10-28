const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const bcrypt = require("bcryptjs");

try {
  process.loadEnvFile?.();
} catch {
  // .env is optional when DATABASE_URL is already set in the environment.
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to seed the database.");

// Supabase pooler certs are signed by a CA outside the Node trust store; pin it
// so full certificate verification stays enabled (see lib/prisma.ts).
const SUPABASE_ROOT_CA = `
-----BEGIN CERTIFICATE-----
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
-----END CERTIFICATE-----
`.trim();

function poolConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!/\.supabase\.(co|com)$/i.test(new URL(connectionString).hostname)) return { connectionString };
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true }
  };
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(poolConfig())
});
const geography = {
  "Kinondoni": [
    "Kinondoni", "Magomeni", "Mikocheni", "Msasani", "Mbezi", "Kawe",
    "Kunduchi", "Bunju", "Goba", "Kimara", "Sinza", "Kijitonyama",
    "Mwananyamala", "Tandale", "Ndugumbi", "Makumbusho", "Mabibo",
    "Manzese", "Ubungo", "Kibamba", "Makuburi", "Makurumla"
  ],
  "Ilala": [
    "Ilala", "Kariakoo", "Upanga", "Kisutu", "Buguruni", "Ukonga",
    "Segerea", "Tabata", "Kivukoni", "Pugu", "Chanika", "Majohe"
  ],
  "Temeke": [
    "Temeke", "Kurasini", "Tandika", "Mbagala", "Mtoni", "Kigamboni",
    "Kimbiji", "Buza", "Toangoma", "Yombo Vituka", "Makangarawe",
    "Chamazi", "Kilakala", "Mji Mwema"
  ],
  "Ubungo": [
    "Ubungo", "Kimara", "Mbezi", "Msigani", "Kwembe", "Kibamba", "Goba",
    "Saranga", "Makurumla", "Mburahati", "Sinza", "Manzese", "Mabibo",
    "Makuburi"
  ],
  "Kigamboni": [
    "Kigamboni", "Tungi", "Kibada", "Mjimwema", "Kimbiji",
    "Pembamnazi", "Somangila", "Kisarawe II", "Vijibweni"
  ]
};

async function main() {
  const region = await prisma.region.upsert({
    where: { name: "Dar es Salaam" },
    update: {},
    create: { name: "Dar es Salaam" }
  });

  for (const [districtName, neighborhoods] of Object.entries(geography)) {
    const district = await prisma.district.upsert({
      where: { name: districtName },
      update: { regionId: region.id },
      create: { name: districtName, regionId: region.id }
    });
    for (const name of neighborhoods) {
      await prisma.neighborhood.upsert({
        where: { districtId_name: { districtId: district.id, name } },
        update: {},
        create: { districtId: district.id, name }
      });
    }
  }

  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE, ADMIN_PASSWORD } = process.env;
  if ([ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE, ADMIN_PASSWORD].some((value) => !value)) {
    console.warn("Geography seeded. Set ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE and ADMIN_PASSWORD to create an administrator.");
    return;
  }
  if (ADMIN_PASSWORD.length < 16) throw new Error("ADMIN_PASSWORD must have at least 16 characters.");
  const phoneDigits = ADMIN_PHONE.replace(/[^\d]/g, "");
  const phone = phoneDigits.startsWith("0") ? `255${phoneDigits.slice(1)}` :
    phoneDigits.startsWith("255") ? phoneDigits : `255${phoneDigits}`;
  if (!/^255[67]\d{8}$/.test(phone)) throw new Error("ADMIN_PHONE must be a valid Tanzania mobile number.");

  const email = ADMIN_EMAIL.toLowerCase();
  const blacklisted = await prisma.blacklistEntry.findFirst({
    where: { OR: [{ normalizedPhone: phone }, { normalizedEmail: email }] }
  });
  if (blacklisted) throw new Error("Administrator credentials are on the blacklist.");

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: ADMIN_NAME,
      email,
      phone,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      isEmailVerified: true,
      role: "ADMIN"
    }
  });

  // Seed payment methods
  await prisma.paymentMethod.upsert({
    where: { id: "selcom" },
    update: {},
    create: {
      id: "selcom",
      provider: "selcom",
      methodName: "Selcom Payment Gateway",
      isActive: true,
      config: {}
    }
  });

  await prisma.paymentMethod.upsert({
    where: { id: "mpesa" },
    update: {},
    create: {
      id: "mpesa",
      provider: "mpesa",
      methodName: "M-Pesa Tanzania",
      isActive: false,
      config: {}
    }
  });

  await prisma.paymentMethod.upsert({
    where: { id: "tigopesa" },
    update: {},
    create: {
      id: "tigopesa",
      provider: "tigopesa",
      methodName: "Tigo Pesa",
      isActive: false,
      config: {}
    }
  });

  await prisma.paymentMethod.upsert({
    where: { id: "airtel" },
    update: {},
    create: {
      id: "airtel",
      provider: "airtel",
      methodName: "Airtel Money",
      isActive: false,
      config: {}
    }
  });

  // Seed static pages
  await prisma.staticPage.upsert({
    where: { slug: "terms" },
    update: {},
    create: {
      slug: "terms",
      title: "Terms of Use",
      content: "DarRoom's terms of use will appear here...",
      published: true
    }
  });

  await prisma.staticPage.upsert({
    where: { slug: "privacy" },
    update: {},
    create: {
      slug: "privacy",
      title: "Privacy Policy",
      content: "DarRoom's privacy policy will appear here...",
      published: true
    }
  });

  await prisma.staticPage.upsert({
    where: { slug: "faq" },
    update: {},
    create: {
      slug: "faq",
      title: "Frequently Asked Questions",
      content: "Common questions and answers will appear here...",
      published: true
    }
  });

  console.info("Geography seeded, administrator account ensured, payment methods and static pages created.");

  // Seed sample listings (if none exist)
  const existingListings = await prisma.listing.count();
  if (existingListings === 0) {
    const kinondoni = await prisma.district.findFirst({ where: { name: "Kinondoni" } });
    const sinza = await prisma.neighborhood.findFirst({ where: { name: "Sinza", districtId: kinondoni.id } });
    const mikocheni = await prisma.neighborhood.findFirst({ where: { name: "Mikocheni", districtId: kinondoni.id } });

    // Create a sample dalali user
    const dalaliUser = await prisma.user.create({
      data: {
        name: "Juma Kibwana",
        email: "juma@example.com",
        phone: "255712345678",
        passwordHash: await bcrypt.hash("StrongPassword123456", 12),
        isEmailVerified: true,
        role: "DALALI"
      }
    });

    // Create sample listings
    await prisma.listing.create({
      data: {
        ownerId: dalaliUser.id,
        districtId: kinondoni.id,
        neighborhoodId: sinza.id,
        title: "Single room for rent - Sinza",
        description: "A single room with a kitchen, bathroom, and living area. Tap water and prepaid electricity are available. The room is close to the main road.",
        priceTzs: 120000,
        minMonths: 3,
        luku: true,
        water: "Tap water",
        phone: "255712345678",
        inspectionFeePolicyAcceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        status: "APPROVED",
        bedrooms: 1,
        bathrooms: 1,
        furnished: false,
        allowsPets: false,
        allowsStudents: true
      }
    });

    await prisma.listing.create({
      data: {
        ownerId: dalaliUser.id,
        districtId: kinondoni.id,
        neighborhoodId: mikocheni.id,
        title: "Family home - Mikocheni",
        description: "Two bedrooms, one living room, and a kitchen. Tap water and prepaid electricity are connected. Peaceful area.",
        priceTzs: 250000,
        minMonths: 6,
        luku: true,
        water: "Tap water",
        phone: "255712345678",
        inspectionFeePolicyAcceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        status: "APPROVED",
        bedrooms: 2,
        bathrooms: 1,
        furnished: true,
        allowsPets: true,
        allowsStudents: true
      }
    });

    // Create analytics for listings
    const listings = await prisma.listing.findMany();
    for (const listing of listings) {
      await prisma.listingAnalytics.create({
        data: {
          listingId: listing.id,
          views: Math.floor(Math.random() * 100),
          whatsappClicks: Math.floor(Math.random() * 20),
          favorites: Math.floor(Math.random() * 10),
          inquiries: Math.floor(Math.random() * 5)
        }
      });
    }

    console.info("Sample listings and analytics created.");
  }

  // Backfill expiry for listings created before listings had an expiry date.
  await prisma.listing.updateMany({
    where: { expiresAt: null },
    data: { expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) }
  });

  // Idempotent demo subscription so the sample Dalali can manage listings locally.
  const demoDalali = await prisma.user.findUnique({ where: { email: "juma@example.com" } });
  if (demoDalali) {
    const activeSubscription = await prisma.subscription.findFirst({
      where: { userId: demoDalali.id, status: "ACTIVE", endsAt: { gt: new Date() } }
    });
    if (!activeSubscription) {
      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      await prisma.subscription.create({
        data: { userId: demoDalali.id, plan: "BASIC", startsAt, endsAt, status: "ACTIVE" }
      });
      console.info("Demo Dalali subscription created.");
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
