/**
 * seed-prospects-and-contacts.mjs
 *
 * Creates all prospects and their contacts from the PDF org data.
 * Safely skips prospects that already exist (by name).
 *
 * Usage:
 *   node scripts/seed-prospects-and-contacts.mjs --base=https://your-app.replit.app/api
 *   SEED_API_BASE=https://your-app.replit.app/api node scripts/seed-prospects-and-contacts.mjs
 */

const argBase = process.argv.find((a) => a.startsWith("--base="))?.slice("--base=".length);
const BASE = (argBase || process.env.SEED_API_BASE || "http://localhost:3000/api").replace(/\/$/, "");

// ── Prospect + contact data ──────────────────────────────────────────────────
const SEED = [
  {
    prospect: {
      name: "Airbus Defence and Space", website: "https://www.airbus.com/en/products-services/defence",
      description: "Global aerospace and defense manufacturer with substantial US workforce across manufacturing and engineering facilities.",
      industry: "Defense & Aerospace", headquarters: "Leiden, Netherlands (US: Herndon, VA)",
      employeeCount: "35,000+", founded: "2014", tier: "strategic", status: "prospect",
      naicsCodes: ["336411","336412","541330","336415"],
    },
    contacts: [
      ["Michael Schoellhorn","CEO","Chief Executive Officer, Airbus Defence and Space"],
      ["Guillaume Faury","Parent Company CEO","Chief Executive Officer, Airbus SE; Director"],
      ["Thomas Toepfer","Finance","Chief Financial Officer, Airbus SE"],
      ["Carmen-Maja Rex","Human Resources / People","Chief Human Resources Officer, Airbus SE"],
      ["John Harrison","Legal / Public Affairs","General Counsel & Head of Airbus Public Affairs"],
      ["Nathalie Rau","Human Resources / People","Executive Vice-President of Human Resources, Airbus Defence and Space"],
      ["Dominik Eisenhut","Legal / Compliance","General Counsel, Head of Legal & Compliance, Airbus Defence and Space"],
      ["Robert Geckle","U.S. Defence / Space subsidiary","Chairman and CEO, Airbus U.S. Space & Defense, Inc."],
      ["Mohamed Denden","U.S. Defence / Space subsidiary","Chief Financial Officer, Airbus U.S. Space & Defense, Inc."],
      ["Dominique Arnal","Procurement / Supply Chain","SVP – Head of Procurement, Supply Chain & Logistics, Airbus Defence and Space"],
      ["Vincent Laraignou","Procurement / Programme Procurement","Head of Defence Programme Procurement, Airbus"],
      ["David Sobrado","Procurement / Commodity Procurement","Head of Procurement – Light Propulsion & Power on Board, Airbus Defence and Space"],
      ["Kristina Quade","EHS / Safety","Head of EHS Bremen, Airbus Defence & Space GmbH"],
      ["Mathew Medjeral","EHS / Safety","Head of EHS Performance & Improvement, Airbus"],
      ["Benjamin Punge","Quality","Head of Quality, Airbus Defence and Space"],
      ["Amanda Murphy","Quality","Head of Quality – Space Digital, Airbus Defence and Space"],
      ["Christine Hahn","Quality","Quality Data Office Lead, Airbus Defence and Space"],
      ["Constantin Popa","Quality / Regulatory Compliance","Product Regulatory Compliance Manager, Airbus Defence and Space – HSEQ Expert"],
      ["Ben Bridge","Operations / Business","Executive Vice President Global Business, Airbus Defence and Space"],
      ["Penelope Jane Basson","Governance / Quality / Security","Head of Corporate Governance, Quality and Security, Airbus Defence and Space"],
    ],
  },
  {
    prospect: {
      name: "Boeing", website: "https://www.boeing.com",
      description: "World's largest aerospace company with massive US manufacturing operations across commercial, defense, and space divisions.",
      industry: "Defense & Aerospace", headquarters: "Arlington, VA",
      employeeCount: "170,000+", founded: "1916", tier: "strategic", status: "prospect",
      naicsCodes: ["336411","336412","336413","541330"],
    },
    contacts: [
      ["Kelly Ortberg","CEO","President and Chief Executive Officer"],
      ["Jesus Jay Malave","CFO","Chief Financial Officer; Executive Vice President, Finance"],
      ["Uma Amuluru","Human Resources / People","Chief Human Resources Officer; Executive Vice President, Human Resources"],
      ["Brett C. Gerry","Legal / Compliance","Chief Legal Officer; Executive Vice President, Global Compliance"],
      ["Darrin A. Hostetler","Compliance","Chief Compliance Officer; Vice President, Global Compliance"],
      ["Dana Deasy","Information / Digital / Security","Chief Information Digital Officer; Senior Vice President"],
      ["Howard McKenzie","Engineering / Technology","Chief Engineer; Executive Vice President, Engineering, Test & Technology"],
      ["Don Ruhmann","EHS / Safety","Chief Aerospace Safety Officer; Senior Vice President, Global Aerospace Safety"],
      ["Jeff Shockey","Government / Strategy","Executive Vice President, Government Operations, Global Public Policy & Corporate Strategy"],
      ["Ann M. Schmidt","Communications","Chief Communications and Brand Officer; Senior Vice President"],
      ["Stephanie Pope","Business Unit","President and CEO, Boeing Commercial Airplanes"],
      ["Stephen Parker","Business Unit","President and CEO, Boeing Defense, Space & Security"],
    ],
  },
  {
    prospect: {
      name: "General Atomics", website: "https://www.ga.com",
      description: "Defense technology company specializing in nuclear energy, unmanned aircraft systems, and electromagnetic systems with large San Diego workforce.",
      industry: "Defense Technology", headquarters: "San Diego, CA",
      employeeCount: "16,000+", founded: "1955", tier: "enterprise", status: "prospect",
      naicsCodes: ["336411","541712","541330","336415"],
    },
    contacts: [
      ["Neal Blue","CEO / Chair","Chairman & CEO, General Atomics"],
      ["Linden S. Blue","Vice Chair","Vice Chairman, General Atomics"],
      ["Liam Kelly","CFO","Senior Vice President and Chief Financial Officer"],
      ["Richard Chase","Human Resources / People","Chief Human Resources Officer"],
      ["Mike Vigil","Security","Chief Security Officer, Vice President"],
      ["Jose Alatorre","Quality","Senior Quality Manager of Supplier Quality"],
      ["Linden P. Blue","Business Group","CEO, General Atomics Aeronautical Systems Inc. (GA-ASI)"],
      ["David R. Alexander","Operations / Aircraft Systems","President, Aircraft Systems Group, GA-ASI"],
      ["Scott Forney","Business Group","President, General Atomics Electromagnetic Systems (GA-EMS)"],
      ["Sharon Goldin","Procurement / Supply Chain","Senior Contracts Manager"],
    ],
  },
  {
    prospect: {
      name: "HENSOLDT", website: "https://www.hensoldt.net",
      description: "German defense electronics company with growing US operations specializing in radar, optronics, and electronic warfare.",
      industry: "Defense Electronics", headquarters: "Taufkirchen, Germany (US: Herndon, VA)",
      employeeCount: "6,800+", founded: "2017", tier: "mid-market", status: "prospect",
      naicsCodes: ["334511","334512","541330"],
    },
    contacts: [
      ["Oliver Dörre","CEO","CEO, HENSOLDT AG"],
      ["Christian Ladurner","CFO","CFO, HENSOLDT AG"],
      ["Dr. Lars Immisch","Human Resources / People","Chief Human Resources Officer, Member of the Management Board"],
      ["Jochen Pfister","Procurement / Supply Chain","Chief Procurement Officer"],
      ["Riccardo Cosentino","Procurement / Supply Chain","Head of Procurement"],
      ["Chris Venter","Procurement / Supply Chain","Operational Procurement Manager, HENSOLDT Optronics"],
      ["Dexter Stevenson","Quality","Quality Specialist, Hensoldt Optronics"],
    ],
  },
  {
    prospect: {
      name: "Kongsberg Defence & Aerospace", website: "https://www.kongsberg.com/kda",
      description: "Norwegian defense company with US operations delivering missile systems, remote weapon stations, and C2 technology.",
      industry: "Defense & Aerospace", headquarters: "Kongsberg, Norway (US: Johnstown, PA)",
      employeeCount: "5,000+", founded: "1814", tier: "mid-market", status: "prospect",
      naicsCodes: ["336414","334511","541330"],
    },
    contacts: [
      ["Eirik Lie","CEO / President","President, Kongsberg Defence & Aerospace"],
      ["Martin Wien Fjell","Finance","Executive Vice President Finance"],
      ["Heather Armentrout","U.S. Operations","President & General Manager, Kongsberg Defence US"],
      ["Olivia Shultz","Human Resources / People","Vice President, Human Resources, Kongsberg Defence US"],
      ["Robin Lindgren","Procurement / Supply Chain","Vice President of Supply Chain, Kongsberg Defence & Aerospace US"],
      ["Nathan Brown","Finance","Chief Financial Officer, Kongsberg Defence US"],
      ["Ken Rothaermel","Strategy / Business Development","Vice President, Business Development, Kongsberg Defence US"],
      ["Anne Marie Aanerud","Government Relations / Communications","Executive Vice President Government Relations and Communication"],
    ],
  },
  {
    prospect: {
      name: "Leonardo DRS", website: "https://www.leonardodrs.com",
      description: "US defense electronics subsidiary of Italy's Leonardo, providing advanced technology solutions to US military and government customers.",
      industry: "Defense Electronics", headquarters: "Arlington, VA",
      employeeCount: "10,000+", founded: "2001", tier: "enterprise", status: "prospect",
      naicsCodes: ["334511","334512","541330","336415"],
    },
    contacts: [
      ["Roberto Cingolani","CEO; Board","Chief Executive Officer and General Manager; Director"],
      ["Stefano Pontecorvo","Chair; Board","Chairman"],
      ["Alessandra Genco","Finance","Chief Financial Officer"],
      ["Lucio Valerio Cioffi","Human Resources / People","Co-General Manager"],
      ["Lorenzo Mariani","Legal / Governance","Co-General Manager"],
      ["Francesco Carena","Procurement / Supply Chain","Head of New Technologies – Procurement & Supply Chain"],
      ["Daniel Rambaud","Quality / Supply Chain","Lead Supply Chain & Quality Manager"],
    ],
  },
  {
    prospect: {
      name: "Northrop Grumman", website: "https://www.northropgrumman.com",
      description: "Major US defense contractor and technology company with a large, geographically dispersed workforce across aerospace, defense, and intelligence sectors.",
      industry: "Defense & Aerospace", headquarters: "Falls Church, VA",
      employeeCount: "100,000+", founded: "1939", tier: "strategic", status: "prospect",
      naicsCodes: ["336411","336414","541330","541512"],
    },
    contacts: [
      ["Kathy J. Warden","CEO / Chair","Chair, Chief Executive Officer and President"],
      ["John T. Greene","CFO","Chief Financial Officer, Corporate Vice President"],
      ["Michael A. Hardesty","Accounting","Chief Accounting Officer, Corporate Vice President, Controller"],
      ["Kathryn G. Simpson","Legal","Corporate Vice President, General Counsel"],
      ["Melanie M. Heitkamp","Human Resources / People","Corporate Vice President and Chief Human Resources Officer"],
      ["Dr. Mike Witt","EHS / Quality / Safety","Vice President and Chief Environment, Quality and Safety Officer"],
      ["Patrick Packard","Quality / Mission Assurance / EHS","Vice President Quality, Mission Assurance & EHS"],
      ["Ralph DeVicariis","Procurement / Supply Chain / Quality","Procurement Quality Manager"],
      ["Ben R. Davies","Operations / Sector","Corporate Vice President and President, Defense Systems Sector"],
      ["Bruce Stephenson","Strategy / Technology","Vice President, Corporate Strategy and Technology"],
    ],
  },
  {
    prospect: {
      name: "Parsons Corporation", website: "https://www.parsons.com",
      description: "Technology-driven defense, intelligence, and critical infrastructure solutions company with large federal workforce.",
      industry: "Defense & Technology", headquarters: "Chantilly, VA",
      employeeCount: "17,000+", founded: "1944", tier: "enterprise", status: "prospect",
      naicsCodes: ["541330","541512","541611","236220"],
    },
    contacts: [
      ["Carey Smith","CEO / Chair","Chair, President, and Chief Executive Officer"],
      ["Matt Ofilos","CFO","Chief Financial Officer"],
      ["John Martinez","Legal","Chief Legal Officer"],
      ["Soo Lagasse","Human Resources / People","Chief Human Resources Officer"],
      ["Wendy","Business Operations / Procurement / Safety / ESG","Chief Business Operations Officer"],
      ["Thomas Parks","Procurement / Supply Chain","Director, Procurement"],
      ["Mohammed Tajuddin","Procurement / Supply Chain","Senior Contracts & Procurement Manager"],
      ["Amar Satti","Procurement / Supply Chain","Procurement Manager"],
      ["Karl Razey","Procurement / Supply Chain","Procurement Supervisor"],
      ["James Spicer","Contracts / Subcontracts","Subcontracts Manager"],
    ],
  },
  {
    prospect: {
      name: "Peckham, Inc.", website: "https://www.peckham.org",
      description: "Nonprofit community rehabilitation organization providing employment and support services for people with disabilities, with significant government contracts.",
      industry: "Government Services / Nonprofit", headquarters: "Lansing, MI",
      employeeCount: "4,000+", founded: "1976", tier: "mid-market", status: "prospect",
      naicsCodes: ["624310","561499","336390"],
    },
    contacts: [
      ["Harry Pianko","CEO","Chief Executive Officer"],
      ["Barry J. Kavanagh","CFO","Chief Financial Officer"],
      ["Lisa Webb Sharpe","COO","Chief Operating Officer"],
      ["Justin Walworth","CHRO / Human Resources","Chief Human Resources Officer"],
      ["Matthew June","CIO / Technology","Chief Information Officer"],
      ["Caleb Adams","Human Services","Chief Human Services Officer"],
      ["Tina Alonzo","Human Resources / People","Vice President of Belonging"],
    ],
  },
  {
    prospect: {
      name: "Peraton", website: "https://www.peraton.com",
      description: "Leading mission capability integrator providing advanced technology and cybersecurity solutions to the US government.",
      industry: "Defense & Intelligence", headquarters: "Herndon, VA",
      employeeCount: "24,000+", founded: "2017", tier: "enterprise", status: "prospect",
      naicsCodes: ["541512","541519","541330","561210"],
    },
    contacts: [
      ["Steve Schorer","CEO / Chair","Chairman & CEO"],
      ["Bob Genter","President / COO","President & Chief Operating Officer"],
      ["Todd Borkey","Technology","Chief Technology Officer"],
      ["Jim Winner","Legal","Chief Legal Officer, General Counsel"],
      ["Szu Yang","Contracts","Chief Contracts Officer"],
      ["Tom Terjesen","Information Technology","Chief Information Officer"],
      ["Bill Mertz","Procurement / Supply Chain","Chief Procurement Officer"],
      ["Christy Wilder","Security","Chief Security Officer"],
      ["Brian Bath","EHS / Safety","Safety professional at Peraton"],
    ],
  },
  {
    prospect: {
      name: "RTX Corp", website: "https://www.rtx.com",
      description: "Aerospace and defense conglomerate (Raytheon, Collins Aerospace, Pratt & Whitney) with one of the largest industrial workforces in the US.",
      industry: "Defense & Aerospace", headquarters: "Arlington, VA",
      employeeCount: "185,000+", founded: "2020", tier: "strategic", status: "prospect",
      naicsCodes: ["336412","336413","334511","541330"],
    },
    contacts: [
      ["Christopher T. Calio","CEO / Chair","Chairman & Chief Executive Officer"],
      ["Neil G. Mitchill Jr.","CFO","Chief Financial Officer"],
      ["Dantaya Williams","Human Resources / People","Chief Human Resources Officer"],
      ["Juan M. de Bedout","Technology","Chief Technology Officer"],
      ["Raja Maharajh","Legal","General Counsel"],
      ["Vincent M. Campisi","Digital","Chief Digital Officer"],
      ["Paolo Dal Cin","Operations / Supply Chain / Quality / EHS","Operations, Supply Chain & Quality and Environment, Health & Safety"],
      ["Jennifer Brummund","Human Resources / People","VP and Chief Human Resources Officer, Raytheon"],
      ["Bob Butz","Operations / Supply Chain / Quality","SVP Operations, Supply Chain & Quality, Raytheon"],
      ["Chris McDavid","Legal / Contracts / Compliance","VP and General Counsel, Legal, Contracts & Compliance, Raytheon"],
    ],
  },
  {
    prospect: {
      name: "Safran", website: "https://www.safran-group.com",
      description: "French multinational aerospace and defense company with significant US manufacturing operations in propulsion, equipment, and interiors.",
      industry: "Defense & Aerospace", headquarters: "Paris, France (US: multiple states)",
      employeeCount: "92,000+", founded: "2005", tier: "enterprise", status: "prospect",
      naicsCodes: ["336412","336413","336415","541330"],
    },
    contacts: [
      ["Olivier Andriès","CEO; Board","Chief Executive Officer, Director"],
      ["Ross McInnes","Chair; Board","Chairman of the Board"],
      ["Pascal Bantegnie","CFO","Chief Financial Officer"],
      ["Stéphane Dubois","Human Resources / People","EVP, Corporate Human and Social Responsibility"],
      ["Roque Carmona","Procurement / Supply Chain","Group Chief Procurement Officer"],
    ],
  },
  {
    prospect: {
      name: "SAIC", website: "https://www.saic.com",
      description: "Technology integrator providing IT, systems engineering, and professional services to the US government and military.",
      industry: "Defense IT & Services", headquarters: "Reston, VA",
      employeeCount: "23,000+", founded: "1969", tier: "enterprise", status: "prospect",
      naicsCodes: ["541512","541519","541330","561210"],
    },
    contacts: [
      ["Jim Reagan","CEO; Board","Chief Executive Officer; Director"],
      ["Prabu Natarajan","CFO","Executive Vice President and Chief Financial Officer"],
      ["Kathleen McCarthy","Human Resources / People","Executive Vice President and Chief Human Resources Officer"],
      ["Hilary Hageman","Legal","Executive Vice President, General Counsel and Corporate Secretary"],
      ["Ravi Dankanikote","Strategy / Business Development","Chief Growth Officer"],
      ["Marty Alverson","Procurement / Supply Chain","Vice President, Chief Procurement Officer"],
      ["Julie Thomas","EHS / Safety","Global Director – Environmental Health & Safety"],
      ["Patricia Farrell","EHS / Safety","Occupational Safety & Health Engineer"],
      ["Dana Aycock","EHS / Safety","Health and safety professional"],
      ["Doug Gaum","Quality","Director of Quality Assurance at SAIC-Frederick"],
      ["Steve Chatelain","Quality","Quality Manager"],
      ["Edward Ellis","Quality","Quality Assurance Manager"],
    ],
  },
  {
    prospect: {
      name: "Serco Group", website: "https://www.serco.com",
      description: "International public services company delivering defense, justice, immigration, and transport services to governments worldwide including the US.",
      industry: "Government Services", headquarters: "Hook, UK (US: Reston, VA)",
      employeeCount: "50,000+", founded: "1929", tier: "enterprise", status: "prospect",
      naicsCodes: ["561210","541330","922190","488190"],
    },
    contacts: [
      ["Keith Williams CBE","Chair","Chair"],
      ["Anthony Kirby","CEO","Group Chief Executive"],
      ["Nigel Crossley","CFO","Group CFO"],
      ["Fiona Walters","Executive Committee / Regional Operations","Chief Executive Officer, Serco UK & Europe"],
      ["Michael LaRouche","Executive Committee / Americas","Chief Executive Officer, Serco Americas"],
      ["Richard Anderton","EHS / Safety / Quality","Head of Health Safety Quality and Environment"],
      ["Chris Huddart","EHS / Safety / Quality","Director of HSEQ"],
      ["Paul Feeney","Procurement / Supply Chain","Senior procurement and supply chain professional at Serco"],
    ],
  },
  {
    prospect: {
      name: "Tecmotiv (USA) Inc.", website: "https://www.tecmotiv.com",
      description: "Defense vehicle systems integrator with US manufacturing operations focused on military ground vehicle programs.",
      industry: "Defense Technology", headquarters: "US Operations",
      employeeCount: "1,000+", founded: "2000", tier: "mid-market", status: "prospect",
      naicsCodes: ["336992","541330","336120"],
    },
    contacts: [
      ["Gary N. Sheedy","CEO","President and Chief Executive Officer"],
      ["Andrew Edwards","CFO","Chief Financial Officer"],
      ["Dante Fortin","Procurement / Supply Chain","Purchasing & Logistics Manager"],
      ["Stephen Lovasco","Procurement / Supply Chain","Procurement Manager"],
      ["Hernando Munoz","Procurement / Supply Chain","Procurement Manager"],
      ["Steve Phillips","Procurement / Supply Chain / Materials","Director of Procurement and Materials Management for the Americas"],
      ["Doug Relyea","Business Development","Director Business Development, Sales, Purchasing"],
      ["Vaughan Callender","Business Development / Capture","Director, Capture Management Team"],
    ],
  },
  {
    prospect: {
      name: "Thales", website: "https://www.thalesgroup.com",
      description: "French multinational defense and technology group with significant US defense and aerospace operations.",
      industry: "Defense & Technology", headquarters: "Paris, France (US: various)",
      employeeCount: "77,000+", founded: "2000", tier: "enterprise", status: "prospect",
      naicsCodes: ["334511","541512","336412","541330"],
    },
    contacts: [
      ["Patrice Caine","CEO / Chair","Chairman and Chief Executive Officer"],
      ["Pascal Bouchiat","CFO / Finance","Senior Executive Vice-President, Finance and Information Systems"],
      ["Clément de Villepin","Human Resources / People","Senior Executive Vice-President, Human Resources"],
      ["Philippe Vallée","Digital","Executive Vice President, Cybersecurity and Digital Identity"],
      ["Roque Carmona","Procurement / Supply Chain","Group Chief Procurement Officer"],
      ["André Caliman","Procurement / Supply Chain","Global Head of Procurement"],
      ["Neil Watt","EHS / Safety","HSE Sustainability Manager"],
    ],
  },
  {
    prospect: {
      name: "United Launch Alliance", website: "https://www.ulalaunch.com",
      description: "Joint venture between Boeing and Lockheed Martin providing launch services to US government customers including DoD, NASA, and intelligence community.",
      industry: "Space & Launch Services", headquarters: "Centennial, CO",
      employeeCount: "3,000+", founded: "2006", tier: "mid-market", status: "prospect",
      naicsCodes: ["336414","336415","541715","541330"],
    },
    contacts: [
      ["John Elbon","CEO","Interim Chief Executive Officer"],
      ["Mark Peller","COO","Chief Operating Officer"],
      ["Mitch Van Dewerker","CFO","Interim CFO; Vice President and Controller"],
      ["Christine Stanitski","Legal","Vice President and General Counsel"],
      ["Liane J. George","Human Resources / People","Vice President, Human Resources"],
      ["Dan Caughran","Procurement / Supply Chain","Senior Vice President, Production Operations and Supply Chain"],
      ["Fred Taylor","Quality / Safety / EHS","Senior Director, Safety, Quality and Mission Success"],
      ["Andrew Blackmon","Technology / IT","Chief Information Officer"],
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${path} → ${res.status}: ${txt}`);
  }
  return res.json();
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Seeding prospects and contacts → ${BASE}\n`);

  // Load existing prospects so we don't duplicate
  const { prospects: existing } = await apiGet("/prospects");
  const existingNames = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  const idMap = Object.fromEntries(existing.map((p) => [p.name.trim().toLowerCase(), p.id]));

  let createdProspects = 0;
  let skippedProspects = 0;
  let totalContacts = 0;
  let errors = [];

  for (const { prospect, contacts } of SEED) {
    const key = prospect.name.trim().toLowerCase();
    let prospectId;

    if (existingNames.has(key)) {
      prospectId = idMap[key];
      console.log(`  ⏭  Skipping existing prospect: ${prospect.name} (${prospectId})`);
      skippedProspects++;
    } else {
      try {
        const { prospect: created } = await apiPost("/prospects", {
          ...prospect,
          naicsCodes: prospect.naicsCodes,
        });
        prospectId = created.id;
        console.log(`  ✅ Created prospect: ${prospect.name} (${prospectId})`);
        createdProspects++;
      } catch (err) {
        console.error(`  ❌ Failed to create ${prospect.name}: ${err.message}`);
        errors.push(`prospect:${prospect.name} – ${err.message}`);
        continue;
      }
    }

    // Seed contacts via bulk endpoint
    try {
      const contactPayload = contacts.map(([name, categoryRaw, title]) => ({ name, categoryRaw, title }));
      const result = await apiPost(`/prospects/${prospectId}/contacts/bulk`, {
        contacts: contactPayload,
        replace: false,
      });
      console.log(`     👥 ${result.added} contacts added for ${prospect.name}`);
      totalContacts += result.added;
    } catch (err) {
      console.error(`     ⚠️  Contacts failed for ${prospect.name}: ${err.message}`);
      errors.push(`contacts:${prospect.name} – ${err.message}`);
    }
  }

  console.log(`\n── Summary ────────────────────────────────────────`);
  console.log(`   Prospects created:  ${createdProspects}`);
  console.log(`   Prospects skipped:  ${skippedProspects}`);
  console.log(`   Contacts added:     ${totalContacts}`);
  if (errors.length) {
    console.log(`   Errors (${errors.length}):`);
    errors.forEach((e) => console.log(`     • ${e}`));
  }
  console.log(`───────────────────────────────────────────────────\n`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
