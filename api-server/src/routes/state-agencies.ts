/**
 * State Agencies Intelligence Routes
 *
 * GET  /api/state-agencies/states                         — list all 50 state profiles
 * GET  /api/state-agencies/items?stateCode=CA&bucket=...  — items for state + bucket
 * POST /api/state-agencies/refresh                        — refresh bucket for state
 * GET  /api/state-agencies/intel?channel=...              — cross-state intel items
 * POST /api/state-agencies/intel/refresh                  — refresh cross-state channel
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  stateProfilesTable,
  stateAgencyItemsTable,
  stateIntelItemsTable,
} from "@workspace/db/schema";
import type { StateAgencyBucket, StateIntelChannel } from "@workspace/db/schema";
import { serperProvider } from "../lib/providers/serper";

const router = Router();

// ── 50-state seed data ─────────────────────────────────────────────────────────

const STATES_SEED = [
  { stateCode: "AL", stateName: "Alabama",         region: "Southeast",     oshaStatePlan: "federal" },
  { stateCode: "AK", stateName: "Alaska",          region: "West",          oshaStatePlan: "full" },
  { stateCode: "AZ", stateName: "Arizona",         region: "Southwest",     oshaStatePlan: "full" },
  { stateCode: "AR", stateName: "Arkansas",        region: "South",         oshaStatePlan: "federal" },
  { stateCode: "CA", stateName: "California",      region: "West",          oshaStatePlan: "full" },
  { stateCode: "CO", stateName: "Colorado",        region: "Mountain",      oshaStatePlan: "federal" },
  { stateCode: "CT", stateName: "Connecticut",     region: "Northeast",     oshaStatePlan: "public_only" },
  { stateCode: "DE", stateName: "Delaware",        region: "Mid-Atlantic",  oshaStatePlan: "public_only" },
  { stateCode: "FL", stateName: "Florida",         region: "Southeast",     oshaStatePlan: "federal" },
  { stateCode: "GA", stateName: "Georgia",         region: "Southeast",     oshaStatePlan: "federal" },
  { stateCode: "HI", stateName: "Hawaii",          region: "Pacific",       oshaStatePlan: "full" },
  { stateCode: "ID", stateName: "Idaho",           region: "Mountain",      oshaStatePlan: "full" },
  { stateCode: "IL", stateName: "Illinois",        region: "Midwest",       oshaStatePlan: "public_only" },
  { stateCode: "IN", stateName: "Indiana",         region: "Midwest",       oshaStatePlan: "full" },
  { stateCode: "IA", stateName: "Iowa",            region: "Midwest",       oshaStatePlan: "federal" },
  { stateCode: "KS", stateName: "Kansas",          region: "Midwest",       oshaStatePlan: "federal" },
  { stateCode: "KY", stateName: "Kentucky",        region: "South",         oshaStatePlan: "full" },
  { stateCode: "LA", stateName: "Louisiana",       region: "South",         oshaStatePlan: "federal" },
  { stateCode: "ME", stateName: "Maine",           region: "Northeast",     oshaStatePlan: "public_only" },
  { stateCode: "MD", stateName: "Maryland",        region: "Mid-Atlantic",  oshaStatePlan: "full" },
  { stateCode: "MA", stateName: "Massachusetts",   region: "Northeast",     oshaStatePlan: "federal" },
  { stateCode: "MI", stateName: "Michigan",        region: "Midwest",       oshaStatePlan: "full" },
  { stateCode: "MN", stateName: "Minnesota",       region: "Midwest",       oshaStatePlan: "full" },
  { stateCode: "MS", stateName: "Mississippi",     region: "South",         oshaStatePlan: "federal" },
  { stateCode: "MO", stateName: "Missouri",        region: "Midwest",       oshaStatePlan: "federal" },
  { stateCode: "MT", stateName: "Montana",         region: "Mountain",      oshaStatePlan: "federal" },
  { stateCode: "NE", stateName: "Nebraska",        region: "Midwest",       oshaStatePlan: "federal" },
  { stateCode: "NV", stateName: "Nevada",          region: "West",          oshaStatePlan: "full" },
  { stateCode: "NH", stateName: "New Hampshire",   region: "Northeast",     oshaStatePlan: "federal" },
  { stateCode: "NJ", stateName: "New Jersey",      region: "Mid-Atlantic",  oshaStatePlan: "public_only" },
  { stateCode: "NM", stateName: "New Mexico",      region: "Southwest",     oshaStatePlan: "full" },
  { stateCode: "NY", stateName: "New York",        region: "Northeast",     oshaStatePlan: "public_only" },
  { stateCode: "NC", stateName: "North Carolina",  region: "Southeast",     oshaStatePlan: "full" },
  { stateCode: "ND", stateName: "North Dakota",    region: "Midwest",       oshaStatePlan: "federal" },
  { stateCode: "OH", stateName: "Ohio",            region: "Midwest",       oshaStatePlan: "federal" },
  { stateCode: "OK", stateName: "Oklahoma",        region: "South",         oshaStatePlan: "federal" },
  { stateCode: "OR", stateName: "Oregon",          region: "West",          oshaStatePlan: "full" },
  { stateCode: "PA", stateName: "Pennsylvania",    region: "Mid-Atlantic",  oshaStatePlan: "public_only" },
  { stateCode: "RI", stateName: "Rhode Island",    region: "Northeast",     oshaStatePlan: "federal" },
  { stateCode: "SC", stateName: "South Carolina",  region: "Southeast",     oshaStatePlan: "full" },
  { stateCode: "SD", stateName: "South Dakota",    region: "Midwest",       oshaStatePlan: "federal" },
  { stateCode: "TN", stateName: "Tennessee",       region: "Southeast",     oshaStatePlan: "full" },
  { stateCode: "TX", stateName: "Texas",           region: "South",         oshaStatePlan: "federal" },
  { stateCode: "UT", stateName: "Utah",            region: "Mountain",      oshaStatePlan: "full" },
  { stateCode: "VT", stateName: "Vermont",         region: "Northeast",     oshaStatePlan: "full" },
  { stateCode: "VA", stateName: "Virginia",        region: "Mid-Atlantic",  oshaStatePlan: "full" },
  { stateCode: "WA", stateName: "Washington",      region: "West",          oshaStatePlan: "full" },
  { stateCode: "WV", stateName: "West Virginia",   region: "Mid-Atlantic",  oshaStatePlan: "federal" },
  { stateCode: "WI", stateName: "Wisconsin",       region: "Midwest",       oshaStatePlan: "federal" },
  { stateCode: "WY", stateName: "Wyoming",         region: "Mountain",      oshaStatePlan: "full" },
  { stateCode: "DC", stateName: "Washington D.C.", region: "Mid-Atlantic",  oshaStatePlan: "federal" },
];

// Official URLs per state (key buckets)
const STATE_URLS: Record<string, Partial<typeof stateProfilesTable.$inferSelect>> = {
  AL: { procurementUrl: "https://vendor.staars.alabama.gov", legislatureUrl: "https://legis.state.al.us", govUrl: "https://governor.alabama.gov", healthDeptUrl: "https://www.alabamapublichealth.gov", laborUrl: "https://www.labor.alabama.gov", emergencyMgmtUrl: "https://ema.alabama.gov", medicalBoardUrl: "https://www.alabamamedicalboard.org", insuranceDeptUrl: "https://www.aldoi.gov", correctionsUrl: "https://www.doc.alabama.gov", dotUrl: "https://www.dot.state.al.us", postCommissionUrl: "https://www.apostc.alabama.gov" },
  AK: { procurementUrl: "https://iris-vss.alaska.gov", legislatureUrl: "https://legislature.alaska.gov", govUrl: "https://gov.alaska.gov", healthDeptUrl: "https://health.alaska.gov", laborUrl: "https://labor.alaska.gov", emergencyMgmtUrl: "https://ready.alaska.gov", medicalBoardUrl: "https://www.commerce.alaska.gov/web/cbpl/ProfessionalLicensing/StatemedicalBoard.aspx", dotUrl: "https://dot.alaska.gov", postCommissionUrl: "https://www.dps.state.ak.us/post" },
  AZ: { procurementUrl: "https://procure.az.gov", legislatureUrl: "https://azleg.gov", govUrl: "https://azgovernor.gov", healthDeptUrl: "https://www.azdhs.gov", laborUrl: "https://www.azjobconnection.gov", emergencyMgmtUrl: "https://dema.az.gov", medicalBoardUrl: "https://www.azmd.gov", insuranceDeptUrl: "https://insurance.az.gov", correctionsUrl: "https://corrections.az.gov", dotUrl: "https://azdot.gov", postCommissionUrl: "https://www.azpost.gov" },
  AR: { procurementUrl: "https://www.dfa.arkansas.gov/offices/procurement", legislatureUrl: "https://www.arkleg.state.ar.us", govUrl: "https://governor.arkansas.gov", healthDeptUrl: "https://www.healthy.arkansas.gov", laborUrl: "https://www.dws.arkansas.gov", emergencyMgmtUrl: "https://www.adem.arkansas.gov", dotUrl: "https://www.ardot.gov", postCommissionUrl: "https://www.ark.org/apost" },
  CA: { procurementUrl: "https://caleprocure.ca.gov", legislatureUrl: "https://leginfo.legislature.ca.gov", govUrl: "https://www.gov.ca.gov", healthDeptUrl: "https://www.cdph.ca.gov", laborUrl: "https://www.edd.ca.gov", emergencyMgmtUrl: "https://www.caloes.ca.gov", medicalBoardUrl: "https://www.mbc.ca.gov", insuranceDeptUrl: "https://www.insurance.ca.gov", correctionsUrl: "https://www.cdcr.ca.gov", dotUrl: "https://dot.ca.gov", postCommissionUrl: "https://post.ca.gov" },
  CO: { procurementUrl: "https://www.colorado.gov/pacific/oit/category/procurement", legislatureUrl: "https://leg.colorado.gov", govUrl: "https://www.colorado.gov/governor", healthDeptUrl: "https://cdphe.colorado.gov", laborUrl: "https://cdle.colorado.gov", emergencyMgmtUrl: "https://dhsem.colorado.gov", medicalBoardUrl: "https://dpo.colorado.gov/MedicalBoard", insuranceDeptUrl: "https://doi.colorado.gov", correctionsUrl: "https://www.colorado.gov/cdoc", dotUrl: "https://www.codot.gov", postCommissionUrl: "https://post.colorado.gov" },
  CT: { procurementUrl: "https://biznet.ct.gov/SCP_Main", legislatureUrl: "https://www.cga.ct.gov", govUrl: "https://portal.ct.gov/Office-of-the-Governor", healthDeptUrl: "https://portal.ct.gov/DPH", laborUrl: "https://www.ctdol.state.ct.us", emergencyMgmtUrl: "https://portal.ct.gov/DEMHS", medicalBoardUrl: "https://portal.ct.gov/DPH/Practitioner-Licensing--Investigations/Physician/Physician-Licensing-and-Renewals", dotUrl: "https://portal.ct.gov/DOT", postCommissionUrl: "https://www.ct.gov/post" },
  DE: { procurementUrl: "https://purchase.delaware.gov", legislatureUrl: "https://legis.delaware.gov", govUrl: "https://governor.delaware.gov", healthDeptUrl: "https://dhss.delaware.gov/dhss/dph", laborUrl: "https://labor.delaware.gov", emergencyMgmtUrl: "https://dema.delaware.gov", dotUrl: "https://deldot.gov", postCommissionUrl: "https://dspc.delaware.gov" },
  FL: { procurementUrl: "https://vendor.myfloridamarketplace.com", legislatureUrl: "https://www.myfloridahouse.gov", govUrl: "https://www.flgov.com", healthDeptUrl: "https://www.floridahealth.gov", laborUrl: "https://www.reemployflorida.com", emergencyMgmtUrl: "https://www.floridadisaster.org", medicalBoardUrl: "https://flboardofmedicine.gov", insuranceDeptUrl: "https://www.myfloridacfo.com/division/ins", correctionsUrl: "https://www.dc.state.fl.us", dotUrl: "https://www.fdot.gov", postCommissionUrl: "https://www.fdle.state.fl.us/Criminal-Justice-Professionalism/Criminal-Justice-Professionalism.aspx" },
  GA: { procurementUrl: "https://doas.georgia.gov/procurement", legislatureUrl: "https://www.legis.ga.gov", govUrl: "https://gov.georgia.gov", healthDeptUrl: "https://dph.georgia.gov", laborUrl: "https://dol.georgia.gov", emergencyMgmtUrl: "https://gema.georgia.gov", medicalBoardUrl: "https://medicalboard.georgia.gov", insuranceDeptUrl: "https://oci.georgia.gov", correctionsUrl: "https://gdc.georgia.gov", dotUrl: "https://www.dot.ga.gov", postCommissionUrl: "https://www.gapost.org" },
  HI: { procurementUrl: "https://spo.hawaii.gov", legislatureUrl: "https://www.capitol.hawaii.gov", govUrl: "https://governor.hawaii.gov", healthDeptUrl: "https://health.hawaii.gov", laborUrl: "https://labor.hawaii.gov", emergencyMgmtUrl: "https://dod.hawaii.gov/hiema", medicalBoardUrl: "https://cca.hawaii.gov/pvl/boards/medical", dotUrl: "https://hidot.hawaii.gov", postCommissionUrl: "https://www.sheriffs.org" },
  ID: { procurementUrl: "https://purchasing.idaho.gov", legislatureUrl: "https://legislature.idaho.gov", govUrl: "https://gov.idaho.gov", healthDeptUrl: "https://healthandwelfare.idaho.gov", laborUrl: "https://labor.idaho.gov", emergencyMgmtUrl: "https://bhs.idaho.gov", medicalBoardUrl: "https://bom.idaho.gov", dotUrl: "https://itd.idaho.gov", postCommissionUrl: "https://post.idaho.gov" },
  IL: { procurementUrl: "https://bidbuy.illinois.gov", legislatureUrl: "https://www.ilga.gov", govUrl: "https://gov.illinois.gov", healthDeptUrl: "https://dph.illinois.gov", laborUrl: "https://www.illinoisworknet.com", emergencyMgmtUrl: "https://iema.illinois.gov", medicalBoardUrl: "https://idfpr.illinois.gov/dpr/boards/medicalboard.html", correctionsUrl: "https://www.illinois.gov/sites/idoc", dotUrl: "https://www.idot.illinois.gov", postCommissionUrl: "https://www.ptb.illinois.gov" },
  IN: { procurementUrl: "https://www.in.gov/idoa/procurement", legislatureUrl: "https://iga.in.gov", govUrl: "https://www.in.gov/gov", healthDeptUrl: "https://www.in.gov/health", laborUrl: "https://www.in.gov/dwd", emergencyMgmtUrl: "https://www.in.gov/dhs", medicalBoardUrl: "https://www.in.gov/pla/medical.htm", dotUrl: "https://www.in.gov/indot", postCommissionUrl: "https://www.in.gov/ilea" },
  IA: { procurementUrl: "https://bidopportunities.iowa.gov", legislatureUrl: "https://www.legis.iowa.gov", govUrl: "https://governor.iowa.gov", healthDeptUrl: "https://hhs.iowa.gov", laborUrl: "https://www.iowaworkforcedevelopment.gov", emergencyMgmtUrl: "https://homelandsecurity.iowa.gov", dotUrl: "https://iowadot.gov", postCommissionUrl: "https://www.dps.state.ia.us/asd/letsb" },
  KS: { procurementUrl: "https://www.da.ks.gov/purch", legislatureUrl: "https://www.kslegislature.org", govUrl: "https://governor.kansas.gov", healthDeptUrl: "https://www.kdhe.ks.gov", laborUrl: "https://www.dol.ks.gov", emergencyMgmtUrl: "https://www.kansastag.gov/KDEM", dotUrl: "https://www.ksdot.org", postCommissionUrl: "https://www.kscpost.org" },
  KY: { procurementUrl: "https://mypurchase.ky.gov", legislatureUrl: "https://legislature.ky.gov", govUrl: "https://governor.ky.gov", healthDeptUrl: "https://chfs.ky.gov/agencies/dph", laborUrl: "https://kcc.ky.gov", emergencyMgmtUrl: "https://kyem.ky.gov", medicalBoardUrl: "https://kbml.ky.gov", dotUrl: "https://transportation.ky.gov", postCommissionUrl: "https://kcjis.ky.gov/krisp/login.aspx" },
  LA: { procurementUrl: "https://www.doa.la.gov/pages/oss/index.aspx", legislatureUrl: "https://legis.la.gov", govUrl: "https://gov.louisiana.gov", healthDeptUrl: "https://ldh.la.gov", laborUrl: "https://www.laworks.net", emergencyMgmtUrl: "https://gohsep.la.gov", medicalBoardUrl: "https://www.lsbme.la.gov", dotUrl: "https://dotd.la.gov", postCommissionUrl: "https://www.cole.la.gov" },
  ME: { procurementUrl: "https://www.maine.gov/dafs/bbm/procurementservices", legislatureUrl: "https://legislature.maine.gov", govUrl: "https://www.maine.gov/governor", healthDeptUrl: "https://www.maine.gov/dhhs/mecdc", laborUrl: "https://www.maine.gov/labor", emergencyMgmtUrl: "https://www.maine.gov/mema", dotUrl: "https://www.maine.gov/mdot", postCommissionUrl: "https://www.maine.gov/dps/mcja" },
  MD: { procurementUrl: "https://emaryland.buyspeed.com", legislatureUrl: "https://mgaleg.maryland.gov", govUrl: "https://governor.maryland.gov", healthDeptUrl: "https://health.maryland.gov", laborUrl: "https://www.labor.maryland.gov", emergencyMgmtUrl: "https://mema.maryland.gov", medicalBoardUrl: "https://www.mbp.state.md.us", insuranceDeptUrl: "https://insurance.maryland.gov", dotUrl: "https://www.roads.maryland.gov", postCommissionUrl: "https://police.maryland.gov/mptc" },
  MA: { procurementUrl: "https://www.commbuys.com", legislatureUrl: "https://malegislature.gov", govUrl: "https://www.mass.gov/governor", healthDeptUrl: "https://www.mass.gov/orgs/department-of-public-health", laborUrl: "https://www.mass.gov/orgs/executive-office-of-labor-and-workforce-development", emergencyMgmtUrl: "https://www.mass.gov/mema", medicalBoardUrl: "https://www.mass.gov/orgs/board-of-registration-in-medicine", dotUrl: "https://www.mass.gov/orgs/massachusetts-department-of-transportation", postCommissionUrl: "https://www.mass.gov/orgs/peace-officer-standards-and-training-commission" },
  MI: { procurementUrl: "https://www.michigan.gov/dtmb/procurement", legislatureUrl: "https://www.legislature.mi.gov", govUrl: "https://www.michigan.gov/whitmer", healthDeptUrl: "https://www.michigan.gov/mdhhs", laborUrl: "https://www.michigan.gov/leo", emergencyMgmtUrl: "https://www.michigan.gov/msp/divisions/emhsd", medicalBoardUrl: "https://www.michigan.gov/lara/0,4601,7-154-89334_72600_72603_27529_27533---,00.html", dotUrl: "https://www.michigan.gov/mdot", postCommissionUrl: "https://www.michigan.gov/mcoles" },
  MN: { procurementUrl: "https://mn.gov/admin/government/procurement", legislatureUrl: "https://www.leg.mn.gov", govUrl: "https://mn.gov/governor", healthDeptUrl: "https://www.health.state.mn.us", laborUrl: "https://mn.gov/deed", emergencyMgmtUrl: "https://dps.mn.gov/divisions/hsem", medicalBoardUrl: "https://mn.gov/boards/medical-practice", dotUrl: "https://www.dot.state.mn.us", postCommissionUrl: "https://dps.mn.gov/divisions/post" },
  MS: { procurementUrl: "https://www.dfa.ms.gov/purchasing", legislatureUrl: "https://www.legislature.ms.gov", govUrl: "https://www.governor.ms.gov", healthDeptUrl: "https://msdh.ms.gov", laborUrl: "https://mdes.ms.gov", emergencyMgmtUrl: "https://www.msema.org", dotUrl: "https://mdot.ms.gov", postCommissionUrl: "https://www.dps.state.ms.us/misdemeanor-violations/lbfpehcp" },
  MO: { procurementUrl: "https://oa.mo.gov/purchasing", legislatureUrl: "https://www.house.mo.gov", govUrl: "https://governor.mo.gov", healthDeptUrl: "https://health.mo.gov", laborUrl: "https://labor.mo.gov", emergencyMgmtUrl: "https://sema.dps.mo.gov", medicalBoardUrl: "https://pr.mo.gov/physicians.asp", dotUrl: "https://www.modot.org", postCommissionUrl: "https://dps.mo.gov/dir/programs/post" },
  MT: { procurementUrl: "https://vendor.mt.gov", legislatureUrl: "https://leg.mt.gov", govUrl: "https://governor.mt.gov", healthDeptUrl: "https://dphhs.mt.gov", laborUrl: "https://dli.mt.gov", emergencyMgmtUrl: "https://des.mt.gov", dotUrl: "https://www.mdt.mt.gov", postCommissionUrl: "https://dojmt.gov/le/post-training" },
  NE: { procurementUrl: "https://das.nebraska.gov/materiel", legislatureUrl: "https://nebraskalegislature.gov", govUrl: "https://governor.nebraska.gov", healthDeptUrl: "https://dhhs.ne.gov/Pages/Public-Health.aspx", laborUrl: "https://neworkforce.ne.gov", emergencyMgmtUrl: "https://nema.nebraska.gov", dotUrl: "https://dot.nebraska.gov", postCommissionUrl: "https://cjis.nebraska.gov/tcole" },
  NV: { procurementUrl: "https://nvepro.nv.gov", legislatureUrl: "https://www.leg.state.nv.us", govUrl: "https://gov.nv.gov", healthDeptUrl: "https://dpbh.nv.gov", laborUrl: "https://www.nvdetr.org", emergencyMgmtUrl: "https://dem.nv.gov", medicalBoardUrl: "https://medboard.nv.gov", dotUrl: "https://www.nevadadot.com", postCommissionUrl: "https://post.nv.gov" },
  NH: { procurementUrl: "https://www.das.nh.gov/organization/commissioner/procurement", legislatureUrl: "https://www.gencourt.state.nh.us", govUrl: "https://www.governor.nh.gov", healthDeptUrl: "https://www.dhhs.nh.gov", laborUrl: "https://www.nhes.nh.gov", emergencyMgmtUrl: "https://www.nh.gov/safety/divisions/hsem", dotUrl: "https://www.nh.gov/dot", postCommissionUrl: "https://www.pstc.nh.gov" },
  NJ: { procurementUrl: "https://www.njstart.gov", legislatureUrl: "https://www.njleg.state.nj.us", govUrl: "https://www.nj.gov/governor", healthDeptUrl: "https://www.nj.gov/health", laborUrl: "https://www.nj.gov/labor", emergencyMgmtUrl: "https://www.njoem.nj.gov", medicalBoardUrl: "https://www.njconsumeraffairs.gov/bme", dotUrl: "https://www.state.nj.us/transportation", postCommissionUrl: "https://www.njptc.org" },
  NM: { procurementUrl: "https://www.generalservices.state.nm.us/State_Purchasing", legislatureUrl: "https://www.nmlegis.gov", govUrl: "https://www.governor.state.nm.us", healthDeptUrl: "https://www.nmhealth.org", laborUrl: "https://www.dws.state.nm.us", emergencyMgmtUrl: "https://www.nmdhsem.org", medicalBoardUrl: "https://www.nmbome.state.nm.us", dotUrl: "https://www.dot.nm.gov", postCommissionUrl: "https://www.lea.nm.gov" },
  NY: { procurementUrl: "https://www.ogs.ny.gov/procurement", legislatureUrl: "https://www.nysenate.gov", govUrl: "https://www.governor.ny.gov", healthDeptUrl: "https://www.health.ny.gov", laborUrl: "https://labor.ny.gov", emergencyMgmtUrl: "https://www.dhses.ny.gov", medicalBoardUrl: "https://www.op.nysed.gov/prof/med", insuranceDeptUrl: "https://www.dfs.ny.gov", correctionsUrl: "https://doccs.ny.gov", dotUrl: "https://www.dot.ny.gov", postCommissionUrl: "https://www.dcjs.ny.gov/law-enforcement-officer-training" },
  NC: { procurementUrl: "https://ips.nc.gov", legislatureUrl: "https://ncleg.gov", govUrl: "https://www.nc.gov/governor", healthDeptUrl: "https://www.ncdhhs.gov", laborUrl: "https://www.des.nc.gov", emergencyMgmtUrl: "https://www.ncdps.gov/NCEM", medicalBoardUrl: "https://www.ncmedboard.org", dotUrl: "https://www.ncdot.gov", postCommissionUrl: "https://www.ncdoj.gov/public-safety/criminal-justice-education-and-training" },
  ND: { procurementUrl: "https://www.nd.gov/omb/agencies/procurement", legislatureUrl: "https://www.ndlegis.gov", govUrl: "https://www.governor.nd.gov", healthDeptUrl: "https://www.hhs.nd.gov", laborUrl: "https://www.jobs.nd.gov", emergencyMgmtUrl: "https://www.des.nd.gov", dotUrl: "https://www.dot.nd.gov", postCommissionUrl: "https://www.polecc.nd.gov" },
  OH: { procurementUrl: "https://procure.ohio.gov", legislatureUrl: "https://www.legislature.ohio.gov", govUrl: "https://governor.ohio.gov", healthDeptUrl: "https://odh.ohio.gov", laborUrl: "https://jfs.ohio.gov", emergencyMgmtUrl: "https://ema.ohio.gov", medicalBoardUrl: "https://med.ohio.gov", dotUrl: "https://www.transportation.ohio.gov", postCommissionUrl: "https://www.ohioattorneygeneral.gov/Law-Enforcement/Ohio-Peace-Officer-Training-Academy" },
  OK: { procurementUrl: "https://www.ok.gov/dcs/purchasing", legislatureUrl: "https://www.oklegislature.gov", govUrl: "https://www.governor.ok.gov", healthDeptUrl: "https://oklahoma.gov/health.html", laborUrl: "https://www.ok.gov/oesc", emergencyMgmtUrl: "https://www.ok.gov/OEM", dotUrl: "https://www.odot.org", postCommissionUrl: "https://www.ok.gov/cleet" },
  OR: { procurementUrl: "https://www.oregon.gov/das/procurement", legislatureUrl: "https://www.oregonlegislature.gov", govUrl: "https://www.oregon.gov/gov", healthDeptUrl: "https://www.oregon.gov/oha", laborUrl: "https://www.oregon.gov/employ", emergencyMgmtUrl: "https://www.oregon.gov/oem", medicalBoardUrl: "https://www.oregon.gov/omb", dotUrl: "https://www.oregon.gov/odot", postCommissionUrl: "https://www.oregon.gov/dpsst" },
  PA: { procurementUrl: "https://www.dgs.pa.gov/Materials-Services-Procurement", legislatureUrl: "https://www.legis.state.pa.us", govUrl: "https://www.governor.pa.gov", healthDeptUrl: "https://www.health.pa.gov", laborUrl: "https://www.dli.pa.gov", emergencyMgmtUrl: "https://www.pema.pa.gov", medicalBoardUrl: "https://www.dos.pa.gov/ProfessionalLicensing/BoardsCommissions/Medicine", dotUrl: "https://www.penndot.pa.gov", postCommissionUrl: "https://www.mpoetc.pa.gov" },
  RI: { procurementUrl: "https://ridop.ri.gov", legislatureUrl: "https://www.rilegislature.gov", govUrl: "https://www.ri.gov/governor", healthDeptUrl: "https://health.ri.gov", laborUrl: "https://dlt.ri.gov", emergencyMgmtUrl: "https://www.riema.ri.gov", dotUrl: "https://www.dot.ri.gov", postCommissionUrl: "https://www.rijag.ri.gov/policetraining" },
  SC: { procurementUrl: "https://procure.sc.gov", legislatureUrl: "https://www.scstatehouse.gov", govUrl: "https://governor.sc.gov", healthDeptUrl: "https://www.scdhec.gov", laborUrl: "https://www.dew.sc.gov", emergencyMgmtUrl: "https://www.scemd.org", medicalBoardUrl: "https://www.llr.sc.gov/pol/medical", dotUrl: "https://www.scdot.org", postCommissionUrl: "https://www.sccja.sc.gov" },
  SD: { procurementUrl: "https://bids.sd.gov", legislatureUrl: "https://sdlegislature.gov", govUrl: "https://sd.gov/governor", healthDeptUrl: "https://doh.sd.gov", laborUrl: "https://dlr.sd.gov", emergencyMgmtUrl: "https://oem.sd.gov", dotUrl: "https://dot.sd.gov", postCommissionUrl: "https://pcst.sd.gov" },
  TN: { procurementUrl: "https://www.tn.gov/generalservices/procurement.html", legislatureUrl: "https://www.capitol.tn.gov", govUrl: "https://www.tn.gov/governor.html", healthDeptUrl: "https://www.tn.gov/health.html", laborUrl: "https://www.tn.gov/workforce", emergencyMgmtUrl: "https://www.tn.gov/tema.html", medicalBoardUrl: "https://www.tn.gov/health/health-program-areas/health-professional-boards/medical-board.html", dotUrl: "https://www.tn.gov/tdot.html", postCommissionUrl: "https://www.tn.gov/tcole.html" },
  TX: { procurementUrl: "https://www.txsmartbuy.gov", legislatureUrl: "https://www.capitol.texas.gov", govUrl: "https://gov.texas.gov", healthDeptUrl: "https://www.dshs.texas.gov", laborUrl: "https://www.twc.texas.gov", emergencyMgmtUrl: "https://www.tdem.texas.gov", medicalBoardUrl: "https://www.tmb.state.tx.us", insuranceDeptUrl: "https://www.tdi.texas.gov", correctionsUrl: "https://www.tdcj.texas.gov", dotUrl: "https://www.txdot.gov", postCommissionUrl: "https://www.tcole.texas.gov" },
  UT: { procurementUrl: "https://purchasing.utah.gov", legislatureUrl: "https://le.utah.gov", govUrl: "https://governor.utah.gov", healthDeptUrl: "https://health.utah.gov", laborUrl: "https://jobs.utah.gov", emergencyMgmtUrl: "https://dem.utah.gov", medicalBoardUrl: "https://dopl.utah.gov/med", dotUrl: "https://www.udot.utah.gov", postCommissionUrl: "https://post.utah.gov" },
  VT: { procurementUrl: "https://www.bgs.vermont.gov/purchasing", legislatureUrl: "https://legislature.vermont.gov", govUrl: "https://governor.vermont.gov", healthDeptUrl: "https://www.healthvermont.gov", laborUrl: "https://labor.vermont.gov", emergencyMgmtUrl: "https://vem.vermont.gov", medicalBoardUrl: "https://www.sec.state.vt.us/professional-regulation/list-of-professions/medicine.aspx", dotUrl: "https://vtrans.vermont.gov", postCommissionUrl: "https://vcjtc.vermont.gov" },
  VA: { procurementUrl: "https://eva.virginia.gov", legislatureUrl: "https://lis.virginia.gov", govUrl: "https://www.governor.virginia.gov", healthDeptUrl: "https://www.vdh.virginia.gov", laborUrl: "https://www.vec.virginia.gov", emergencyMgmtUrl: "https://www.vaemergency.gov", medicalBoardUrl: "https://www.dhp.virginia.gov/medicine", insuranceDeptUrl: "https://www.scc.virginia.gov/boi", correctionsUrl: "https://vadoc.virginia.gov", dotUrl: "https://www.vdot.virginia.gov", postCommissionUrl: "https://www.dcjs.virginia.gov" },
  WA: { procurementUrl: "https://www.des.wa.gov/services/contracting-purchasing", legislatureUrl: "https://www.leg.wa.gov", govUrl: "https://www.governor.wa.gov", healthDeptUrl: "https://www.doh.wa.gov", laborUrl: "https://www.esd.wa.gov", emergencyMgmtUrl: "https://mil.wa.gov/emergency-management-division", medicalBoardUrl: "https://www.doh.wa.gov/LicensesPermitsandCertificates/MedicalCommission", dotUrl: "https://www.wsdot.wa.gov", postCommissionUrl: "https://www.cjtc.wa.gov" },
  WV: { procurementUrl: "https://www.state.wv.us/admin/purchase", legislatureUrl: "https://www.wvlegislature.gov", govUrl: "https://governor.wv.gov", healthDeptUrl: "https://dhhr.wv.gov", laborUrl: "https://workforcewv.org", emergencyMgmtUrl: "https://emd.wv.gov", dotUrl: "https://transportation.wv.gov", postCommissionUrl: "https://www.pscja.wv.gov" },
  WI: { procurementUrl: "https://www.vendornet.wi.gov", legislatureUrl: "https://docs.legis.wisconsin.gov", govUrl: "https://www.evers.wi.gov", healthDeptUrl: "https://www.dhs.wisconsin.gov", laborUrl: "https://dwd.wisconsin.gov", emergencyMgmtUrl: "https://wem.wi.gov", medicalBoardUrl: "https://drl.wisconsin.gov/boards/medical-examining/index.htm", dotUrl: "https://www.wisdot.gov", postCommissionUrl: "https://lesb.wi.gov" },
  WY: { procurementUrl: "https://ai.wyo.gov/divisions/administrative-services/procurement", legislatureUrl: "https://wyoleg.gov", govUrl: "https://governor.wyo.gov", healthDeptUrl: "https://health.wyo.gov", laborUrl: "https://wyomingworkforce.org", emergencyMgmtUrl: "https://wsems.wyo.gov", dotUrl: "https://www.dot.state.wy.us", postCommissionUrl: "https://post.wyo.gov" },
  DC: { procurementUrl: "https://contracts.dc.gov", legislatureUrl: "https://dccouncil.gov", govUrl: "https://mayor.dc.gov", healthDeptUrl: "https://dchealth.dc.gov", laborUrl: "https://does.dc.gov", emergencyMgmtUrl: "https://hsema.dc.gov", dotUrl: "https://ddot.dc.gov", postCommissionUrl: "https://mpdc.dc.gov/page/training-and-professional-development" },
};

// ── Bucket search query factory ───────────────────────────────────────────────

const BUCKET_QUERIES: Record<StateAgencyBucket, (state: string) => string[]> = {
  procurement: (s) => [
    `"${s}" state procurement RFP "occupational health" OR "employee health" OR "drug testing" 2025 OR 2026`,
    `"${s}" state RFP bid "CDL medical" OR "DOT physical" OR "pre-employment exam" OR "workers comp medical"`,
    `"${s}" state contract "public safety medical" OR "corrections health" OR "mobile medical" OR "fitness for duty"`,
    `"${s}" NASPO cooperative contract occupational medicine health services 2025`,
  ],
  legislature: (s) => [
    `"${s}" state legislature bill occupational health workers compensation medical examination 2025 OR 2026`,
    `"${s}" state legislation OSHA workplace safety bill proposed law 2025 2026`,
    `"${s}" state bill telehealth CDL DOT drug testing medical examination law`,
    `"${s}" NCSL state legislation health workforce occupational licensing bill tracking`,
  ],
  governor_agencies: (s) => [
    `"${s}" governor executive order health safety workforce 2025 2026`,
    `"${s}" state agency announcement occupational health medical services press release`,
    `site:usa.gov "${s}" state government agencies directory`,
  ],
  health_dept: (s) => [
    `"${s}" state health department alert bulletin outbreak notice 2025 OR 2026`,
    `"${s}" department of health immunization vaccination policy update guidance`,
    `"${s}" public health emergency notice clinic workforce rural health 2025`,
    `ASTHO "${s}" state health official news announcement`,
  ],
  labor_warn: (s) => [
    `"${s}" WARN notice layoffs dislocated workers 2025 OR 2026`,
    `"${s}" state workforce agency mass layoff employer notice DOL`,
    `"${s}" labor department employer layoff closure workers compensation 2025`,
    `BLS "${s}" employment data hiring labor market 2025 2026`,
  ],
  medical_licensing: (s) => [
    `"${s}" state medical board physician license discipline action 2025`,
    `"${s}" medical board disciplinary notice revocation suspension 2025`,
    `FSMB "${s}" medical licensing physician data 2025`,
    `"${s}" nursing board license action NCSBN 2025`,
  ],
  emergency_mgmt: (s) => [
    `"${s}" state emergency management declaration disaster alert 2025 OR 2026`,
    `"${s}" emergency declaration governor public health emergency disaster`,
    `"${s}" FEMA disaster declaration emergency management agency notice`,
    `"${s}" emergency operations center activation evacuation order 2025`,
  ],
  osha_plan: (s) => [
    `"${s}" state OSHA citation violation enforcement action 2025`,
    `"${s}" workplace safety inspection fatality violation penalty 2025`,
    `"${s}" OSHA state plan enforcement news industrial safety 2025`,
    `"${s}" workplace injury illness data OSHA 300 log enforcement`,
  ],
  insurance_dept: (s) => [
    `"${s}" state insurance department bulletin order workers comp 2025`,
    `"${s}" insurance commissioner order telehealth network adequacy 2025`,
    `NAIC "${s}" insurance department notice regulation 2025`,
    `"${s}" workers compensation rate change insurance regulatory 2025`,
  ],
  corrections: (s) => [
    `"${s}" state corrections department medical health services contract RFP 2025`,
    `"${s}" department of corrections healthcare staffing inmate medical 2025`,
    `"${s}" correctional health services contract bid vendor 2025 2026`,
    `"${s}" jail prison health services nurse staffing contract`,
  ],
  fmcsa: (s) => [
    `"${s}" FMCSA DOT medical examiner certification CDL commercial driver physical 2025`,
    `"${s}" DOT medical certificate CMV driver physical exam requirement 2025`,
    `FMCSA "${s}" enforcement action carrier violation medical certification`,
    `"${s}" CDL drug testing FMCSA clearinghouse commercial vehicle 2025`,
  ],
  post_guidelines: (s) => [
    `"${s}" POST commission law enforcement physical fitness medical standards 2025`,
    `"${s}" police officer physical exam POST standard pre-employment`,
    `"${s}" peace officer POST training standards physical fitness certification`,
    `"${s}" law enforcement hiring physical medical exam entry standard`,
  ],
  dot: (s) => [
    `"${s}" department of transportation DOT infrastructure contract bid 2025 2026`,
    `"${s}" DOT highway construction project contract award 2025`,
    `"${s}" state DOT occupational health safety worker construction`,
    `"${s}" transportation department RFP medical safety services 2025`,
  ],
};

// ── Cross-state intel search queries ─────────────────────────────────────────

const INTEL_QUERIES: Record<StateIntelChannel, string[]> = {
  public_health: [
    "CDC Health Alert Network HAN notice public health alert 2025 2026",
    "site:emergency.cdc.gov health alert notice 2025",
    "state health alert network outbreak communicable disease alert 2025",
    "CDC CAHAN public health emergency occupational health alert 2025",
  ],
  travel_advisory: [
    "CDC travel notice advisory health warning destination 2025 2026",
    "State Department travel advisory Level 3 OR Level 4 country 2025",
    "site:travel.state.gov travel advisory 2025",
    "CDC travel health notice disease outbreak destination 2025",
  ],
  fda_recalls: [
    "FDA MedWatch safety alert medical device recall 2025 OR 2026",
    "FDA drug recall medication safety alert occupational health 2025",
    "site:fda.gov recall safety alert 2025 medical device drug",
    "FDA medical product safety communication 2025 urgent",
  ],
  disaster: [
    "FEMA disaster declaration major disaster 2025 2026",
    "OpenFEMA disaster declaration state federal emergency 2025",
    "FEMA major disaster declaration DR- 2025 affected counties",
    "federal disaster declaration presidential emergency 2025 states affected",
  ],
};

// ── Relevance scorer ──────────────────────────────────────────────────────────

const HIGH_VALUE_KEYWORDS = [
  "occupational health", "occumed", "occu-med", "employee health", "drug testing",
  "pre-employment", "CDL", "DOT physical", "medical examination", "fit for duty",
  "workers comp", "workers compensation", "clinic", "mobile medical", "FMCSA",
  "POST physical", "nurse", "physician", "industrial hygiene", "EHS",
  "contract", "RFP", "RFI", "bid", "award", "procurement", "solicitation",
];

function scoreRelevance(title: string, snippet: string): number {
  const combined = `${title} ${snippet}`.toLowerCase();
  let score = 0;
  for (const kw of HIGH_VALUE_KEYWORDS) {
    if (combined.includes(kw.toLowerCase())) score += 10;
  }
  return Math.min(score, 100);
}

// ── Seed states if not already present ────────────────────────────────────────

async function ensureStatesSeedded() {
  const existing = await db.select({ stateCode: stateProfilesTable.stateCode }).from(stateProfilesTable);
  if (existing.length >= 50) return;
  const existingCodes = new Set(existing.map((e) => e.stateCode));
  for (const s of STATES_SEED) {
    if (existingCodes.has(s.stateCode)) continue;
    const urls = STATE_URLS[s.stateCode] || {};
    await db.insert(stateProfilesTable).values({
      stateCode: s.stateCode,
      stateName: s.stateName,
      region: s.region,
      oshaStatePlan: s.oshaStatePlan,
      ...urls,
    }).onConflictDoNothing();
  }
}

// ── List all states ───────────────────────────────────────────────────────────

router.get("/state-agencies/states", async (req, res) => {
  try {
    await ensureStatesSeedded();
    const states = await db.select().from(stateProfilesTable).orderBy(stateProfilesTable.stateName);

    // Count items per state (for badge display)
    const counts = await db.select({ stateCode: stateAgencyItemsTable.stateCode }).from(stateAgencyItemsTable);
    const countMap: Record<string, number> = {};
    for (const c of counts) {
      countMap[c.stateCode] = (countMap[c.stateCode] || 0) + 1;
    }

    return res.json({ states: states.map((s) => ({ ...s, itemCount: countMap[s.stateCode] || 0 })) });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list states" });
  }
});

// ── Get items for a state + optional bucket filter ────────────────────────────

router.get("/state-agencies/items", async (req, res) => {
  try {
    const { stateCode, bucket } = req.query as Record<string, string>;
    if (!stateCode) return res.status(400).json({ error: "stateCode required" });

    const conditions = [eq(stateAgencyItemsTable.stateCode, stateCode.toUpperCase())];
    if (bucket) {
      conditions.push(eq(stateAgencyItemsTable.bucket, bucket as StateAgencyBucket));
    }

    const items = await db
      .select()
      .from(stateAgencyItemsTable)
      .where(and(...conditions))
      .orderBy(stateAgencyItemsTable.relevanceScore, stateAgencyItemsTable.fetchedAt);

    // Count per bucket
    const all = await db.select({ bucket: stateAgencyItemsTable.bucket }).from(stateAgencyItemsTable).where(eq(stateAgencyItemsTable.stateCode, stateCode.toUpperCase()));
    const bucketCounts: Record<string, number> = {};
    for (const i of all) {
      bucketCounts[i.bucket] = (bucketCounts[i.bucket] || 0) + 1;
    }

    return res.json({ items, bucketCounts });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get items" });
  }
});

// ── Refresh a specific bucket for a state ────────────────────────────────────

router.post("/state-agencies/refresh", async (req, res) => {
  const { stateCode, bucket } = req.body as { stateCode: string; bucket: StateAgencyBucket };
  if (!stateCode || !bucket) return res.status(400).json({ error: "stateCode and bucket required" });

  try {
    await ensureStatesSeedded();
    const profiles = await db.select().from(stateProfilesTable).where(eq(stateProfilesTable.stateCode, stateCode.toUpperCase()));
    if (!profiles.length) return res.status(404).json({ error: "State not found" });
    const profile = profiles[0];

    const queryFn = BUCKET_QUERIES[bucket];
    if (!queryFn) return res.status(400).json({ error: "Unknown bucket" });

    const queries = queryFn(profile.stateName);
    const errors: string[] = [];
    let serperResults: { title: string; link: string; snippet: string }[] = [];

    try {
      serperResults = await serperProvider.searchMultiple(queries, 10);
    } catch (e: any) {
      errors.push(`Serper: ${e.message}`);
    }

    // Delete old items for this state+bucket
    await db.delete(stateAgencyItemsTable).where(
      and(eq(stateAgencyItemsTable.stateCode, stateCode.toUpperCase()), eq(stateAgencyItemsTable.bucket, bucket))
    );

    let added = 0;
    const seenUrls = new Set<string>();

    for (const r of serperResults) {
      if (!r.link || seenUrls.has(r.link)) continue;
      seenUrls.add(r.link);

      const relevanceScore = scoreRelevance(r.title, r.snippet);

      await db.insert(stateAgencyItemsTable).values({
        id: randomUUID(),
        stateCode: stateCode.toUpperCase(),
        bucket,
        title: r.title.slice(0, 300),
        summary: r.snippet.slice(0, 500),
        url: r.link,
        publishedDate: null,
        agency: profile.stateName,
        itemType: inferItemType(r.title, r.snippet),
        relevanceScore,
        rawJson: JSON.stringify(r),
      });
      added++;
    }

    // Update lastRefreshed for this bucket
    const current = profiles[0].lastRefreshed ? JSON.parse(profiles[0].lastRefreshed) : {};
    current[bucket] = new Date().toISOString();
    await db.update(stateProfilesTable).set({ lastRefreshed: JSON.stringify(current) }).where(eq(stateProfilesTable.stateCode, stateCode.toUpperCase()));

    const items = await db.select().from(stateAgencyItemsTable).where(
      and(eq(stateAgencyItemsTable.stateCode, stateCode.toUpperCase()), eq(stateAgencyItemsTable.bucket, bucket))
    );

    return res.json({ items, added, errors, bucket, stateCode: stateCode.toUpperCase() });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Refresh failed" });
  }
});

// ── Get cross-state intel items ───────────────────────────────────────────────

router.get("/state-agencies/intel", async (req, res) => {
  try {
    const { channel } = req.query as { channel?: string };
    const conditions = channel ? [eq(stateIntelItemsTable.channel, channel as StateIntelChannel)] : [];
    const items = await db.select().from(stateIntelItemsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(stateIntelItemsTable.fetchedAt);
    const channelCounts: Record<string, number> = {};
    const all = await db.select({ channel: stateIntelItemsTable.channel }).from(stateIntelItemsTable);
    for (const i of all) { channelCounts[i.channel] = (channelCounts[i.channel] || 0) + 1; }
    return res.json({ items, channelCounts });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get intel items" });
  }
});

// ── Refresh cross-state intel channel ─────────────────────────────────────────

router.post("/state-agencies/intel/refresh", async (req, res) => {
  const { channel } = req.body as { channel: StateIntelChannel };
  if (!channel) return res.status(400).json({ error: "channel required" });

  try {
    const queries = INTEL_QUERIES[channel];
    if (!queries) return res.status(400).json({ error: "Unknown channel" });

    const errors: string[] = [];
    let serperResults: { title: string; link: string; snippet: string }[] = [];

    try {
      serperResults = await serperProvider.searchMultiple(queries, 12);
    } catch (e: any) {
      errors.push(`Serper: ${e.message}`);
    }

    // Supplement with free RSS/API for specific channels
    if (channel === "disaster" && serperResults.length < 5) {
      try {
        const femaResp = await fetch("https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries?$limit=20&$orderby=declarationDate%20desc&$filter=declarationDate%20ge%20%272025-01-01T00%3A00%3A00.000Z%27", { signal: AbortSignal.timeout(8000) });
        if (femaResp.ok) {
          const femaData = (await femaResp.json()) as any;
          const declarations = femaData?.DisasterDeclarationsSummaries ?? [];
          for (const d of declarations.slice(0, 15)) {
            serperResults.push({
              title: `FEMA DR-${d.disasterNumber}: ${d.declarationTitle} – ${d.state}`,
              link: `https://www.fema.gov/disaster/${d.disasterNumber}`,
              snippet: `Declaration Date: ${d.declarationDate?.slice(0, 10)} | Type: ${d.declarationType} | State: ${d.state} | Incident: ${d.incidentType}`,
            });
          }
        }
      } catch {}
    }

    // Delete old items for this channel
    await db.delete(stateIntelItemsTable).where(eq(stateIntelItemsTable.channel, channel));

    let added = 0;
    const seenUrls = new Set<string>();

    for (const r of serperResults) {
      if (!r.link || seenUrls.has(r.link)) continue;
      seenUrls.add(r.link);

      await db.insert(stateIntelItemsTable).values({
        id: randomUUID(),
        channel,
        title: r.title.slice(0, 300),
        summary: r.snippet.slice(0, 500),
        url: r.link,
        source: extractSource(r.link),
        severity: inferSeverity(r.title, r.snippet),
        rawJson: JSON.stringify(r),
      });
      added++;
    }

    const items = await db.select().from(stateIntelItemsTable).where(eq(stateIntelItemsTable.channel, channel));
    return res.json({ items, added, errors, channel });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Intel refresh failed" });
  }
});

// ── Delete all items for a state+bucket ───────────────────────────────────────

router.delete("/state-agencies/items", async (req, res) => {
  const { stateCode, bucket } = req.query as Record<string, string>;
  if (!stateCode) return res.status(400).json({ error: "stateCode required" });
  try {
    const conditions = [eq(stateAgencyItemsTable.stateCode, stateCode.toUpperCase())];
    if (bucket) conditions.push(eq(stateAgencyItemsTable.bucket, bucket as StateAgencyBucket));
    await db.delete(stateAgencyItemsTable).where(and(...conditions));
    return res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Delete failed" });
  }
});

// ── Utilities ─────────────────────────────────────────────────────────────────

function inferItemType(title: string, snippet: string): string {
  const t = `${title} ${snippet}`.toLowerCase();
  if (t.includes("rfp") || t.includes("request for proposal") || t.includes("solicitation")) return "rfp";
  if (t.includes("rfi") || t.includes("request for information")) return "rfi";
  if (t.includes("award") || t.includes("contract award")) return "award";
  if (t.includes("bill") || t.includes("legislation") || t.includes("act") || t.includes("statute")) return "legislation";
  if (t.includes("alert") || t.includes("notice") || t.includes("bulletin") || t.includes("advisory")) return "notice";
  if (t.includes("warn") || t.includes("layoff") || t.includes("closure")) return "warn";
  if (t.includes("recall") || t.includes("safety")) return "safety";
  if (t.includes("declaration") || t.includes("emergency") || t.includes("disaster")) return "emergency";
  return "news";
}

function inferSeverity(title: string, snippet: string): string {
  const t = `${title} ${snippet}`.toLowerCase();
  if (t.includes("level 4") || t.includes("do not travel") || t.includes("major disaster") || t.includes("urgent") || t.includes("emergency")) return "high";
  if (t.includes("level 3") || t.includes("reconsider travel") || t.includes("alert") || t.includes("significant")) return "medium";
  return "low";
}

function extractSource(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url.slice(0, 50); }
}

export default router;
