import { Router, type IRouter } from "express";
import { resolveCredential } from "../lib/config/providerConfig";
import { keenableProvider } from "../lib/providers/keenable";
const router: IRouter = Router();
router.get("/company-watch/logo/:domain", async (req, res) => {
  const domain = String(req.params.domain ?? "").toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return res.status(400).end();
  const token = await resolveCredential("logoDevToken", "LOGO_DEV_TOKEN");
  if (!token) return res.status(404).end();
  try {
    const endpoint = new URL(`https://img.logo.dev/${domain}`);
    endpoint.searchParams.set("token", token);
    endpoint.searchParams.set("size", req.query.size === "512" ? "512" : "128");
    endpoint.searchParams.set("format", "png");
    const upstream = await fetch(endpoint);
    if (!upstream.ok || !upstream.body) return res.status(404).end();
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    const bytes = await upstream.arrayBuffer();
    return res.send(Buffer.from(bytes));
  } catch { return res.status(404).end(); }
});
type Source={name:string;url:string;domain:string}; type Article={id:string;title:string;url:string;snippet:string;publisher:string|null;publishedAt:string|null;provider:"tinyfish"|"keenable";sourceUrl?:string;image?:string|null};
function validUrl(value: unknown): string|null { try { const u=new URL(String(value)); return /^https?:$/.test(u.protocol)?u.href:null; } catch{return null;} }
function normalize(value:unknown,provider:Article["provider"],source?:Source):Article|null { const r=(value&&typeof value==='object'?value:{}) as Record<string,unknown>; const url=validUrl(r.url); const title=typeof r.title==='string'?r.title.trim():''; if(!url||!title)return null; let publisher=typeof r.publisher==='string'?r.publisher:(typeof r.site_name==='string'?r.site_name:null); if(!publisher)try{publisher=new URL(url).hostname.replace(/^www\./,'')}catch{} return {id:`${provider}:${url}`,title,url,snippet:typeof r.snippet==='string'?r.snippet:(typeof r.description==='string'?r.description:''),publisher,publishedAt:typeof r.date==='string'?r.date:(typeof r.publishedAt==='string'?r.publishedAt:null),provider,sourceUrl:source?.url,image:validUrl(r.thumbnail_url??r.image)}; }
function cleanSources(value:unknown):Source[]{ if(!Array.isArray(value))return []; return value.flatMap(v=>{const r=(v&&typeof v==='object'?v:{}) as Record<string,unknown>; const url=validUrl(r.url); const name=typeof r.name==='string'?r.name.trim():''; if(!url||!name)return []; try{return [{name,url,domain:new URL(url).hostname.replace(/^www\./,'')}]}catch{return []} }).slice(0,20); }
async function tinyfish(query:string,sources:Source[]):Promise<Article[]> { const key=await resolveCredential('tinyfishApiKey','TINYFISH_API_KEY'); if(!key)throw new Error('TinyFish news key (TINYFISH_API_KEY) is not configured'); const u=new URL('https://api.search.tinyfish.ai'); u.searchParams.set('query',query); // The primary TinyFish key is reserved for news. Intelligence uses TINYFISH_API_KEY_2.
 u.searchParams.set('domain_type','news'); u.searchParams.set('include_thumbnail','true'); u.searchParams.set('language','en'); u.searchParams.set('location','US'); u.searchParams.set('recency_minutes','10080'); if(sources.length)u.searchParams.set('include_domains',sources.map(s=>s.domain).join(',')); const response=await fetch(u,{headers:{'X-API-Key':key,'Accept':'application/json'},signal:AbortSignal.timeout(12000)}); if(!response.ok)throw new Error(`TinyFish returned HTTP ${response.status}`); const data=await response.json() as {results?:unknown[]}; return (data.results??[]).map(v=>normalize(v,'tinyfish',sources.find(s=>{try{return new URL(String((v as Record<string,unknown>).url)).hostname.includes(s.domain)}catch{return false}}))).filter((v):v is Article=>Boolean(v)); }
async function keen(query:string,sources:Source[]):Promise<Article[]> { const targets=sources.length?sources:[{name:'Open web',url:'https://www.google.com',domain:''}]; const rows=(await Promise.all(targets.map(s=>keenableProvider.search(`${query} latest news contracts spending acquisition workforce`,{publishedAfter:new Date(Date.now()-7*86400000).toISOString(),...(s.domain?{site:s.domain}:{})})))).flat(); return rows.map(v=>normalize(v,'keenable',sources.find(s=>s.domain&&v.url.includes(s.domain)))).filter((v):v is Article=>Boolean(v)); }
router.post('/company-watch/search',async(req,res)=>{ const companies=Array.isArray(req.body?.companies)?req.body.companies.filter((v:unknown)=>typeof v==='string').map((v:string)=>v.trim()).filter(Boolean).slice(0,100):[]; const sources=cleanSources(req.body?.sources); if(!companies.length)return res.status(400).json({error:'Add at least one company.'}); const query=companies.map(v=>`"${v.replace(/"/g,'')}"`).join(' OR ')+' (contract OR award OR spending OR acquisition OR expansion OR workforce OR facility OR aerospace OR defense)'; const settled=await Promise.allSettled([tinyfish(query,sources),keen(query,sources)]); const articles=settled.flatMap(r=>r.status==='fulfilled'?r.value:[]); const warnings=settled.flatMap((r,i)=>r.status==='rejected'?[`${i===0?'TinyFish news':'Keenable news'} unavailable${i===0&&String(r.reason).includes('not configured')?': news key not configured':'. Please retry shortly.'}`]:[]); const unique=[...new Map(articles.map(a=>[a.url,a])).values()].sort((a,b)=>(Date.parse(b.publishedAt??'')||0)-(Date.parse(a.publishedAt??'')||0)); res.json({articles:unique.slice(0,100),companies,sources,updatedAt:new Date().toISOString(),warnings}); });
export default router;
