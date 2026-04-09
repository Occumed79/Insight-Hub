/**
 * Seed selected client org-structure contacts from source PDFs/notes.
 *
 * Usage:
 *   node scripts/seed-client-contacts-remote.mjs --base=http://localhost:8080/api
 *   node scripts/seed-client-contacts-remote.mjs --base=https://your-app.onrender.com/api
 *
 * You can also use:
 *   SEED_API_BASE=https://your-app.onrender.com/api node scripts/seed-client-contacts-remote.mjs
 *
 * Notes:
 * - Resolves client IDs dynamically from GET /api/clients so it works against the
 *   current database instead of relying on hardcoded UUIDs.
 * - Uses replace=true by default for clean reseeds. Pass --append to preserve existing rows.
 */

const argBase = process.argv.find((arg) => arg.startsWith("--base="))?.slice("--base=".length);
const BASE = (argBase || process.env.SEED_API_BASE || "http://localhost:8080/api").replace(/\/$/, "");
const REPLACE = !process.argv.includes("--append");

const CLIENT_ALIASES = {
  "AC Transit": ["AC Transit"],
  "CACI International": ["CACI International", "CACI"],
  "California Dept of Corrections and Rehabilitation": [
    "California Dept of Corrections and Rehabilitation",
    "California Department of Corrections and Rehabilitation",
    "CDCR",
  ],
  "Constellis": ["Constellis", "Constellis Holdings, LLC"],
};

// Contact format: [name, categoryRaw, title]
const ORG_DATA = {
  "AC Transit": [
    ["Salvador \"Sal\" Llamas", "CEO / General Manager", "General Manager / Chief Executive Officer"],
    ["Paul Kincaid", "Assistant General Manager", "Assistant General Manager / second-ranking executive"],
    ["Aaron Vogel", "COO", "Chief Operating Officer"],
    ["Chris Andrichak", "CFO", "Chief Financial Officer"],
    ["Ahsan Baig", "CIO", "Chief Information Officer"],
    ["Claudia Burgos", "External Affairs / Customer Experience", "Executive Director of External Affairs and Customer Experience"],
    ["Ramakrishna Pochiraju, P.E.", "Planning / Engineering", "Executive Director of Planning and Engineering"],
    ["James Arcellana", "Human Resources / People", "Executive Director of Human Resources"],
    ["Diane Shaw", "Board / President", "President, Ward 5"],
    ["Murphy McCalley", "Board / Vice President", "Vice President, Ward 4"],
    ["Harpreet S. Sandhu", "Board", "Director"],
    ["Jean Walsh", "Board", "Director"],
    ["Sarah Syed", "Board", "Director"],
    ["Joel B. Young", "Board", "Director"],
    ["Anthony C. Silva", "Board", "Director"],
  ],

  "CACI International": [
    ["John S. Mengucci", "CEO / Board", "President, CEO & Director"],
    ["Angie Combs", "Human Resources / People", "EVP & CHRO"],
    ["Amanda Burns", "Human Resources / People", "SVP, HR Ops & Compliance"],
    ["Tamar Becks", "Human Resources / People", "VP, Human Resources"],
    ["Jeana Plews", "Human Resources / People", "VP, HR Consulting & DEI"],
    ["Bobby Burnett", "Human Resources / People", "Exec. Dir., Talent Delivery"],
    ["H. Giangiulio", "Human Resources / People", "Exec. Dir., Talent Acq. & Growth"],
    ["Lisa Fedders", "Human Resources / People", "Exec. Dir., Talent Discovery"],
    ["H. Breshin-Otero", "Legal / Compliance", "VP, Dep. Gen. Counsel, Labor & Employment"],
    ["Windy Schneider", "Human Resources / People", "Learning Architect, L&D Programs"],
    ["Kim Henry", "Human Resources / People", "Asst. Mgr., Training Dev."],
    ["Desirée Chum", "Human Resources / People", "Sr. Benefits Partner"],
    ["Alison Brooks", "Human Resources / People", "Dir. & Head of HR, CACI UK"],
    ["Jackie Harding", "Operations / EHS", "EVP, Business Ops (EHS Sponsor)"],
    ["Amanda Christian", "Procurement / Supply Chain", "VP, Procurement & Contracts"],
    ["Sidney Jones", "Contracts / Subcontracts", "Dir., Subcontracts Mg."],
    ["Brittany Delph", "Procurement / Supply Chain", "Procurement Analyst"],
    ["Lisa S. Disbrow", "Board / Chair", "Chair, Board of Directors"],
    ["Susan M. Gordon", "Board", "Outside Director"],
    ["Ryan D. McCarthy", "Board", "Outside Director"],
    ["Scott C. Morrison", "Board", "Outside Director"],
    ["Philip O. Nolan", "Board", "Outside Director"],
    ["Deborah A. Plunkett", "Board", "Outside Director"],
    ["Stanton D. Sloane", "Board", "Outside Director"],
    ["Charles L. Szews", "Board", "Outside Director"],
    ["Adm. Michael Gilday", "Board", "Director"],
    ["David Kiefer", "Board", "Director"],
  ],

  "California Dept of Corrections and Rehabilitation": [
    ["Jeff Macomber", "Secretary / Agency Head", "Secretary"],
    ["Jennifer Barretto", "Undersecretary / Administration", "Undersecretary – Administration"],
    ["Jason Johnson", "Undersecretary / Operations", "Undersecretary – Operations"],
    ["Dr. Diana Toche", "Undersecretary / Health Care Services", "Undersecretary – Health Care Services"],
    ["Sarah Brattin", "Legal", "Assistant Secretary / Chief Counsel – Legal Affairs"],
    ["Sean Connelly", "Communications", "Assistant Secretary – Office of Public and Employee Communications"],
    ["Alex Norring", "Legislative Affairs", "Assistant Secretary – Legislative Affairs"],
    ["Terri Hardy", "Communications / Press", "Press Secretary"],
    ["Bryan Byrd", "Communications / External Affairs", "Chief, Strategic Communications & External Affairs"],
    ["David Maldonado", "Communications / External Affairs", "Deputy Chief, Strategic Communications & External Affairs"],
    ["Cathy Cruz Jefferson", "Research", "Deputy Director, Office of Research"],
    ["Joseph Tuggle", "Adult Institutions / Regional Operations", "Associate Director, Region I, Division of Adult Institutions"],
    ["Patrick Eaton", "Adult Institutions / Facility Support", "Deputy Director of Facility Support, Division of Adult Institutions"],
    ["Sircoya M. Williams", "Institutional Operations", "Warden, California Medical Facility"],
    ["Scott Wyckoff", "Parole / Board of Parole Hearings", "Executive Officer, Board of Parole Hearings"],
    ["Jessica Blonien", "Parole / Legal", "Chief Counsel, Board of Parole Hearings"],
    ["Tara M. Doetsch", "Parole / Program Operations", "Chief Deputy of Program Operations, Board of Parole Hearings"],
    ["Dan Moeller", "Parole / Field Operations", "Acting Chief Deputy of Field Operations, Board of Parole Hearings"],
    ["Jasmine A. Tehrani", "Parole / Clinical", "Chief Psychologist, Board of Parole Hearings"],
    ["Ryan Youtsey", "Investigations / Reentry / Screening", "Chief Deputy, Investigations Reentry and Screening Division, Board of Parole Hearings"],
  ],

  "Constellis": [
    ["Daniel Gelston", "CEO", "Chief Executive Officer"],
    ["Terry Ryan", "Executive Vice Chairman / Former CEO", "Executive Vice Chairman (former CEO)"],
    ["Paul Donahue", "Operations / Global Security Services", "President, Global Security Services"],
    ["Andrew (Andy) Hartsog", "Operations / Mission Support Services", "EVP, Mission Support Services"],
    ["Darin Cabral", "Finance", "Chief Financial and Administrative Officer"],
    ["Noah Teates", "Strategy", "Chief Strategy Officer"],
    ["Jay Sipper", "Information / Digital / Technology", "Chief Information Officer"],
    ["Marissa Holdorf", "Human Resources / People", "Chief Human Resources Officer"],
    ["Jason Rahimitabar", "Operations / LEXSO", "EVP, LEXSO"],
    ["Olivia Fines", "Legal / Compliance", "Chief Legal & Compliance Officer / Corp. Secretary"],
    ["Michael Lundin", "Board / Chair", "Lead Director / Board Chair"],
    ["Vice Adm. Colin J. Kilrain, USN (Ret.)", "Board", "Independent Director"],
    ["Kurt Takahashi", "Board", "Independent Director"],
    ["Chad Coben", "Board", "Independent Director"],
    ["Emily Alva", "Board / Advisory", "Special Advisor to Board & CEO"],
    ["Kate McKenzie-Veal", "Legal", "VP, Legal – Deputy General Counsel"],
    ["David Martin", "Business Development / Capture", "VP, Business Development & Capture"],
    ["Konstantinos Maroulis", "Business Development / Mission Support Services", "VP, Business Development, MSS"],
    ["David Gerber", "Finance", "VP, Division Finance"],
    ["Ashley Meston", "Business Development / LEXSO", "VP, Sales & BD (LEXSO)"],
    ["Don Semon", "Operations", "VP (exact function not surfaced publicly in source note)"],
    ["Mark Power", "Operations / Corporate Transformation", "Sr. Director, Corporate Transformation"],
    ["Olimpia Ringley", "Pricing / Finance", "Sr. Director, Pricing"],
    ["Nancy Sanchez Garcia", "Human Resources / People", "Sr. Director, HRIS"],
    ["Mary Barr, CPP", "Finance / Payroll", "Director, Global Payroll"],
    ["Michelle Smith, SHRM-SCP, MBA", "Human Resources / People", "Senior HR professional"],
    ["Danielle Kapetanovic", "Procurement / Supply Chain", "Director of Procurement"],
  ],
};

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function findClientId(clients, canonicalName) {
  const aliases = CLIENT_ALIASES[canonicalName] || [canonicalName];
  for (const alias of aliases) {
    const match = clients.find((c) => normalize(c.name) === normalize(alias));
    if (match) return match.id;
  }
  return null;
}

async function getClients() {
  const res = await fetch(`${BASE}/clients`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load clients: HTTP ${res.status}${body ? `: ${body}` : ""}`);
  }
  const data = await res.json();
  return data.clients || [];
}

async function seed() {
  let totalAdded = 0;
  const errors = [];

  console.log(`Seeding client contacts to ${BASE}`);
  console.log(`Mode: ${REPLACE ? "replace" : "append"}`);

  const clients = await getClients();

  for (const [clientName, contacts] of Object.entries(ORG_DATA)) {
    const clientId = findClientId(clients, clientName);
    if (!clientId) {
      console.error(`✗ ${clientName}: client ID not found in live API response`);
      errors.push({ client: clientName, error: "client ID not found" });
      continue;
    }

    const payload = contacts.map(([name, categoryRaw, title]) => ({
      name,
      categoryRaw,
      title,
    }));

    try {
      const res = await fetch(`${BASE}/clients/${clientId}/contacts/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: payload, replace: REPLACE }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${body ? `: ${body}` : ""}`);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      console.log(`✓ ${clientName}: ${data.added} contacts`);
      totalAdded += data.added;
    } catch (e) {
      console.error(`✗ ${clientName}: ${e.message}`);
      errors.push({ client: clientName, error: e.message });
    }
  }

  console.log(`\n✓ Done. ${totalAdded} client contacts seeded across ${Object.keys(ORG_DATA).length} clients.`);
  if (errors.length) console.error("Errors:", errors);
}

seed().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
