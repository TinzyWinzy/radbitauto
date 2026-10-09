export type SupplierVehicle = {
  id:string; title:string; listingUrl:string; photos:string[]; location:string;
  askingPriceCents:number; checkedAt:string;
  specs:{make?:string;model?:string;year?:number;mileageKm?:number;engineCc?:number;transmission?:string;fuel?:string};
};
const plain = (s:string) => s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;|&#160;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&times;|&#215;/gi,'×').replace(/\s+/g,' ').trim();
export function parseBeforward(html:string, checkedAt = new Date().toISOString()):SupplierVehicle[] {
  const vehicles = new Map<string,SupplierVehicle>();
  // Parse full desktop rows; the mobile recommendation strip can contain duplicates.
  for (const chunk of html.split(/<tr\s+class="stocklist-row"[^>]*>/).slice(1)) {
    const path=chunk.match(/href="(\/[^"?#]+\/([a-z]{2}\d+)\/id\/\d+\/?)"/i);
    const title=plain(chunk.match(/<p class="make-model">([\s\S]*?)<\/p>/)?.[1]??'');
    const priceBlock=chunk.match(/<p class="vehicle-price"[^>]*>([\s\S]*?)<\/p>/)?.[1]??'';
    const price=priceBlock.match(/\$([\d,]+(?:\.\d{2})?)/)?.[1];
    const photo=chunk.match(/<img[^>]+src="((?:https:)?\/\/image-cdn\.beforward\.jp\/[^"<>]+)"/)?.[1];
    if (!path||!title||!price||!photo||/\b(?:SOLD|RESERVED)\b/i.test(plain(chunk.split('</tr>')[0]))) continue;
    const val=(name:string)=>plain(chunk.match(new RegExp(`<td class="basic-spec-col[^"\\n]*\\b${name}\\b[^"\\n]*">([\\s\\S]*?)<\\/td>`))?.[1]??'').replace(/^(Mileage|Year|Engine|Trans\.|Location)\s*/,'');
    const num=(s:string)=>Number(s.replace(/,/g,'').match(/\d+/)?.[0]);
    const year=num(val('year')), mileage=num(val('mileage')), engine=num(val('engine'));
    const trans=val('trans');
    const fuel=plain(chunk.match(/>Fuel<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/)?.[1]??'');
    const parts=path[1].split('/');
    const image=new URL(photo.startsWith('//')?`https:${photo}`:photo);image.searchParams.set('w','640');
    const vehicle:SupplierVehicle={id:path[2].toUpperCase(),title,listingUrl:`https://www.beforward.jp${path[1]}`,photos:[image.href],location:val('location'),askingPriceCents:Math.round(Number(price.replace(/,/g,''))*100),checkedAt,specs:{make:parts[1].toUpperCase(),model:parts[2].replace(/-/g,' ').toUpperCase(),...(year>=1960?{year}:{}),...(Number.isFinite(mileage)?{mileageKm:mileage}:{}),...(engine>0?{engineCc:engine}:{}),...(['AT','Automatic','MT','Manual','CVT'].includes(trans)?{transmission:trans==='AT'?'Automatic':trans==='MT'?'Manual':trans}:{}),...(fuel?{fuel:/hybrid/i.test(fuel)?'Hybrid':/diesel/i.test(fuel)?'Diesel':/electric/i.test(fuel)?'Electric':/petrol|gasoline/i.test(fuel)?'Petrol':'Other'}:{})}};
    if(Number.isSafeInteger(vehicle.askingPriceCents)&&vehicle.askingPriceCents>0)vehicles.set(vehicle.id,vehicle);
  }
  return [...vehicles.values()];
}
export const freshSupplierVehicle = (v:SupplierVehicle, now=Date.now()) => Number.isFinite(Date.parse(v.checkedAt)) && now-Date.parse(v.checkedAt)<=48*3600000 && Date.parse(v.checkedAt)<=now+60000;
export function parseSupplierPhotos(html:string, reference:string):string[] {
  return [...new Set([...html.matchAll(/data-path="((?:https:)?\/\/image-cdn\.beforward\.jp\/large\/[^"<>]+)"/g)].map(m=>m[1].startsWith('//')?`https:${m[1]}`:m[1]).filter(src=>new URL(src).pathname.split('/').at(-1)?.toUpperCase().startsWith(`${reference.toUpperCase()}_`)))].slice(0,20);
}
export type SupplierDetailSpecs = {
  chassis?:string; engineCode?:string; colour?:string; drive?:string; seats?:number; doors?:number;
  weightKg?:number; dimensions?:string; registration?:string; version?:string; body?:string;
};
export type SupplierDetail = { photos:string[]; detail:SupplierDetailSpecs };
const clip=(s:string,n=60)=>s.slice(0,n);
// The body type only appears in the detail page's breadcrumb trail, never in the spec table.
const bodyLabel=(html:string):string|undefined=>{
  for(const block of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)){
    try{const data=JSON.parse(block[1]);
      for(const entry of Array.isArray(data)?data:[data]){
        const types=Array.isArray(entry?.['@type'])?entry['@type']:[entry?.['@type']];
        if(!types.includes('BreadcrumbList'))continue;
        for(const item of entry.itemListElement??[])
          if(/veh_type=\d+/.test(String(item?.['@id']??''))&&item?.name)return String(item.name);
      }
    }catch{ /* Structured data that is not valid JSON is simply skipped. */ }
  }
  return undefined;
};
export function parseSupplierDetail(html:string, reference:string):SupplierDetail {
  const fields=new Map<string,string>();
  for(const cell of html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g)){
    const key=plain(cell[1]).toLowerCase(),value=plain(cell[2]);
    if(key&&value&&!fields.has(key))fields.set(key,value);
  }
  const pick=(...keys:string[]):string|undefined=>{for(const key of keys){const value=fields.get(key);if(value)return value;}return undefined;};
  const num=(value?:string):number|undefined=>{const n=Number((value??'').replace(/,/g,'').match(/\d+/)?.[0]);return Number.isFinite(n)&&n>0?n:undefined;};
  const rawDrive=pick('drive'),seats=num(pick('seats')),doors=num(pick('doors')),weight=num(pick('weight'));
  const bodyRaw=bodyLabel(html),body=bodyRaw?plain(bodyRaw):undefined;
  const drive=rawDrive?/4\s*wheel|4wd|4 wd/i.test(rawDrive)?'4WD':/2\s*wheel|2wd|2 wd/i.test(rawDrive)?'2WD':clip(rawDrive,24):undefined;
  const detail:SupplierDetailSpecs={
    ...(pick('chassis no.','chassis')?{chassis:clip(pick('chassis no.','chassis')!)}:{}),
    ...(pick('engine code')?{engineCode:clip(pick('engine code')!)}:{}),
    ...(pick('ext. color','exterior colour','exterior color','colour','color')?{colour:clip(pick('ext. color','exterior colour','exterior color','colour','color')!)}:{}),
    ...(drive?{drive}:{}),
    ...(seats?{seats}:{}),...(doors?{doors}:{}),...(weight?{weightKg:weight}:{}),
    ...(pick('dimension')?{dimensions:clip(pick('dimension')!,40)}:{}),
    ...(pick('registration year/month','registration')?{registration:clip(pick('registration year/month','registration')!,20)}:{}),
    ...(pick('version/class','version')?{version:clip(pick('version/class','version')!)}:{}),
    ...(body?{body:clip(body,24)}:{}),
  };
  return {photos:parseSupplierPhotos(html,reference),detail};
}
export async function fetchBeforwardSelection():Promise<SupplierVehicle[]> {
  const vehicles=new Map<string,SupplierVehicle>();
  for(const make of [1,3,2,4,7]) {
    for(const page of [1,2]) {
      const url=new URL(`https://www.beforward.jp/stocklist/make=${make}/${page>1?`page=${page}/`:''}sortkey=n`);
      const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Accept':'text/html','Cookie':'currency=USD'}});
      if(!response.ok){if(page===1)throw new Error(`BE FORWARD returned ${response.status}`);break;}
      const html=await response.text();if(html.length>5000000)throw new Error('Supplier response exceeds limit');
      const parsed=parseBeforward(html);if(!parsed.length){if(page===1)throw new Error('Supplier markup changed; previous snapshot retained');break;}
      const size=vehicles.size;
      for(const v of parsed)vehicles.set(v.id,v);
      if(vehicles.size===size)break;
      if(vehicles.size>=300)break;
    }
    if(vehicles.size>=300)break;
  }
  if(!vehicles.size)throw new Error('Supplier markup changed; previous snapshot retained');
  return [...vehicles.values()].slice(0,300);
}
