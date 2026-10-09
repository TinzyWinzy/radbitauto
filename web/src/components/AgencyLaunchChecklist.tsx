import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCompanyDoc, useStaff, useCases } from '../lib/hooks';
import type { DealerWorkspace } from './DealerOverview';
export default function AgencyLaunchChecklist({ workspace, workspaceError }: { workspace?: DealerWorkspace; workspaceError?: string }){
 const {claims}=useAuth(),{data:company}=useCompanyDoc(claims.companyId),{data:staff}=useStaff(claims.companyId),{data:cases}=useCases(claims.companyId);
 if(claims.appRole!=='admin'||!company)return null;
 const published=workspace?.dealer_stock.some(s=>s.published&&s.status==='available');
 if(published)return null;
 const retail=company.businessFocus!=='imports';
 const steps=[{title:retail?'Register and price your first stock vehicle':'Open your first customer enquiry',detail:retail?'Choose owned or consigned stock and record the asking price.':'Add the customer, then open an import enquiry.',href:retail?'/app/dealership':'/app/new/customer',done:retail?Boolean(workspace?.dealer_stock.length):cases.length>0}, {title:'Publish your showroom',detail:'Add confirmed specifications and photos, then publish available stock. Your supplier and customer records stay private.',href:'/app/dealership',done:published}, {title:'Share your business link',detail:'Open your public showroom and share its link with buyers on WhatsApp.',href:`/showroom/${company.slug}`,done:false}, {title:'Invite your team when ready',detail:'Each colleague uses their own account. Customer invitations are separate.',href:'/app/invitations',done:staff.length>1}];
 return <section className="workflow-record mb-6" aria-label="Agency launch checklist"><p className="interface-eyebrow">Get your business ready</p><h2 className="mt-2 font-display text-2xl">Welcome to {company.name}</h2><p className="mt-2 text-sm text-slate-300">{retail?'Start with the vehicles you can offer today.':'Start with a real customer request, then attach the sourced vehicle.'} USD quotations and payment records are ready to use.</p>{workspaceError&&<p role="status" className="mt-3 text-sm">{workspaceError}</p>}<ol className="mt-4 space-y-3">{steps.map((s,i)=><li key={s.title} className="attention-row"><div><h3>{s.done?'✓':String(i+1).padStart(2,'0')} · {s.title}</h3><p>{s.detail}</p></div><Link className="btn-ghost" to={s.href}>{s.done?'Review':'Open'}</Link></li>)}</ol></section>;
}
