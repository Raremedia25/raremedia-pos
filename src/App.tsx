import { useEffect, useRef, useState } from "react";
import {
  Activity, ArrowLeft, Building2, CheckCircle2, ChevronRight, ChevronDown, CircleDollarSign,
  ClipboardList, Coffee, ImagePlus, LogOut, Package, Plus, Search, ShieldCheck,
  ShoppingCart, Store, Users, X, Truck, Wallet, BarChart3, Table2, RefreshCw,
  House, Flame, Settings,
  Minus, Trash2, Printer, Boxes, FileText, ArrowUpRight, AlertTriangle
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import type { Organization, Product, Profile } from "./types";
import type { Session } from "@supabase/supabase-js";

type Tab = "overview"|"pos"|"products"|"stock"|"customers"|"suppliers"|"purchases"|"expenses"|"tables"|"reports"|"team";
type CartLine = { product: Product; quantity: number };

function App() {
  const [session,setSession]=useState<Session|null>(null),[profile,setProfile]=useState<Profile|null>(null);
  const [organizations,setOrganizations]=useState<Organization[]>([]),[activeOrg,setActiveOrg]=useState<Organization|null>(null);
  const [products,setProducts]=useState<Product[]>([]),[loading,setLoading]=useState(true),[message,setMessage]=useState("");
  const [loginEmail,setLoginEmail]=useState(""),[loginPassword,setLoginPassword]=useState("");
  const [showCreate,setShowCreate]=useState(false),[tab,setTab]=useState<Tab>("overview"),[refresh,setRefresh]=useState(0);
  const [managementOpen,setManagementOpen]=useState(false),[businessSearch,setBusinessSearch]=useState(""),[businessStatus,setBusinessStatus]=useState<"all"|"active"|"suspended">("all");
  const identityRequest=useRef(0);
  async function loadIdentity(authSession:Session|null){
    const request=++identityRequest.current;
    setSession(authSession);
    if(!authSession){setProfile(null);setOrganizations([]);setActiveOrg(null);setProducts([]);setLoading(false);return;}
    if(!supabase)return;
    setLoading(true);setMessage("");
    try{
      const {data:p,error:profileError}=await supabase.from("profiles").select("id,full_name,platform_role").eq("id",authSession.user.id).maybeSingle();
      if(request!==identityRequest.current)return;
      if(profileError)throw profileError;
      if(!p){
        setProfile(null);setOrganizations([]);
        setMessage("Your POS profile is missing. Run the latest database migration in Supabase, then set your platform role again.");
        return;
      }
      const {data:memberships,error:membershipError}=await supabase.from("organization_users").select("organization_id").eq("user_id",authSession.user.id).eq("is_active",true);
      if(request!==identityRequest.current)return;
      if(membershipError)throw membershipError;
      let rows:Organization[]=[];
      if(memberships?.length){
        const ids=memberships.map(row=>row.organization_id);
        const {data,error}=await supabase.from("organizations").select("id,name,business_type,phone,address,currency,logo_url,status").in("id",ids).order("created_at",{ascending:false});
        if(error)throw error;
        rows=(data||[]) as Organization[];
      }else if(p.platform_role==="platform_admin"||p.platform_role==="developer"){
        const {data,error}=await supabase.from("organizations").select("id,name,business_type,phone,address,currency,logo_url,status").order("created_at",{ascending:false});
        if(error)throw error;
        rows=(data||[]) as Organization[];
      }
      if(request!==identityRequest.current)return;
      setProfile(p as Profile);setOrganizations(rows);
    }catch(error){
      if(request!==identityRequest.current)return;
      setProfile(null);setOrganizations([]);
      setMessage(databaseErrorMessage(error));
    }finally{
      if(request===identityRequest.current)setLoading(false);
    }
  }
  async function reloadIdentity(){
    if(!supabase)return;
    const {data,error}=await supabase.auth.getSession();
    if(error){setMessage(error.message);return;}
    await loadIdentity(data.session);
  }
  async function refreshProducts(org=activeOrg){if(!supabase||!org)return;const {data,error}=await supabase.from("products").select("id,name,sku,selling_price,cost_price,stock_quantity,low_stock_threshold,is_active").eq("organization_id",org.id).order("name");if(error){setMessage(databaseErrorMessage(error));setProducts([]);return;}setProducts((data||[]) as Product[]);}
  useEffect(()=>{
    if(!supabase){setLoading(false);return;}
    let active=true;
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,nextSession)=>{
      window.setTimeout(()=>{if(active)void loadIdentity(nextSession);},0);
    });
    return()=>{active=false;identityRequest.current++;subscription.unsubscribe();};
  },[]);
  useEffect(()=>{if(activeOrg)refreshProducts(activeOrg);},[activeOrg,refresh]);
  async function signIn(e:React.FormEvent){e.preventDefault();if(!supabase)return;setLoading(true);setMessage("");try{const {error}=await supabase.auth.signInWithPassword({email:loginEmail,password:loginPassword});if(error){setMessage(error.message);setLoading(false);}}catch(error){setMessage(databaseErrorMessage(error));setLoading(false);}}
  async function signOut(){await supabase?.auth.signOut();setSession(null);setProfile(null);setActiveOrg(null);setOrganizations([]);}
  if(!isSupabaseConfigured)return <SetupScreen/>;
  if(loading)return <div className="loading-screen"><div className="loader"/>Loading RAREMEDIA POS…</div>;
  if(!session)return <LoginScreen email={loginEmail} password={loginPassword} setEmail={setLoginEmail} setPassword={setLoginPassword} onSubmit={signIn} message={message}/>;
  const admin=profile?.platform_role==="platform_admin"||profile?.platform_role==="developer";
  const managementActive=["products","purchases","customers","suppliers","tables","expenses","team"].includes(tab);
  const visibleOrganizations=organizations.filter(org=>(businessStatus==="all"||org.status===businessStatus)&&org.name.toLowerCase().includes(businessSearch.trim().toLowerCase()));
  const openBusiness=(o:Organization)=>{setActiveOrg(o);setTab("overview");};
  return <div className={`app-shell ${activeOrg?"business-shell":""}`}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">R</div><div><b>RAREMEDIA POS</b><span>SMART BUSINESS. BETTER CONTROL.</span></div></div>
      {activeOrg?<><div className="business-rail-brand" title={activeOrg.name}>{activeOrg.logo_url?<img src={activeOrg.logo_url} alt={`${activeOrg.name} logo`}/>:<span><Store size={21}/></span>}</div>
        <nav className="business-primary-nav" aria-label="Business navigation">
          <Nav tab={tab} set={setTab} value="overview" icon={<House/>}>Home</Nav>
          <Nav tab={tab} set={setTab} value="pos" icon={<ShoppingCart/>}>Sales</Nav>
          <button className="side-link kitchen-link" type="button" disabled title="Kitchen order workflow is not available yet"><Flame/><span>Kitchen</span></button>
          <Nav tab={tab} set={setTab} value="stock" icon={<Boxes/>}>Stock</Nav>
          <Nav tab={tab} set={setTab} value="reports" icon={<BarChart3/>}>Reports</Nav>
          <button className={`side-link management-toggle ${managementActive?"active":""}`} type="button" aria-expanded={managementOpen||managementActive} onClick={()=>setManagementOpen(open=>!open)}><Settings/><span>Management</span><ChevronDown className="management-chevron"/></button>
        </nav>
        {(managementOpen||managementActive)&&<div className="sidebar-subnav" aria-label="Management tools">
          <Nav tab={tab} set={setTab} value="products" icon={<Package/>}>Products</Nav>
          <Nav tab={tab} set={setTab} value="purchases" icon={<ClipboardList/>}>Purchases</Nav>
          <Nav tab={tab} set={setTab} value="customers" icon={<Users/>}>Customers</Nav>
          <Nav tab={tab} set={setTab} value="suppliers" icon={<Truck/>}>Suppliers</Nav>
          <Nav tab={tab} set={setTab} value="tables" icon={<Table2/>}>Tables</Nav>
          <Nav tab={tab} set={setTab} value="expenses" icon={<Wallet/>}>Expenses</Nav>
          <Nav tab={tab} set={setTab} value="team" icon={<Users/>}>Team</Nav>
        </div>}
        <button className="business-switch" onClick={()=>setActiveOrg(null)} title="Switch business">
          <ChevronRight size={16}/><span><b>Switch business</b></span>
        </button>
      </>:<><div className="side-label">PLATFORM</div><button className="side-link active" onClick={()=>setActiveOrg(null)}><Building2 size={18}/> Businesses</button></>}
      <div className="sidebar-bottom"><div className="user-mini"><div className="avatar">{(profile?.full_name||session.user.email||"R").slice(0,1).toUpperCase()}</div><div><b>{profile?.full_name||"RAREMEDIA User"}</b><span>{profile?.platform_role==="developer"?"Developer":admin?"Super Admin":session.user.email}</span></div></div><button className="side-link" onClick={signOut}><LogOut size={18}/> Sign out</button></div>
    </aside>
    <main className="main-area"><header className="topbar"><div><span className="eyebrow">RAREMEDIA POS / {activeOrg?activeOrg.name:"PLATFORM"}</span><h1>{activeOrg?tabLabel(tab):"Business management"}</h1></div><div className="top-actions">{activeOrg&&<button className="top-business-switch" onClick={()=>setActiveOrg(null)}><Store size={15}/><span>{activeOrg.name}</span><ChevronRight size={14}/></button>}<span className="secure"><ShieldCheck size={15}/> Secure workspace</span><div className="avatar" title={profile?.full_name||session.user.email}>{(profile?.full_name||session.user.email||"R").slice(0,1).toUpperCase()}</div></div></header>
      {message&&<div className="notice"><span>{message}</span><button onClick={()=>setMessage("")}><X size={16}/></button></div>}
      {!activeOrg?<section className="content platform-content"><div className="platform-hero"><div><span className="eyebrow">PLATFORM OVERVIEW</span><h2>{admin?"Business network":"Your businesses"}</h2><p>Monitor business workspaces and open a secure workspace.</p></div>{admin&&<button className="primary-btn" onClick={()=>setShowCreate(true)}><Plus size={17}/> Create business</button>}</div>
        <div className="stat-grid"><Stat icon={<Store/>} label="Businesses" value={String(organizations.length)} hint="Available to your account"/><Stat icon={<CheckCircle2/>} label="Active businesses" value={String(organizations.filter(o=>o.status==="active").length)} hint="Currently enabled"/><Stat icon={<ShieldCheck/>} label="Platform access" value={profile?.platform_role==="developer"?"Developer":"Admin"} hint="Protected workspace"/></div>
        <div className="platform-list-heading"><div><h3>Business workspaces</h3><p>Search and select a workspace to continue.</p></div><span className="count-pill">{visibleOrganizations.length} of {organizations.length}</span></div>
        <div className="platform-filters"><label className="search-box"><Search size={16}/><input aria-label="Search businesses" placeholder="Search business name…" value={businessSearch} onChange={e=>setBusinessSearch(e.target.value)}/></label><div className="filter-pills" aria-label="Filter businesses">{(["all","active","suspended"] as const).map(status=><button type="button" className={businessStatus===status?"selected":""} onClick={()=>setBusinessStatus(status)}>{status==="all"?"All businesses":status==="active"?"Active":"Suspended"}</button>)}</div></div>
        {organizations.length===0?<div className="empty-state"><div className="empty-icon"><Building2/></div><h3>No business assigned yet</h3><p>{admin?"Create the first customer business to get started.":"Ask your Raremedia administrator to add your account."}</p>{admin&&<button className="primary-btn" onClick={()=>setShowCreate(true)}><Plus size={17}/> Create first business</button>}</div>:visibleOrganizations.length===0?<div className="empty-state"><div className="empty-icon"><Search/></div><h3>No matching businesses</h3><p>Try another search or status filter.</p><button className="secondary-btn" onClick={()=>{setBusinessSearch("");setBusinessStatus("all");}}>Clear filters</button></div>:<div className="business-grid">{visibleOrganizations.map(o=><button className="business-card" key={o.id} onClick={()=>openBusiness(o)}><div className="business-card-top">{o.logo_url?<img className="business-logo" src={o.logo_url} alt={`${o.name} logo`}/>:<div className="business-logo-placeholder"><Store/></div>}<span className={`status ${o.status}`}>{o.status}</span></div><h3>{o.name}</h3><p>{o.business_type}</p><div className="business-card-bottom"><span>{o.currency}</span><span>Open workspace <ChevronRight size={16}/></span></div></button>)}</div>}
      </section>:<section className={`content ${tab==="overview"?"dashboard-content":""}`}>
        {tab!=="overview"&&<><button className="back-link" onClick={()=>setActiveOrg(null)}><ArrowLeft size={16}/> All businesses</button>
        <div className="business-hero"><div className="hero-brand">{activeOrg.logo_url?<img src={activeOrg.logo_url}/>:<Store/>}</div><div><span className="eyebrow">BUSINESS WORKSPACE</span><h2>{activeOrg.name}</h2><p>{activeOrg.business_type} · {activeOrg.currency} · {activeOrg.address||"Address not set"}</p></div><span className={`status ${activeOrg.status}`}>{activeOrg.status}</span></div></>}
        {tab==="overview"&&<Overview org={activeOrg} products={products} setTab={setTab} onMessage={setMessage}/>}
        {tab==="pos"&&<POS org={activeOrg} products={products} onDone={()=>setRefresh(x=>x+1)} onMessage={setMessage}/>}
        {tab==="products"&&<Products org={activeOrg} products={products} onRefresh={()=>setRefresh(x=>x+1)} onMessage={setMessage}/>}
        {tab==="stock"&&<Stock org={activeOrg} products={products} onRefresh={()=>setRefresh(x=>x+1)} onMessage={setMessage}/>}
        {tab==="customers"&&<SimpleRecords org={activeOrg} table="customers" title="Customers" fields={[["name","Customer name"],["phone","Phone"],["email","Email"],["address","Address"]]} onMessage={setMessage}/>}
        {tab==="suppliers"&&<SimpleRecords org={activeOrg} table="suppliers" title="Suppliers" fields={[["name","Supplier name"],["phone","Phone"],["email","Email"],["address","Address"]]} onMessage={setMessage}/>}
        {tab==="purchases"&&<Purchases org={activeOrg} products={products} onDone={()=>setRefresh(x=>x+1)} onMessage={setMessage}/>}
        {tab==="expenses"&&<Expenses org={activeOrg} onMessage={setMessage}/>}
        {tab==="tables"&&<Tables org={activeOrg} onMessage={setMessage}/>}
        {tab==="reports"&&<Reports org={activeOrg} onMessage={setMessage}/>}
        {tab==="team"&&<Team org={activeOrg} onMessage={setMessage}/>}
      </section>}
    </main>
    {showCreate&&<CreateBusinessModal onClose={()=>setShowCreate(false)} onCreated={async()=>{setShowCreate(false);await reloadIdentity();}} onMessage={setMessage}/>}
  </div>;
}
function databaseErrorMessage(error:unknown){
 const result=error as {code?:string;message?:string};
 const detail=result?.message||"Database request failed.";
 if(["42P01","PGRST204","PGRST205"].includes(result?.code||"")||detail.toLowerCase().includes("schema cache")){
   return "The POS database is missing required tables or functions. Run all SQL migrations in order from supabase/migrations, then refresh this page.";
 }
 return detail;
}
function Nav({tab,set,value,icon,children}:any){return <button className={`side-link ${tab===value?"active":""}`} onClick={()=>set(value)}>{icon}{children}</button>}
function tabLabel(t:Tab){return ({overview:"Business dashboard",pos:"Point of Sale",products:"Products & catalogue",stock:"Stock management",customers:"Customers",suppliers:"Suppliers",purchases:"Purchases",expenses:"Expenses",tables:"Table management",reports:"Business reports",team:"Team management"} as any)[t];}
function Stat({icon,label,value,hint}:{icon:React.ReactNode;label:string;value:string;hint:string}){return <div className="stat-card"><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></div>}
function ModuleHeader({title,description,action}:{title:string;description:string;action?:React.ReactNode}){return <div className="section-heading module-heading"><div><h3>{title}</h3><p>{description}</p></div>{action}</div>}
function BusinessPrintBrand({org}:{org:Organization}){return <div className="business-print-brand">{org.logo_url?<img src={org.logo_url} alt={`${org.name} logo`}/>:<span className="business-print-logo-fallback"><Store size={22}/></span>}<div><h2>{org.name}</h2>{(org.phone||org.address)&&<small>{[org.phone,org.address].filter(Boolean).join(" · ")}</small>}</div></div>}
function SetupScreen(){return <div className="center-screen"><div className="setup-card"><div className="brand-mark large">R</div><h1>Connect your Supabase project</h1><p>Copy <code>.env.example</code> to <code>.env</code>, then add your Supabase project URL and anon/publishable key.</p><p className="muted">Never put your Supabase service-role key in this frontend application.</p></div></div>}
function LoginScreen({email,password,setEmail,setPassword,onSubmit,message}:any){return <div className="login-layout"><div className="login-art"><div className="brand light"><div className="brand-mark">R</div><div><b>RAREMEDIA</b><span>POINT OF SALE</span></div></div><div className="login-art-copy"><span className="eyebrow">ONE PLATFORM. EVERY BUSINESS.</span><h1>Run your business.<br/><em>Your way.</em></h1><p>A secure point-of-sale platform built for independent businesses.</p><div className="feature-line"><ShieldCheck/> Independent business data by design</div></div><div className="login-footer">RAREMEDIA POS · Business management platform</div></div><div className="login-panel"><form className="login-form" onSubmit={onSubmit}><span className="eyebrow">WELCOME BACK</span><h2>Sign in to your workspace</h2><p>Use the account invited or created for you.</p>{message&&<div className="error-box">{message}</div>}<label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@business.com"/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/></label><button className="primary-btn full">Sign in <ChevronRight size={17}/></button><small>Need access? Contact your Raremedia platform administrator.</small></form></div></div>}
function CreateBusinessModal({onClose,onCreated,onMessage}:any){
 const [f,S]=useState({name:"",business_type:"Restaurant & Bar",owner_name:"",owner_email:"",password:"",password_confirmation:"",phone:"",address:"",currency:"RWF",load_demo:true});const [logo,L]=useState<File|null>(null);const [saving,B]=useState(false);const [error,E]=useState("");
 const set=(k:string,v:any)=>S(o=>({...o,[k]:v}));
 async function submit(e:React.FormEvent){e.preventDefault();if(!supabase)return;B(true);E("");try{
  if(f.password.length<8)throw new Error("Password must be at least 8 characters.");if(f.password!==f.password_confirmation)throw new Error("Passwords do not match.");
  const {password_confirmation,...businessDetails}=f;const {data,error}=await supabase.functions.invoke("create-business",{body:businessDetails});if(error){const status=error.context instanceof Response?error.context.status:undefined;if(status===404)throw new Error("Business creation is not deployed yet. Deploy the create-business Supabase Edge Function, then try again.");throw error;}if(!data?.organization_id)throw new Error(data?.error||"Business creation failed.");
  if(logo){const ext=logo.name.split(".").pop()?.toLowerCase()||"png";const path=`${data.organization_id}/logo.${ext}`;const {error:up}=await supabase.storage.from("business-logos").upload(path,logo,{upsert:true,contentType:logo.type});if(up)throw up;const {data:p}=supabase.storage.from("business-logos").getPublicUrl(path);const {error:ue}=await supabase.from("organizations").update({logo_url:p.publicUrl}).eq("id",data.organization_id);if(ue)throw ue;}
  onMessage(data.owner_invited?`Business ${f.name} created. An invitation email was sent to ${f.owner_email}; the owner can sign in with the password set here.`:`Business ${f.name} created and linked to ${f.owner_email}'s existing account. The existing password was not changed and no new invitation was needed.`);await onCreated();
 }catch(err:any){E(err.message||"Unable to create business.");}finally{B(false);}}
 return <div className="modal-backdrop"><div className="modal-card"><div className="modal-header"><div><span className="eyebrow">PLATFORM ADMINISTRATION</span><h2>Create a business</h2><p>Register an independent customer workspace.</p></div><button className="icon-btn" onClick={onClose}><X/></button></div><form onSubmit={submit}><div className="form-grid">
  <label>Business name *<input required value={f.name} onChange={e=>set("name",e.target.value)}/></label><label>Business type<select value={f.business_type} onChange={e=>set("business_type",e.target.value)}>{["Restaurant & Bar","Restaurant","Bar","Supermarket","Retail shop","Pharmacy","Other"].map(x=><option>{x}</option>)}</select></label>
  <label>Owner full name *<input required value={f.owner_name} onChange={e=>set("owner_name",e.target.value)}/></label><label>Owner email *<input required type="email" value={f.owner_email} onChange={e=>set("owner_email",e.target.value)}/></label>
  <label>Owner login password *<input required type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={e=>set("password",e.target.value)}/><small>At least 8 characters. Share it securely with the owner.</small></label><label>Confirm password *<input required type="password" autoComplete="new-password" minLength={8} value={f.password_confirmation} onChange={e=>set("password_confirmation",e.target.value)}/></label>
  <label>Phone<input value={f.phone} onChange={e=>set("phone",e.target.value)}/></label><label>Currency<select value={f.currency} onChange={e=>set("currency",e.target.value)}>{["RWF","USD","EUR","KES","UGX","TZS"].map(x=><option>{x}</option>)}</select></label>
  <label className="wide">Address<input value={f.address} onChange={e=>set("address",e.target.value)}/></label>
  <label className="wide upload-label"><span><ImagePlus size={18}/> Business logo</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>L(e.target.files?.[0]||null)}/><small>{logo?.name||"PNG, JPG or WEBP"}</small></label>
 </div><label className="checkbox-line"><input type="checkbox" checked={f.load_demo} onChange={e=>set("load_demo",e.target.checked)}/> Load demo catalogue (starter products, recipes, tables, suppliers and stock)</label>{error&&<div className="error-box">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={saving}>{saving?"Creating…":"Create business & owner login"}</button></div></form></div></div>;
}
function Overview({org,setTab,onMessage}:any){
 const [dashboard,D]=useState<any>({loading:true,today:0,month:0,expenses:0,recent:[],top:[],week:[],low:[],error:null});
 const [retry,R]=useState(0);
 useEffect(()=>{let mounted=true;const load=async()=>{
  if(!supabase)return;
  D((current:any)=>({...current,loading:true,error:null}));
  try{
   const now=new Date(),dayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()),monthStart=new Date(now.getFullYear(),now.getMonth(),1),weekStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6);
   const [todaySales,monthSales,weekSales,monthExpenses,recentSales,monthItems,stockResult]=await Promise.all([
     supabase.from("sales").select("total").eq("organization_id",org.id).eq("status","completed").gte("created_at",dayStart.toISOString()),
     supabase.from("sales").select("total").eq("organization_id",org.id).eq("status","completed").gte("created_at",monthStart.toISOString()),
     supabase.from("sales").select("created_at,total").eq("organization_id",org.id).eq("status","completed").gte("created_at",weekStart.toISOString()),
     supabase.from("expenses").select("amount").eq("organization_id",org.id).gte("created_at",monthStart.toISOString()),
     supabase.from("sales").select("id,receipt_number,total,created_at,status").eq("organization_id",org.id).eq("status","completed").order("created_at",{ascending:false}).limit(5),
     supabase.from("sale_items").select("product_name,quantity,line_total,sales!inner(created_at,status)").eq("organization_id",org.id).gte("sales.created_at",monthStart.toISOString()).eq("sales.status","completed"),
     supabase.from("products").select("id,name,stock_quantity,low_stock_threshold").eq("organization_id",org.id).eq("is_active",true).order("stock_quantity",{ascending:true})
   ]);
   const failed=[todaySales,monthSales,weekSales,monthExpenses,recentSales,monthItems,stockResult].find(result=>result.error);
   if(!mounted)return;
   if(failed?.error){
     const error=databaseErrorMessage(failed.error);
     D((current:any)=>({...current,loading:false,error}));
     onMessage?.(`Dashboard data could not be fully loaded: ${error}`);
     return;
   }
   const week=Array.from({length:7},(_,index)=>{
     const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6+index);
     const key=`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
     const total=(weekSales.data||[]).reduce((sum:number,row:any)=>{
       const saleDate=new Date(row.created_at),saleKey=`${saleDate.getFullYear()}-${saleDate.getMonth()}-${saleDate.getDate()}`;
       return saleKey===key?sum+Number(row.total):sum;
     },0);
     return {label:date.toLocaleDateString(undefined,{weekday:"short"}),total};
   });
   const topMap=new Map<string,{name:string;quantity:number;total:number}>();
   (monthItems.data||[]).forEach((item:any)=>{
     const current=topMap.get(item.product_name)||{name:item.product_name,quantity:0,total:0};
     current.quantity+=Number(item.quantity);current.total+=Number(item.line_total);topMap.set(item.product_name,current);
   });
   const low=(stockResult.data||[]).filter((product:any)=>Number(product.stock_quantity)<=Number(product.low_stock_threshold));
   D({
     loading:false,
     today:(todaySales.data||[]).reduce((sum:number,row:any)=>sum+Number(row.total),0),
     month:(monthSales.data||[]).reduce((sum:number,row:any)=>sum+Number(row.total),0),
     expenses:(monthExpenses.data||[]).reduce((sum:number,row:any)=>sum+Number(row.amount),0),
     recent:recentSales.data||[],
     top:[...topMap.values()].sort((a,b)=>b.quantity-a.quantity).slice(0,5),
     week,low:low.slice(0,5),lowCount:low.length
   });
  }catch(error){
   if(!mounted)return;
   const detail=databaseErrorMessage(error);
   D((current:any)=>({...current,loading:false,error:detail}));
   onMessage?.(`Dashboard data could not be loaded: ${detail}`);
  }
 };void load();return()=>{mounted=false;};},[org.id,onMessage,retry]);
 const maxWeek=Math.max(1,...dashboard.week.map((day:any)=>day.total));
 const chartPoints=dashboard.week.map((day:any,index:number)=>({x:24+index*55,y:142-(day.total/maxWeek)*105}));
 const linePoints=chartPoints.map((point:any)=>`${point.x},${point.y}`).join(" ");
 const areaPoints=chartPoints.length?`24,160 ${linePoints} 354,160`:"24,160 354,160";
 const actions=[["New sale","Start a checkout",ShoppingCart,"pos"],["Add product","Update your catalogue",Package,"products"],["Record purchase","Restock inventory",ClipboardList,"purchases"],["Add expense","Log a business expense",Wallet,"expenses"],["View reports","Review business performance",BarChart3,"reports"],["Manage tables","Update table status",Table2,"tables"]];
 return <div className="dashboard">
   {dashboard.error&&<div className="dashboard-error"><span>{dashboard.error}</span><button onClick={()=>R((value:number)=>value+1)}>Retry</button></div>}
   <div className="dashboard-welcome"><div><span className="eyebrow">YOUR BUSINESS AT A GLANCE</span><h2>Welcome to {org.name}</h2><p>{org.business_type} <span>·</span> {new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</p></div>{org.logo_url?<img src={org.logo_url} alt={`${org.name} logo`}/>:<div className="welcome-logo"><Store size={32}/></div>}</div>
   <div className="dashboard-stats">
     <DashboardStat icon={<ShoppingCart/>} tone="blue" label="Today's sales" value={dashboard.loading||dashboard.error?"—":money(dashboard.today,org.currency)} hint="Completed sales today"/>
     <DashboardStat icon={<BarChart3/>} tone="green" label="This month" value={dashboard.loading||dashboard.error?"—":money(dashboard.month,org.currency)} hint="Completed sales this month"/>
     <DashboardStat icon={<Wallet/>} tone="purple" label="Expenses this month" value={dashboard.loading||dashboard.error?"—":money(dashboard.expenses,org.currency)} hint="Recorded expenses"/>
     <DashboardStat icon={<AlertTriangle/>} tone="orange" label="Stock alerts" value={dashboard.loading||dashboard.error?"—":`${dashboard.lowCount||0} items`} hint="At or below reorder level" action={()=>setTab("stock")}/>
   </div>
   <div className="dashboard-row primary-row">
     <section className="dashboard-panel sales-panel"><div className="panel-heading"><h3><BarChart3/> Sales overview</h3><span>Last 7 days</span></div>
       <div className="sales-chart"><div className="chart-y-labels"><span>{money(maxWeek,org.currency)}</span><span>{money(maxWeek/2,org.currency)}</span><span>0</span></div><svg viewBox="0 0 380 175" role="img" aria-label="Sales totals over the last seven days"><defs><linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity=".25"/><stop offset="100%" stopColor="#2563eb" stopOpacity="0"/></linearGradient></defs><polygon points={areaPoints} fill="url(#salesFill)"/><polyline points={linePoints} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>{chartPoints.map((point:any,index:number)=><circle key={index} cx={point.x} cy={point.y} r="4" fill="#fff" stroke="#2563eb" strokeWidth="2"/>)}</svg></div>
       <div className="chart-x-labels">{dashboard.week.map((day:any,index:number)=><span key={index}>{day.label}</span>)}</div>
     </section>
     <section className="dashboard-panel top-products-panel"><div className="panel-heading"><h3><Package/> Top products</h3><button onClick={()=>setTab("products")}>View all <ArrowUpRight size={14}/></button></div>{dashboard.top.length?dashboard.top.map((item:any,index:number)=><div className="top-product" key={item.name}><span className={`product-rank rank-${index+1}`}>{index+1}</span><div><b>{item.name}</b><small>{item.quantity} sold this month</small></div><strong>{money(item.total,org.currency)}</strong></div>):<div className="panel-empty">{dashboard.loading?"Loading sales…":dashboard.error?"Sales data unavailable. Retry to try again.":"No product sales this month yet."}</div>}</section>
     <section className="dashboard-panel quick-actions-panel"><div className="panel-heading"><h3><Activity/> Quick actions</h3></div><div className="quick-actions">{actions.map(([title,description,Icon,target]:any)=><button key={title} className={`quick-action action-${target}`} onClick={()=>setTab(target)}><Icon/><b>{title}</b><small>{description}</small></button>)}</div></section>
   </div>
   <div className="dashboard-row secondary-row">
     <section className="dashboard-panel recent-sales-panel"><div className="panel-heading"><h3><FileText/> Recent sales</h3><button onClick={()=>setTab("reports")}>View reports <ArrowUpRight size={14}/></button></div><div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>RECEIPT</th><th>TIME</th><th>STATUS</th><th className="amount-cell">AMOUNT</th></tr></thead><tbody>{dashboard.recent.map((sale:any)=><tr key={sale.id}><td><b>{sale.receipt_number||sale.id.slice(0,8).toUpperCase()}</b></td><td>{new Date(sale.created_at).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}</td><td><span className="sale-status">Completed</span></td><td className="amount-cell">{money(Number(sale.total),org.currency)}</td></tr>)}{!dashboard.recent.length&&<tr><td className="dashboard-empty" colSpan={4}>{dashboard.loading?"Loading sales…":dashboard.error?"Sales data unavailable. Retry to try again.":"No completed sales yet."}</td></tr>}</tbody></table></div></section>
     <section className="dashboard-panel stock-status-panel"><div className="panel-heading"><h3><Boxes/> Stock status</h3><button onClick={()=>setTab("stock")}>View inventory <ArrowUpRight size={14}/></button></div>{dashboard.low.length?dashboard.low.map((product:any)=><div className="stock-row" key={product.id}><span className="stock-product-icon"><Package size={17}/></span><b>{product.name}</b><span>{product.stock_quantity} left</span><em>Low stock</em></div>):<div className="panel-empty">{dashboard.loading?"Loading stock…":dashboard.error?"Stock data unavailable. Retry to try again.":"No low-stock products."}</div>}</section>
   </div>
 </div>;
}
function DashboardStat({icon,tone,label,value,hint,action}:{icon:React.ReactNode;tone:string;label:string;value:string;hint:string;action?:()=>void}){
 return <div className={`dashboard-stat stat-${tone}`}><div className="dashboard-stat-top"><span className="dashboard-stat-icon">{icon}</span>{action&&<button onClick={action}>View inventory <ChevronRight size={13}/></button>}</div><span className="dashboard-stat-label">{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}
function money(n:number,c:string){return `${n.toLocaleString(undefined,{maximumFractionDigits:2})} ${c}`;}
function Products({org,products,onRefresh,onMessage}:any){
 const [show,S]=useState(false),[q,Q]=useState("");const [f,F]=useState({name:"",sku:"",selling_price:"",cost_price:"",stock_quantity:"0",low_stock_threshold:"5",unit:"piece"});
 const filtered=products.filter((p:Product)=>p.name.toLowerCase().includes(q.toLowerCase())||(p.sku||"").toLowerCase().includes(q.toLowerCase()));
 async function save(e:React.FormEvent){e.preventDefault();if(!supabase)return;const {error}=await supabase.rpc("create_product",{p_org_id:org.id,p_name:f.name,p_sku:f.sku||null,p_unit:f.unit,p_selling_price:Number(f.selling_price),p_cost_price:Number(f.cost_price||0),p_initial_stock:Number(f.stock_quantity),p_low_stock_threshold:Number(f.low_stock_threshold)});if(error)onMessage(databaseErrorMessage(error));else{S(false);F({name:"",sku:"",selling_price:"",cost_price:"",stock_quantity:"0",low_stock_threshold:"5",unit:"piece"});onRefresh();}}
 return <><ModuleHeader title="Product catalogue" description="Create and maintain products belonging only to this business." action={<button className="primary-btn" onClick={()=>S(true)}><Plus size={16}/> Add product</button>}/><div className="toolbar"><div className="search-box"><Search size={17}/><input placeholder="Search product or SKU…" value={q} onChange={e=>Q(e.target.value)}/></div><span className="count-pill">{filtered.length} products</span></div><div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>SKU</th><th>SELLING PRICE</th><th>COST</th><th>STOCK</th><th>STATUS</th></tr></thead><tbody>{filtered.map((p:Product)=><tr><td><b>{p.name}</b></td><td>{p.sku||"—"}</td><td>{money(p.selling_price,org.currency)}</td><td>{money(p.cost_price,org.currency)}</td><td>{p.stock_quantity}</td><td><span className={`status ${p.is_active?"active":"suspended"}`}>{p.is_active?"Active":"Inactive"}</span></td></tr>)}{!filtered.length&&<tr><td colSpan={6} className="empty-cell">No products found.</td></tr>}</tbody></table></div>
 {show&&<Modal title="Add product" close={()=>S(false)}><form onSubmit={save} className="stack-form"><label>Product name *<input required value={f.name} onChange={e=>F({...f,name:e.target.value})}/></label><div className="form-grid"><label>SKU / barcode<input value={f.sku} onChange={e=>F({...f,sku:e.target.value})}/></label><label>Unit<input value={f.unit} onChange={e=>F({...f,unit:e.target.value})}/></label><label>Selling price *<input type="number" min="0" step=".01" required value={f.selling_price} onChange={e=>F({...f,selling_price:e.target.value})}/></label><label>Cost price<input type="number" min="0" step=".01" value={f.cost_price} onChange={e=>F({...f,cost_price:e.target.value})}/></label><label>Opening stock<input type="number" min="0" step=".001" value={f.stock_quantity} onChange={e=>F({...f,stock_quantity:e.target.value})}/></label><label>Low-stock alert at<input type="number" min="0" step=".001" value={f.low_stock_threshold} onChange={e=>F({...f,low_stock_threshold:e.target.value})}/></label></div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>S(false)}>Cancel</button><button className="primary-btn">Save product</button></div></form></Modal>}</>;
}
function POS({org,products,onDone,onMessage}:any){
 const [cart,C]=useState<CartLine[]>([]),[q,Q]=useState(""),[method,M]=useState("cash"),[discount,D]=useState("0"),[paid,P]=useState(""),[busy,B]=useState(false),[receipt,R]=useState<any>(null);
 const list=products.filter((p:Product)=>p.is_active&&p.name.toLowerCase().includes(q.toLowerCase()));
 const total=cart.reduce((s,x)=>s+x.product.selling_price*x.quantity,0),grand=Math.max(0,total-Number(discount||0));
 function add(p:Product){C(old=>{const found=old.find(x=>x.product.id===p.id);return found?old.map(x=>x.product.id===p.id?{...x,quantity:x.quantity+1}:x):[...old,{product:p,quantity:1}];});}
 async function checkout(){if(!supabase||!cart.length)return;B(true);try{const {data,error}=await supabase.rpc("complete_sale",{p_org_id:org.id,p_items:cart.map(x=>({product_id:x.product.id,quantity:x.quantity})),p_payment_method:method,p_amount_paid:paid?Number(paid):grand,p_customer_id:null,p_discount:Number(discount||0)});if(error)throw error;R(data);C([]);P("");D("0");onDone();}catch(error){onMessage(databaseErrorMessage(error));}finally{B(false);}}
 return <><ModuleHeader title="Point of Sale" description="Add products to the cart, accept payment and complete the sale."/><div className="pos-layout"><div><div className="search-box pos-search"><Search size={17}/><input placeholder="Find products…" value={q} onChange={e=>Q(e.target.value)}/></div><div className="pos-products">{list.map((p:Product)=><button className="pos-product" onClick={()=>add(p)} disabled={p.stock_quantity<=0}><span className="pos-product-icon"><Coffee/></span><b>{p.name}</b><small>{money(p.selling_price,org.currency)}</small><em>{p.stock_quantity} in stock</em></button>)}</div></div><div className="cart-panel"><div className="cart-title"><h3>Current sale</h3><span>{cart.reduce((s,x)=>s+x.quantity,0)} items</span></div>{!cart.length?<div className="cart-empty"><ShoppingCart/><p>Select products to begin.</p></div>:<div className="cart-lines">{cart.map(x=><div className="cart-line"><div><b>{x.product.name}</b><small>{money(x.product.selling_price,org.currency)}</small></div><div className="qty-controls"><button onClick={()=>C(old=>old.map(y=>y.product.id===x.product.id?{...y,quantity:Math.max(0,y.quantity-1)}:y).filter(y=>y.quantity>0))}><Minus size={13}/></button><span>{x.quantity}</span><button onClick={()=>add(x.product)}><Plus size={13}/></button><button onClick={()=>C(old=>old.filter(y=>y.product.id!==x.product.id))}><Trash2 size={13}/></button></div></div>)}</div>}<div className="cart-totals"><div><span>Subtotal</span><b>{money(total,org.currency)}</b></div><label>Discount<input type="number" min="0" max={total} value={discount} onChange={e=>D(e.target.value)}/></label><div className="grand-total"><span>Total</span><b>{money(grand,org.currency)}</b></div><label>Payment method<select value={method} onChange={e=>M(e.target.value)}><option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option></select></label><label>Amount received<input type="number" min={grand} value={paid} onChange={e=>P(e.target.value)} placeholder={String(grand)}/></label><button className="primary-btn full" disabled={!cart.length||busy} onClick={checkout}>{busy?"Processing…":"Complete sale"}</button></div></div></div>
 {receipt&&<Modal title="Sale completed" close={()=>R(null)}><div className="receipt" id="receipt"><BusinessPrintBrand org={org}/><hr/><b>RECEIPT: {receipt.receipt_number}</b><p>{new Date().toLocaleString()}</p><hr/>{(receipt.items||[]).map((item:any)=><div className="receipt-item"><span>{item.name} × {item.quantity}</span><b>{money(item.line_total,org.currency)}</b></div>)}<hr/><div>Subtotal: {money(receipt.subtotal,org.currency)}</div><div>Discount: {money(receipt.discount,org.currency)}</div><h3>Total: {money(receipt.total,org.currency)}</h3><div>Paid: {money(receipt.amount_paid,org.currency)}</div><div>Change: {money(receipt.change,org.currency)}</div><hr/><p className="receipt-thanks">Thank you for your business!</p></div><div className="modal-actions"><button className="secondary-btn" onClick={()=>window.print()}><Printer size={15}/> Print receipt</button><button className="primary-btn" onClick={()=>R(null)}>Done</button></div></Modal>}</>;
}
function Stock({org,products,onRefresh,onMessage}:any){
 const [id,I]=useState(""),[qty,Q]=useState(""),[reason,R]=useState("stock count adjustment"),[busy,B]=useState(false);
 async function adjust(e:React.FormEvent){e.preventDefault();if(!supabase)return;B(true);try{const {error}=await supabase.rpc("adjust_stock",{p_org_id:org.id,p_product_id:id,p_quantity:Number(qty),p_reason:reason,p_notes:"Manual stock adjustment"});if(error)throw error;onMessage("Stock adjustment saved.");Q("");onRefresh();}catch(error){onMessage(databaseErrorMessage(error));}finally{B(false);}}
 return <><ModuleHeader title="Stock management" description="Review stock levels and record positive or negative adjustments."/><div className="stat-grid"><Stat icon={<Package/>} label="Products tracked" value={String(products.length)} hint="In this business"/><Stat icon={<Activity/>} label="Low stock" value={String(products.filter((p:Product)=>p.stock_quantity<=p.low_stock_threshold).length)} hint="At or below product reorder level"/></div><div className="form-panel"><h3>Adjust stock</h3><form className="inline-form" onSubmit={adjust}><label>Product<select required value={id} onChange={e=>I(e.target.value)}><option value="">Select product</option>{products.map((p:Product)=><option value={p.id}>{p.name} (current: {p.stock_quantity})</option>)}</select></label><label>Quantity change<input type="number" step=".001" required value={qty} onChange={e=>Q(e.target.value)} placeholder="e.g. 10 or -2"/></label><label>Reason<input value={reason} onChange={e=>R(e.target.value)}/></label><button className="primary-btn" disabled={busy}>{busy?"Saving…":"Save adjustment"}</button></form></div><div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>SKU</th><th>ON HAND</th><th>UNIT COST</th><th>STATUS</th></tr></thead><tbody>{products.map((p:Product)=><tr><td><b>{p.name}</b></td><td>{p.sku||"—"}</td><td>{p.stock_quantity}</td><td>{money(p.cost_price,org.currency)}</td><td><span className={`status ${p.stock_quantity<=p.low_stock_threshold?"suspended":"active"}`}>{p.stock_quantity<=p.low_stock_threshold?"Low stock":"In stock"}</span></td></tr>)}</tbody></table></div></>;
}
function SimpleRecords({org,table,title,fields,onMessage}:any){
 const [rows,R]=useState<any[]>([]),[show,S]=useState(false),[form,F]=useState<any>({});
 async function load(){if(!supabase)return;const {data,error}=await supabase.from(table).select("*").eq("organization_id",org.id).order("created_at",{ascending:false});if(error)onMessage(error.message);R(data||[]);}
 useEffect(()=>{load();},[org.id,table]);
 async function save(e:React.FormEvent){e.preventDefault();const {error}=await supabase!.from(table).insert({...form,organization_id:org.id});if(error)onMessage(error.message);else{S(false);F({});load();}}
 return <><ModuleHeader title={title} description={`Manage ${title.toLowerCase()} for ${org.name}.`} action={<button className="primary-btn" onClick={()=>S(true)}><Plus size={16}/> Add {title.slice(0,-1).toLowerCase()}</button>}/><div className="table-wrap"><table><thead><tr>{fields.map((f:any)=><th>{f[1].toUpperCase()}</th>)}<th>CREATED</th></tr></thead><tbody>{rows.map(r=><tr>{fields.map((f:any)=><td>{r[f[0]]||"—"}</td>)}<td>{new Date(r.created_at).toLocaleDateString()}</td></tr>)}{!rows.length&&<tr><td className="empty-cell" colSpan={fields.length+1}>No records yet.</td></tr>}</tbody></table></div>{show&&<Modal title={`Add ${title}`} close={()=>S(false)}><form className="stack-form" onSubmit={save}>{fields.map((f:any)=><label>{f[1]}<input required={f[0]==="name"} value={form[f[0]]||""} onChange={e=>F({...form,[f[0]]:e.target.value})}/></label>)}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>S(false)}>Cancel</button><button className="primary-btn">Save</button></div></form></Modal>}</>;
}
function Purchases({org,products,onDone,onMessage}:any){
 const [supplier,S]=useState(""),[product,P]=useState(""),[qty,Q]=useState("1"),[cost,C]=useState("0"),[ref,R]=useState("");
 const [suppliers,SS]=useState<any[]>([]),[busy,B]=useState(false);
 useEffect(()=>{let active=true;(async()=>{if(!supabase)return;const {data,error}=await supabase.from("suppliers").select("id,name").eq("organization_id",org.id).order("name");if(!active)return;if(error)onMessage(databaseErrorMessage(error));else SS(data||[]);})();return()=>{active=false;};},[org.id,onMessage]);
 async function receive(e:React.FormEvent){e.preventDefault();if(!supabase)return;B(true);try{const {error}=await supabase.rpc("receive_purchase",{p_org_id:org.id,p_supplier_id:supplier||null,p_items:[{product_id:product,quantity:Number(qty),unit_cost:Number(cost)}],p_reference:ref||null});if(error)throw error;onMessage("Purchase received and stock updated.");onDone();}catch(error){onMessage(databaseErrorMessage(error));}finally{B(false);}}
 return <><ModuleHeader title="Purchases" description="Receive stock from a supplier. Stock balances update atomically."/><div className="form-panel"><h3>Receive purchase</h3><form className="stack-form" onSubmit={receive}><div className="form-grid"><label>Supplier<select value={supplier} onChange={e=>S(e.target.value)}><option value="">No supplier selected</option>{suppliers.map(s=><option value={s.id}>{s.name}</option>)}</select></label><label>Reference / invoice<input value={ref} onChange={e=>R(e.target.value)}/></label><label>Product<select required value={product} onChange={e=>P(e.target.value)}><option value="">Select product</option>{products.map((p:Product)=><option value={p.id}>{p.name}</option>)}</select></label><label>Quantity<input required type="number" min=".001" step=".001" value={qty} onChange={e=>Q(e.target.value)}/></label><label>Unit cost<input required type="number" min="0" step=".01" value={cost} onChange={e=>C(e.target.value)}/></label></div><button className="primary-btn" disabled={busy}>{busy?"Receiving…":"Receive stock"}</button></form></div></>;
}
function Expenses({org,onMessage}:any){
 const [rows,R]=useState<any[]>([]),[purchases,P]=useState<any[]>([]),[show,S]=useState(false),[loading,L]=useState(true),[error,E]=useState("");
 const [period,T]=useState<"today"|"yesterday"|"week"|"month"|"year"|"all"|"custom">("month"),[fromDate,FD]=useState(""),[toDate,TD]=useState("");
 const [f,F]=useState({title:"",category:"General",amount:"",notes:""});
 async function load(){
  if(!supabase)return;L(true);E("");
  try{
   const [expenseResult,purchaseResult]=await Promise.all([
    supabase.from("expenses").select("id,title,category,amount,notes,created_by,created_at").eq("organization_id",org.id).order("created_at",{ascending:false}),
    supabase.from("purchases").select("total,status,created_at").eq("organization_id",org.id).order("created_at",{ascending:false})
   ]);
   if(expenseResult.error)throw expenseResult.error;if(purchaseResult.error)throw purchaseResult.error;
   R(expenseResult.data||[]);P(purchaseResult.data||[]);
  }catch(cause){const detail=databaseErrorMessage(cause);E(detail);onMessage(`Expenses could not be loaded: ${detail}`);}
  finally{L(false);}
 }
 useEffect(()=>{void load();},[org.id]);
 const now=new Date(),todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 let rangeStart:Date|null=null,rangeEnd:Date|null=null;
 if(period==="today"){rangeStart=todayStart;rangeEnd=new Date(todayStart.getTime()+86400000);}
 if(period==="yesterday"){rangeEnd=todayStart;rangeStart=new Date(todayStart.getTime()-86400000);}
 if(period==="week"){const mondayOffset=(todayStart.getDay()+6)%7;rangeStart=new Date(todayStart.getTime()-mondayOffset*86400000);}
 if(period==="month")rangeStart=new Date(now.getFullYear(),now.getMonth(),1);
 if(period==="year")rangeStart=new Date(now.getFullYear(),0,1);
 if(period==="custom"){rangeStart=fromDate?new Date(`${fromDate}T00:00:00`):null;rangeEnd=toDate?new Date(new Date(`${toDate}T00:00:00`).getTime()+86400000):null;}
 const inRange=(value:string)=>{const date=new Date(value);return (!rangeStart||date>=rangeStart)&&(!rangeEnd||date<rangeEnd);};
 const filtered=rows.filter(row=>inRange(row.created_at));
 const filteredPurchases=purchases.filter(row=>row.status==="received"&&inRange(row.created_at));
 const expenseTotal=filtered.reduce((sum,row)=>sum+Number(row.amount),0);
 const purchaseTotal=filteredPurchases.reduce((sum,row)=>sum+Number(row.total),0);
 const categories=Object.entries(filtered.reduce((totals:Record<string,number>,row:any)=>{const category=row.category?.trim()||"General";totals[category]=(totals[category]||0)+Number(row.amount);return totals;},{})).sort((a,b)=>b[1]-a[1]);
 const periodLabel=({today:"Today",yesterday:"Yesterday",week:"This week",month:"This month",year:"This year",all:"All time",custom:"Selected dates"} as const)[period];
 async function save(e:React.FormEvent){
  e.preventDefault();if(!supabase)return;
  const {error}=await supabase.from("expenses").insert({organization_id:org.id,title:f.title,category:f.category,amount:Number(f.amount),notes:f.notes});
  if(error)onMessage(databaseErrorMessage(error));else{S(false);F({title:"",category:"General",amount:"",notes:""});await load();}
 }
 function exportCsv(){
  const values=[["Date","Category","Description","Notes","Amount"],...filtered.map(row=>[new Date(row.created_at).toLocaleString(),row.category||"General",row.title,row.notes||"",String(row.amount)])];
  const csv=values.map(line=>line.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download=`${org.name.replace(/[^a-z0-9-]/gi,"-")}-expenses.csv`;link.click();URL.revokeObjectURL(url);
 }
 const ranges:[typeof period,string][]=[["today","Today"],["yesterday","Yesterday"],["week","This week"],["month","This month"],["year","This year"],["all","All time"],["custom","Choose dates"]];
 return <div className="expense-page">
  <div className="expense-heading"><div><span className="eyebrow">{org.name.toUpperCase()} / FINANCE</span><h2>Expenses</h2><p>{periodLabel}</p></div><div className="expense-actions"><button className="secondary-btn" onClick={exportCsv} disabled={loading}><FileText size={15}/> CSV</button><button className="primary-btn" onClick={()=>S(true)}><Plus size={16}/> Add expense</button></div></div>
  <div className="expense-toolbar"><div className="expense-range">{ranges.map(([key,label])=><button type="button" className={period===key?"selected":""} onClick={()=>T(key)}>{label}</button>)}</div>{period==="custom"&&<div className="expense-custom-range"><label>From<input type="date" value={fromDate} onChange={e=>FD(e.target.value)}/></label><label>To<input type="date" value={toDate} onChange={e=>TD(e.target.value)}/></label></div>}</div>
  {error&&<div className="dashboard-error"><span>{error}</span><button onClick={()=>void load()}>Retry</button></div>}
  <div className="expense-summary">
   <div className="expense-stat expense-red"><Wallet/><div><strong>{loading?"—":money(expenseTotal,org.currency)}</strong><b>Operating expenses</b><small>Excludes stock purchases</small></div></div>
   <div className="expense-stat expense-navy"><Boxes/><div><strong>{loading?"—":money(purchaseTotal,org.currency)}</strong><b>Stock purchases</b><small>Received from Purchases</small></div></div>
   <div className="expense-stat expense-slate"><ClipboardList/><div><strong>{loading?"—":String(filtered.length)}</strong><b>Entries</b><small>{periodLabel}</small></div></div>
   <div className="expense-stat expense-blue"><BarChart3/><div><strong>{categories[0]?.[0]||"—"}</strong><b>Largest category</b><small>{categories[0]?money(categories[0][1],org.currency):"No expenses in this period"}</small></div></div>
  </div>
  <div className="expense-details">
   <section className="expense-category-panel"><h3>By category</h3>{!categories.length?<p className="expense-empty">{loading?"Loading expenses…":"No expenses in this period."}</p>:<div className="expense-category-list">{categories.map(([category,amount])=><div className="expense-category-row"><div><b>{category}</b><span>{money(amount,org.currency)}</span></div><div className="expense-category-track"><span style={{width:`${Math.max(4,amount/categories[0][1]*100)}%`}}/></div></div>)}</div>}</section>
   <section className="expense-table-panel"><div className="expense-table-title"><h3>Expense entries</h3><span>{filtered.length} records</span></div><div className="table-wrap"><table><thead><tr><th>DATE</th><th>CATEGORY</th><th>DESCRIPTION</th><th>BY</th><th>AMOUNT</th></tr></thead><tbody>{filtered.map(row=><tr><td>{new Date(row.created_at).toLocaleDateString()}</td><td>{row.category||"General"}</td><td>{row.title}</td><td>Business team</td><td><b>{money(Number(row.amount),org.currency)}</b></td></tr>)}{!filtered.length&&<tr><td colSpan={5} className="empty-cell">{loading?"Loading expenses…":error?"Expenses unavailable. Retry to try again.":"No expenses in this period."}</td></tr>}</tbody></table></div></section>
  </div>
  {show&&<Modal title="Record expense" close={()=>S(false)}><form className="stack-form" onSubmit={save}><label>Description<input required value={f.title} onChange={e=>F({...f,title:e.target.value})}/></label><label>Category<select value={f.category} onChange={e=>F({...f,category:e.target.value})}>{["General","Food & ingredients","Utilities","Rent","Transport","Supplies","Staff","Maintenance","Other"].map(category=><option key={category}>{category}</option>)}</select></label><label>Amount<input required type="number" min="0.01" step=".01" value={f.amount} onChange={e=>F({...f,amount:e.target.value})}/></label><label>Notes<input value={f.notes} onChange={e=>F({...f,notes:e.target.value})}/></label><div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>S(false)}>Cancel</button><button className="primary-btn">Save expense</button></div></form></Modal>}
 </div>;
}
function Tables({org,onMessage}:any){
 const [rows,R]=useState<any[]>([]),[name,N]=useState("");
 async function load(){const {data,error}=await supabase!.from("business_tables").select("*").eq("organization_id",org.id).order("name");if(error)onMessage(error.message);R(data||[]);}
 useEffect(()=>{load();},[org.id]);
 async function add(e:React.FormEvent){e.preventDefault();const {error}=await supabase!.from("business_tables").insert({organization_id:org.id,name,capacity:4});if(error)onMessage(error.message);else{N("");load();}}
 async function change(id:string,status:string){const {error}=await supabase!.from("business_tables").update({status}).eq("id",id).eq("organization_id",org.id);if(error)onMessage(error.message);else load();}
 return <><ModuleHeader title="Tables" description="Manage restaurant or bar table availability."/><form className="inline-form form-panel" onSubmit={add}><label>New table name<input required value={name} onChange={e=>N(e.target.value)} placeholder="e.g. Patio 01"/></label><button className="primary-btn"><Plus size={15}/> Add table</button></form><div className="table-grid">{rows.map(t=><div className="table-tile"><Table2/><b>{t.name}</b><span className={`status ${t.status==="available"?"active":"suspended"}`}>{t.status}</span><select value={t.status} onChange={e=>change(t.id,e.target.value)}><option value="available">Available</option><option value="occupied">Occupied</option><option value="reserved">Reserved</option><option value="inactive">Inactive</option></select></div>)}</div></>;
}
function Reports({org,onMessage}:any){
 const [sales,S]=useState<any[]>([]),[expenses,E]=useState<any[]>([]),[loading,L]=useState(true),[error,X]=useState("");
 useEffect(()=>{let active=true;(async()=>{L(true);X("");try{const [a,b]=await Promise.all([supabase!.from("sales").select("receipt_number,total,status,created_at").eq("organization_id",org.id).order("created_at",{ascending:false}).limit(500),supabase!.from("expenses").select("title,amount,created_at").eq("organization_id",org.id).order("created_at",{ascending:false}).limit(500)]);const failed=a.error||b.error;if(failed)throw failed;if(active){S(a.data||[]);E(b.data||[]);}}catch(cause){if(active){const detail=databaseErrorMessage(cause);X(detail);onMessage(`Reports could not be loaded: ${detail}`);}}finally{if(active)L(false);}})();return()=>{active=false;};},[org.id,onMessage]);
 const completed=sales.filter(x=>x.status==="completed"),revenue=completed.reduce((a,x)=>a+Number(x.total),0),out=expenses.reduce((a,x)=>a+Number(x.amount),0);
 return <>{error&&<div className="dashboard-error"><span>{error}</span><button onClick={()=>window.location.reload()}>Reload</button></div>}<div className="report-print"><BusinessPrintBrand org={org}/><ModuleHeader title="Business reports" description="Summary of the latest 500 sales and expenses for this business." action={<button className="secondary-btn" onClick={()=>window.print()}><Printer size={15}/> Print report</button>}/><div className="stat-grid"><Stat icon={<CircleDollarSign/>} label="Sales (latest 500)" value={loading||error?"—":money(revenue,org.currency)} hint={`${completed.length} completed sales`}/><Stat icon={<Wallet/>} label="Expenses (latest 500)" value={loading||error?"—":money(out,org.currency)} hint={`${expenses.length} recorded expenses`}/><Stat icon={<BarChart3/>} label="Net (latest 500)" value={loading||error?"—":money(revenue-out,org.currency)} hint="Sales less recorded expenses"/></div><ModuleHeader title="Recent sales" description="Latest 500 transactions."/><div className="table-wrap"><table><thead><tr><th>RECEIPT</th><th>DATE</th><th>STATUS</th><th>TOTAL</th></tr></thead><tbody>{sales.map(s=><tr><td>{s.receipt_number||"—"}</td><td>{new Date(s.created_at).toLocaleString()}</td><td>{s.status}</td><td>{money(Number(s.total),org.currency)}</td></tr>)}{!sales.length&&<tr><td colSpan={4} className="empty-cell">{loading?"Loading sales…":error?"Sales unavailable. Reload to try again.":"No sales yet."}</td></tr>}</tbody></table></div></div></>;
}
function Team({org,onMessage}:any){
 const [rows,R]=useState<any[]>([]);
 async function load(){const {data,error}=await supabase!.from("organization_users").select("id,user_id,role,is_active,created_at").eq("organization_id",org.id);if(error)onMessage(error.message);R(data||[]);}
 useEffect(()=>{load();},[org.id]);
 async function toggle(row:any){const {error}=await supabase!.from("organization_users").update({is_active:!row.is_active}).eq("id",row.id).eq("organization_id",org.id);if(error)onMessage(error.message);else load();}
 return <><ModuleHeader title="Team & access" description="Review the users attached to this business. Invite and role editing should be performed by a platform owner workflow."/><div className="table-wrap"><table><thead><tr><th>USER ID</th><th>ROLE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{rows.map(r=><tr><td>{r.user_id}</td><td>{r.role}</td><td>{r.is_active?"Active":"Disabled"}</td><td><button className="secondary-btn" onClick={()=>toggle(r)}>{r.is_active?"Disable":"Enable"}</button></td></tr>)}</tbody></table></div></>;
}
function Modal({title,close,children}:any){return <div className="modal-backdrop"><div className="modal-card small-modal"><div className="modal-header"><div><span className="eyebrow">RAREMEDIA POS</span><h2>{title}</h2></div><button className="icon-btn" onClick={close}><X/></button></div>{children}</div></div>}
export default App;
