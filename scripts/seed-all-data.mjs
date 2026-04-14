/**
 * seed-all-data.mjs
 * Master recovery seed — rebuilds all lost Replit DB data.
 * Idempotent: skips records that already exist by name.
 *
 * Usage:
 *   node scripts/seed-all-data.mjs --base=https://YOUR-APP.replit.app/api
 */

const argBase = process.argv.find((a) => a.startsWith("--base="))?.slice("--base=".length);
const BASE = (argBase || process.env.SEED_API_BASE || "http://localhost:3000/api").replace(/\/$/, "");

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`POST ${path} → ${r.status}: ${t}`); }
  return r.json();
}
async function get(path) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}

// ════════════════════════════════════════════════════════════════
// 1. OPPORTUNITIES
// ════════════════════════════════════════════════════════════════
const OPPORTUNITIES = [
  { title: "County of Lake Request for Proposals (RFP #26712)", agency: "County of Lake", type: "Solicitation", providerName: "serper", samUrl: "https://lakecountyca.gov", source: "manual" },
  { title: "Employee Wellness Services - Government Contracts", agency: "Unknown", type: "Solicitation", providerName: "serper", samUrl: "https://governmentcontracts.us", source: "manual" },
  { title: "Employee Wellness Program Bids, RFP & Government Contracts", agency: "Unknown", type: "Solicitation", providerName: "serper", samUrl: "https://instantmarkets.com", source: "manual" },
  { title: "Pulmonary, Audiometric Testing, And Respirator Fit Testing", agency: "Unknown", type: "Solicitation", providerName: "serper", samUrl: "https://bidnetdirect.com", source: "manual" },
  { title: "Audiometric Testing Services", agency: "Unknown", type: "Solicitation", providerName: "serper", samUrl: "https://govtribe.com", source: "manual" },
  { title: "Audiometric Testing Services - eVP", agency: "State of North Carolina", type: "Solicitation", providerName: "serper", samUrl: "https://evp.nc.gov", source: "manual" },
  { title: "City of San Antonio Occupational Health Services", agency: "City of San Antonio", type: "Solicitation", providerName: "serper", samUrl: "https://webapp1.sanantonio.gov", source: "manual" },
  { title: "Hearing Conservation and Respiratory Protection Program", agency: "Unknown", type: "Solicitation", providerName: "serper", samUrl: "https://highergov.com", source: "manual" },
  { title: "City RFP - Occupational Health and Random Drug Testing", agency: "Unknown", type: "Solicitation", providerName: "tavily", samUrl: "https://highergov.com", source: "manual" },
  { title: "Medical Staffing Bids, RFPs & Government Contracts", agency: "Unknown", type: "Solicitation", providerName: "tavily", samUrl: "https://findrfp.com", source: "manual" },
  { title: "Federal Occupational Health (FOH) Clinical East Staffing Solicitation", agency: "Federal Occupational Health", type: "Solicitation", providerName: "tavily", samUrl: "https://sam.gov", source: "manual" },
  { title: "Healthcare Contracts - DTMB - State of Michigan", agency: "State of Michigan - DTMB", type: "Solicitation", providerName: "tavily", samUrl: "https://michigan.gov", source: "manual" },
  { title: "Hearing Conservation And Respiratory Protection Program - California", agency: "State of California", type: "Solicitation", providerName: "serper", samUrl: "https://bidnetdirect.com", source: "manual" },
  { title: "IDOA: Procurement: Upcoming Anticipated Bidding Opportunities", agency: "Indiana Department of Administration", type: "Solicitation", providerName: "tavily", samUrl: "https://in.gov", source: "manual" },
  { title: "State of Oregon - Bid Solicitation", agency: "State of Oregon", type: "Solicitation", providerName: "serper", samUrl: "https://oregonbuys.gov", source: "manual" },
  { title: "Hanford Occupational Medical Services Draft RFP", agency: "DOE - Hanford", type: "Solicitation", providerName: "tavily", samUrl: "https://emcbc.doe.gov", source: "manual" },
  { title: "Request for Proposal #01-25-26-02 Occupational Medical Services", agency: "City of Danbury CT", type: "Solicitation", providerName: "tavily", samUrl: "https://danbury-ct.gov", source: "manual" },
  { title: "REQUEST FOR PROPOSALS - NY Department of Labor", agency: "NY Department of Labor", type: "Solicitation", providerName: "tavily", samUrl: "https://dol.ny.gov", source: "manual" },
  { title: "RFP #1187451 - Employee Wellness Platform and Related Services", agency: "Unknown", type: "Solicitation", providerName: "serper", samUrl: "https://bidbanana.thebidlab.com", source: "manual" },
  { title: "Workers' Compensation RFP - City of Chicago", agency: "City of Chicago", type: "Solicitation", providerName: "serper", samUrl: "https://chicago.gov", source: "manual" },
  { title: "Request for Proposals - Ohio Workers Compensation", agency: "State of Ohio", type: "Solicitation", providerName: "serper", samUrl: "https://dam.assets.ohio.gov", source: "manual" },
  { title: "RFP Workers' Compensation and Public Safety - City of Waltham MA", agency: "City of Waltham, MA", type: "Solicitation", providerName: "serper", samUrl: "https://city.waltham.ma.us", source: "manual" },
  { title: "RFP-650-24-25-Workers-Compensation-Insurance", agency: "Housing Authority City of Pittsburgh", type: "Solicitation", providerName: "serper", samUrl: "https://hacp.org", source: "manual" },
  { title: "REQUEST FOR PROPOSAL FOR OCCUPATIONAL HEALTH SERVICES", agency: "Unknown Municipality", type: "Solicitation", providerName: "serper", samUrl: "https://cms9files.revize.com", source: "manual" },
  { title: "Q--Presolicitation Notice for OST HRP", agency: "Department of Energy", type: "Solicitation", providerName: "tavily", samUrl: "https://sam.gov", source: "manual" },
  { title: "RFP_Occupational Health Services (0000003794)", agency: "Unknown", type: "Solicitation", providerName: "serper", samUrl: "https://highergov.com", source: "manual" },
  { title: "Occupational Health RFP - ORF Airport", agency: "Norfolk Airport Authority", type: "Solicitation", providerName: "serper", samUrl: "https://flyorf.com", source: "manual" },
  { title: "Occupational Medicine Staffing Services and Electronic Health Records", agency: "Unknown", type: "Solicitation", providerName: "serper", samUrl: "https://highergov.com", source: "manual" },
  { title: "Employment Screening Services Contracts for Bid", agency: "Unknown", type: "Solicitation", providerName: "serper", samUrl: "https://iq.govwin.com", source: "manual" },
  { title: "Worker's Comp Health Bids, RFP & Government Contracts", agency: "Unknown", type: "Solicitation", providerName: "serper", samUrl: "https://instantmarkets.com", source: "manual" },
  { title: "Request for Proposals to Perform DOT and Non-DOT Employment Drug Testing", agency: "City of Brownsville TX", type: "Solicitation", providerName: "serper", samUrl: "https://brownsvilletx.gov", source: "manual" },
  { title: "RFP P-10000508 Medical Services For Health Assessments", agency: "Unknown", type: "Solicitation", providerName: "serper", samUrl: "https://highergov.com", source: "manual" },
  { title: "OCCUPATIONAL HEALTH SERVICES - Loudoun County", agency: "Loudoun County VA", type: "Solicitation", providerName: "serper", samUrl: "https://loudoun.gov", source: "manual" },
  { title: "Request for Qualifications/Proposals FY27 UW Occupational Health", agency: "University of Washington", type: "Solicitation", providerName: "serper", samUrl: "https://highergov.com", source: "manual" },
  { title: "RFP - Medical Evaluations and Services - SAM.gov", agency: "Federal Agency", type: "Solicitation", providerName: "serper", samUrl: "https://sam.gov", source: "manual" },
  { title: "REQUEST FOR PROPOSAL FY25-RFP-004 Medical Services", agency: "Dallas Area Rapid Transit (DART)", type: "Solicitation", providerName: "serper", samUrl: "https://ridedart.com", source: "manual" },
  { title: "Occupational Health Services - City of Minneapolis MN", agency: "City of Minneapolis, MN", type: "Solicitation", providerName: "serper", samUrl: "https://rfpmart.com", source: "manual" },
  { title: "RFP Occupational Health Services - City of Moline IL", agency: "City of Moline, IL", type: "Solicitation", providerName: "serper", samUrl: "https://moline.il.us", source: "manual" },
  { title: "RFP 25-0459 OCCUPATIONAL HEALTH SERVICES - New Hanover County NC", agency: "New Hanover County, NC", type: "Solicitation", providerName: "serper", samUrl: "https://nhcgov.com", source: "manual" },
  { title: "Annual Contract for Occupational Health Testing - San Antonio", agency: "City of San Antonio", type: "Solicitation", providerName: "serper", samUrl: "https://webapp1.sanantonio.gov", source: "manual" },
  { title: "S222--Regulated Medical Waste Disposal Services", agency: "VA Medical Center", type: "Solicitation", providerName: "serper", samUrl: "https://sam.gov", source: "manual" },
  { title: "Pre-Employment Background Screening Solution RFP", agency: "Unknown", type: "Solicitation", providerName: "serper", samUrl: "https://highergov.com", source: "manual" },
  { title: "Pre Employment Psychological Testing Bids, RFP & Government Contracts", agency: "Unknown", type: "Solicitation", providerName: "serper", samUrl: "https://instantmarkets.com", source: "manual" },
];

// ════════════════════════════════════════════════════════════════
// 2. COMPETITORS
// ════════════════════════════════════════════════════════════════
const COMPETITORS = [
  { name: "Concentra", website: "https://www.concentra.com", description: "Nation's largest occupational health provider with 500+ urgent care and occupational health centers.", services: ["Occupational Health","Urgent Care","Drug Testing","Physical Exams","DOT Physicals","Workers Comp"], coverageStates: ["CA","TX","FL","NY","PA","OH","IL","GA","NC","VA","WA","CO","AZ","TN","MD"], tier: "national", headquarters: "Addison, TX", employeeCount: "40,000+", founded: "1979" },
  { name: "Premise Health", website: "https://www.premisehealth.com", description: "Leading direct healthcare company delivering onsite and virtual employer health services.", services: ["Onsite Clinics","Occupational Health","Primary Care","Wellness Programs","Mental Health"], coverageStates: ["CA","TX","FL","NY","PA","OH","IL","GA","TN","CO"], tier: "national", headquarters: "Brentwood, TN", employeeCount: "5,000+", founded: "1989" },
  { name: "WorkCare", website: "https://www.workcare.com", description: "Occupational health management company specializing in injury care, prevention, and absence management.", services: ["Absence Management","Workers Comp","Occupational Health","Drug Testing","Fit-for-Duty"], coverageStates: ["CA","TX","FL","OH","PA","IL","NC","GA","VA"], tier: "national", headquarters: "Anaheim, CA", employeeCount: "500+", founded: "1989" },
  { name: "Medcor", website: "https://www.medcor.com", description: "Onsite and near-site occupational health and injury triage services for large employers and construction.", services: ["Onsite Clinics","Injury Triage","Occupational Health","Wellness","Telehealth"], coverageStates: ["IL","CA","TX","OH","PA","GA","NC","FL"], tier: "national", headquarters: "McHenry, IL", employeeCount: "2,000+", founded: "1991" },
  { name: "Marathon Health", website: "https://www.marathon-health.com", description: "Advanced primary and occupational health clinics for employers focused on reducing healthcare costs.", services: ["Primary Care","Occupational Health","Wellness","Preventive Care","Chronic Disease"], coverageStates: ["CO","IN","TX","OH","TN","GA","FL","NC"], tier: "national", headquarters: "Burlington, VT", employeeCount: "1,000+", founded: "2004" },
  { name: "Axiom Medical", website: "https://www.axiommedical.com", description: "Occupational health management platform and clinical services for HR and risk management teams.", services: ["Workers Comp","Absence Management","Occupational Health","Telehealth","Drug Testing"], coverageStates: ["TX","CA","FL","OH","PA","GA"], tier: "regional", headquarters: "The Woodlands, TX", employeeCount: "200+", founded: "2000" },
  { name: "OHD (Occupational Health Dynamics)", website: "https://www.ohdinc.com", description: "Occupational health consulting specializing in OSHA compliance, industrial hygiene, and safety programs.", services: ["OSHA Compliance","Industrial Hygiene","Medical Surveillance","Hearing Conservation","Respirator Fit"], coverageStates: ["TX","OK","LA","AR","KS"], tier: "regional", headquarters: "Houston, TX", employeeCount: "50-200", founded: "1993" },
  { name: "AllOne Health", website: "https://www.allonehealth.com", description: "Employee health and assistance program (EAP) provider offering behavioral health and occupational health services.", services: ["EAP","Behavioral Health","Occupational Health","Wellness","Absence Management"], coverageStates: ["MA","NY","CT","NJ","PA","OH","FL"], tier: "regional", headquarters: "Worcester, MA", employeeCount: "200+", founded: "1974" },
];

// ════════════════════════════════════════════════════════════════
// 3. CLIENTS (with contacts)
// ════════════════════════════════════════════════════════════════
const CLIENTS = [
  {
    client: { name: "AC Transit", website: "https://www.actransit.org", industry: "Public Transit", headquarters: "Oakland, CA" },
    contacts: [
      ["Salvador Sal Llamas","CEO / General Manager","General Manager / Chief Executive Officer"],
      ["Aaron Vogel","COO","Chief Operating Officer"],
      ["Chris Andrichak","CFO","Chief Financial Officer"],
      ["Ahsan Baig","CIO","Chief Information Officer"],
      ["James Arcellana","Human Resources / People","Executive Director of Human Resources"],
      ["Ramakrishna Pochiraju","Planning / Engineering","Executive Director of Planning and Engineering"],
      ["Claudia Burgos","External Affairs","Executive Director of External Affairs and Customer Experience"],
    ],
  },
  {
    client: { name: "CACI International", website: "https://www.caci.com", industry: "Defense IT & Services", headquarters: "Reston, VA" },
    contacts: [
      ["John S. Mengucci","CEO / Board","President, CEO & Director"],
      ["Angie Combs","Human Resources / People","EVP & CHRO"],
      ["Amanda Burns","Human Resources / People","SVP, HR Ops & Compliance"],
      ["Jackie Harding","Operations / EHS","EVP, Business Ops (EHS Sponsor)"],
      ["Amanda Christian","Procurement / Supply Chain","VP, Procurement & Contracts"],
      ["Sidney Jones","Contracts / Subcontracts","Director, Subcontracts Management"],
      ["H. Breshin-Otero","Legal / Compliance","VP, Deputy General Counsel, Labor & Employment"],
    ],
  },
  {
    client: { name: "California Dept of Corrections and Rehabilitation", website: "https://www.cdcr.ca.gov", industry: "State Government", headquarters: "Sacramento, CA" },
    contacts: [
      ["Jeff Macomber","Secretary / Agency Head","Secretary"],
      ["Dr. Diana Toche","Undersecretary / Health Care Services","Undersecretary – Health Care Services"],
      ["Jennifer Barretto","Undersecretary / Administration","Undersecretary – Administration"],
      ["Jason Johnson","Undersecretary / Operations","Undersecretary – Operations"],
      ["Sarah Brattin","Legal","Assistant Secretary / Chief Counsel – Legal Affairs"],
    ],
  },
  {
    client: { name: "Constellis", website: "https://www.constellis.com", industry: "Security & Defense Services", headquarters: "Herndon, VA" },
    contacts: [
      ["Tim Buckman","CEO","Chief Executive Officer"],
      ["Matt Shorr","COO","Chief Operating Officer"],
      ["Richard Russo","CFO","Chief Financial Officer"],
    ],
  },
];

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n🚀 Master seed → ${BASE}\n`);
  const stats = { opps: 0, competitors: 0, clients: 0, contacts: 0, errors: [] };

  // ── 1. Opportunities ─────────────────────────────────────────
  console.log("📋 Seeding opportunities...");
  const { data: existingOpps } = await get("/opportunities?limit=200").catch(() => ({ data: [] }));
  const existingOppTitles = new Set((existingOpps || []).map((o) => o.title.toLowerCase()));

  for (const opp of OPPORTUNITIES) {
    if (existingOppTitles.has(opp.title.toLowerCase())) { console.log(`  ⏭  ${opp.title.slice(0,60)}`); continue; }
    try {
      await post("/opportunities", {
        ...opp,
        postedDate: new Date().toISOString(),
        status: "active",
      });
      console.log(`  ✅ ${opp.title.slice(0,60)}`);
      stats.opps++;
    } catch (e) {
      console.error(`  ❌ ${opp.title.slice(0,50)}: ${e.message}`);
      stats.errors.push(e.message);
    }
  }

  // ── 2. Competitors ───────────────────────────────────────────
  console.log("\n🎯 Seeding competitors...");
  const { competitors: existingComps } = await get("/competitors").catch(() => ({ competitors: [] }));
  const existingCompNames = new Set((existingComps || []).map((c) => c.name.toLowerCase()));

  for (const comp of COMPETITORS) {
    if (existingCompNames.has(comp.name.toLowerCase())) { console.log(`  ⏭  ${comp.name}`); continue; }
    try {
      await post("/competitors", comp);
      console.log(`  ✅ ${comp.name}`);
      stats.competitors++;
    } catch (e) {
      console.error(`  ❌ ${comp.name}: ${e.message}`);
      stats.errors.push(e.message);
    }
  }

  // ── 3. Clients + Contacts ────────────────────────────────────
  console.log("\n🏢 Seeding clients...");
  const { clients: existingClients } = await get("/clients").catch(() => ({ clients: [] }));
  const existingClientNames = new Set((existingClients || []).map((c) => c.name.toLowerCase()));
  const clientIdMap = Object.fromEntries((existingClients || []).map((c) => [c.name.toLowerCase(), c.id]));

  for (const { client, contacts } of CLIENTS) {
    let clientId;
    if (existingClientNames.has(client.name.toLowerCase())) {
      clientId = clientIdMap[client.name.toLowerCase()];
      console.log(`  ⏭  ${client.name} (exists: ${clientId})`);
    } else {
      try {
        const { client: created } = await post("/clients", client);
        clientId = created.id;
        console.log(`  ✅ ${client.name} (${clientId})`);
        stats.clients++;
      } catch (e) {
        console.error(`  ❌ ${client.name}: ${e.message}`);
        stats.errors.push(e.message);
        continue;
      }
    }
    // Seed contacts
    try {
      const payload = contacts.map(([name, categoryRaw, title]) => ({ name, categoryRaw, title }));
      const r = await post(`/clients/${clientId}/contacts/bulk`, { contacts: payload, replace: false });
      console.log(`     👥 ${r.added ?? contacts.length} contacts for ${client.name}`);
      stats.contacts += r.added ?? contacts.length;
    } catch (e) {
      console.error(`     ⚠️  Contacts failed for ${client.name}: ${e.message}`);
      stats.errors.push(e.message);
    }
  }

  // ── Summary ──────────────────────────────────────────────────
  console.log(`\n── Summary ────────────────────────────────────────`);
  console.log(`   Opportunities created:  ${stats.opps}`);
  console.log(`   Competitors created:    ${stats.competitors}`);
  console.log(`   Clients created:        ${stats.clients}`);
  console.log(`   Contacts added:         ${stats.contacts}`);
  if (stats.errors.length) console.log(`   Errors: ${stats.errors.length}`);
  console.log(`───────────────────────────────────────────────────\n`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
