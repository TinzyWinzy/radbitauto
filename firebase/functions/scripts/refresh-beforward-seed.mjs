// refresh-beforward-seed.ts - run from a non-cloud IP to refresh the bundled seed.
// Node 22+:  node --experimental-strip-types firebase/functions/scripts/refresh-beforward-seed.ts
// tsx:       npx tsx firebase/functions/scripts/refresh-beforward-seed.ts

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const plain = (s) =>
  s.replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&nbsp;|&#160;/g," ")
   .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&times;|&#215;/gi,"x")
   .replace(/\s+/g," ").trim();

function parseBeforward(html, checkedAt = new Date().toISOString()) {
  const vehicles = new Map();
  for (const chunk of html.split(/<tr\s+class="stocklist-row"[^>]*>/).slice(1)) {
    const path = chunk.match(/href="(\/[^"?#]+\/([a-z]{2}\d+)\/id\/\d+\/?)">/i);
    const title = plain(chunk.match(/<p class="make-model">([\s\S]*?)<\/p>/)?.[1] ?? "");
    const priceBlock = chunk.match(/<p class="vehicle-price"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
    const price = priceBlock.match(/\$([\d,]+(?:\.\d{2})?)/)?.[1];
    const photo = chunk.match(/<img[^>]+src="((?:https:)?\/\/image-cdn\.beforward\.jp\/[^"<>]+)"/)?.[1];
    if (!path||!title||!price||!photo||/\b(?:SOLD|RESERVED)\b/i.test(plain(chunk.split("</tr>")[0]))) continue;
    const val = (name) => plain(chunk.match(new RegExp(`<td class="basic-spec-col[^"\\n]*\\b${name}\\b[^"\\n]*">([\\s\\S]*?)<\\/td>`))?.[1]??"").replace(/^(Mileage|Year|Engine|Trans\.|Location)\s*/,"");
    const num = (s) => Number(s.replace(/,/g,"").match(/\d+/)?.[0]);
    const year=num(val("year")), mileage=num(val("mileage")), engine=num(val("engine"));
    const trans=val("trans");
    const fuel=plain(chunk.match(/>Fuel<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/)?.[1]??"");
    const parts=path[1].split("/");
    const image=new URL(photo.startsWith("//")?`https:${photo}`:photo);
    image.searchParams.set("w","640");
    const vehicle={
      id:path[2].toUpperCase(), title,
      listingUrl:`https://www.beforward.jp${path[1]}`,
      photos:[image.href], location:val("location"),
      askingPriceCents:Math.round(Number(price.replace(/,/g,""))*100),
      checkedAt,
      specs:{
        make:parts[1].toUpperCase(), model:parts[2].replace(/-/g," ").toUpperCase(),
        ...(year>=1960?{year}:{}), ...(Number.isFinite(mileage)?{mileageKm:mileage}:{}),
        ...(engine>0?{engineCc:engine}:{}),
        ...(["AT","Automatic","MT","Manual","CVT"].includes(trans)?{transmission:trans==="AT"?"Automatic":trans==="MT"?"Manual":trans}:{}),
        ...(fuel?{fuel:/hybrid/i.test(fuel)?"Hybrid":/diesel/i.test(fuel)?"Diesel":/electric/i.test(fuel)?"Electric":/petrol|gasoline/i.test(fuel)?"Petrol":"Other"}:{}),
      },
    };
    if (Number.isSafeInteger(vehicle.askingPriceCents)&&vehicle.askingPriceCents>0)
      vehicles.set(vehicle.id, vehicle);
  }
  return [...vehicles.values()];
}

async function fetchBeforwardSelection() {
  const makes = [1,3,2,4,7];
  const groups = await Promise.all(makes.map(async make => {
    const vehicles = new Map();
    for (const page of [1,2]) {
      let parsed = [];
      const url = new URL(`https://www.beforward.jp/stocklist/make=${make}/${page>1?`page=${page}/`:""}sortkey=n`);
      for (let attempt=0; attempt<2; attempt++) {
        try {
          console.log(`  Fetching make=${make} page=${page} attempt=${attempt+1}...`);
          const response = await fetch(url,{
            redirect:"error", signal:AbortSignal.timeout(20000),
            headers:{ Accept:"text/html", Cookie:"currency=USD",
              "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" }
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const html = await response.text();
          if (html.length>5000000) throw new Error("Response too large");
          const isChallenge=/javascript\s+is\s+disabled|verify.*not.*robot|cf-browser-verification|checking\s+your\s+browser/i.test(html);
          if (isChallenge) throw new Error(`Bot-verification challenge make=${make} page=${page}. This IP range is blocked by BE FORWARD. Try a different network.`);
          parsed = parseBeforward(html);
          if (!parsed.length) {
            const title=plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??"").slice(0,120);
            throw new Error(`No listings parsed (make=${make} page=${page} ${html.length}b): ${title||"no title"}`);
          }
          console.log(`    OK: ${parsed.length} vehicles`);
          break;
        } catch(err) {
          if (attempt===1) throw err;
          console.warn(`    Retrying: ${err.message}`);
          await new Promise(r=>setTimeout(r,2500));
        }
      }
      const before=vehicles.size;
      for (const v of parsed) vehicles.set(v.id,v);
      if (vehicles.size===before) break;
    }
    return [...vehicles.values()];
  }));
  return [...new Map(groups.flat().map(v=>[v.id,v])).values()].slice(0,300);
}

console.log("Fetching BE FORWARD selection from local IP...\n");
const stock = await fetchBeforwardSelection();
console.log(`\nFetched ${stock.length} vehicles total.\n`);

const outPath = resolve(__dirname,"..","src","beforwardSeed.ts");
const output =
  `// Public supplier snapshot. User authorised photo republication on 9 October 2026.\nimport type { SupplierVehicle } from './beforwardParser.ts';\nexport const beforwardSeed:SupplierVehicle[]=` +
  JSON.stringify(stock, null, 2) + `;\n`;

writeFileSync(outPath, output, "utf8");
console.log(`Written ${stock.length} vehicles to ${outPath}`);
console.log("Next: commit the updated beforwardSeed.ts and deploy functions + hosting.");
