import React, { useState, useEffect, useCallback, useRef } from "react";
const API_URL = import.meta.env.VITE_API_URL || "/api";
// ── Google Fonts ──────────────────────────────────────────────────────────────
if (typeof document !== "undefined") {
  const link = document.createElement("link");
  link.rel  = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap";
  document.head.appendChild(link);
}
// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:         "#09090b",
  surface:    "#101013",
  surfaceUp:  "#16161b",
  surfaceHi:  "#1d1d24",
  border:     "rgba(220,38,100,0.10)",
  borderMid:  "rgba(220,38,100,0.22)",
  accent:     "#dc2464",
  accentHov:  "#e8256e",
  accentDim:  "rgba(220,36,100,0.13)",
  accentGlow: "rgba(220,36,100,0.22)",
  text:       "#ede8ec",
  textSub:    "#9a7e8a",
  textDim:    "#4a3545",
  emerald:    "#10b981",
  emeraldDim: "rgba(16,185,129,0.13)",
  amber:      "#f59e0b",
  amberDim:   "rgba(245,158,11,0.13)",
  indigo:     "#818cf8",
  indigoDim:  "rgba(129,140,248,0.13)",
  red:        "#f87171",
};
const F = {
  display: "'Playfair Display', Georgia, serif",
  body:    "'DM Sans', system-ui, -apple-system, sans-serif",
};
// ── Global CSS ────────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{height:100%;-webkit-text-size-adjust:100%}
body{height:100%;font-family:${F.body};color:${C.text};background:${C.bg};-webkit-font-smoothing:antialiased;overscroll-behavior:none}
#root{height:100%;display:flex;flex-direction:column}
*{-webkit-tap-highlight-color:transparent}
input,select,textarea{font-size:16px!important}
::-webkit-scrollbar{width:3px;height:3px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(220,36,100,.22);border-radius:99px}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes shimmer{0%{background-position:-600px 0}100%{background-position:600px 0}}
@keyframes toastIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
@keyframes dropDown{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
.anim-up{animation:fadeUp .30s ease both}
.anim-in{animation:fadeIn .20s ease both}
.card{background:${C.surface};border:1px solid ${C.border};border-radius:14px;transition:border-color .20s,box-shadow .20s}
@media(hover:hover){.card:hover{border-color:${C.borderMid};box-shadow:0 8px 32px rgba(0,0,0,.3)}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;font-family:${F.body};font-weight:600;font-size:14px;letter-spacing:.02em;border-radius:12px;border:none;cursor:pointer;min-height:44px;padding:0 18px;transition:background .18s,box-shadow .18s,opacity .18s;user-select:none}
.btn:disabled{opacity:.45;pointer-events:none}
.btn-primary{background:${C.accent};color:#fff}
.btn-primary:active{opacity:.85}
@media(hover:hover){.btn-primary:hover:not(:disabled){background:${C.accentHov};box-shadow:0 4px 18px ${C.accentGlow}}}
.btn-ghost{background:transparent;border:1px solid ${C.border};color:${C.textSub};min-height:44px}
.btn-ghost:active{background:${C.accentDim}}
@media(hover:hover){.btn-ghost:hover:not(:disabled){border-color:${C.borderMid};color:${C.text};background:${C.accentDim}}}
.btn-danger{background:transparent;border:1px solid rgba(248,113,113,.2);color:${C.red}}
.btn-danger:active{background:rgba(248,113,113,.08)}
@media(hover:hover){.btn-danger:hover:not(:disabled){background:rgba(248,113,113,.08);border-color:rgba(248,113,113,.4)}}
.inp{background:${C.surfaceUp};border:1px solid ${C.border};border-radius:12px;color:${C.text};font-family:${F.body};font-size:16px;padding:12px 14px;width:100%;outline:none;transition:border-color .18s,box-shadow .18s;-webkit-appearance:none}
.inp::placeholder{color:${C.textDim}}
.inp:focus{border-color:rgba(220,36,100,.42);box-shadow:0 0 0 3px rgba(220,36,100,.07)}
.inp-password{padding-right:48px}
.sel{background:${C.surfaceUp};border:1px solid ${C.border};border-radius:12px;color:${C.textSub};font-family:${F.body};font-size:16px;padding:12px 14px;outline:none;width:100%;-webkit-appearance:none;appearance:none;cursor:pointer;transition:border-color .18s}
.sel:focus{border-color:rgba(220,36,100,.35)}
.skel{background:linear-gradient(90deg,${C.surfaceUp} 25%,${C.surfaceHi} 50%,${C.surfaceUp} 75%);background-size:600px 100%;animation:shimmer 1.4s infinite;border-radius:10px}
.spinner{width:17px;height:17px;border-radius:50%;flex-shrink:0;border:2px solid rgba(255,255,255,.15);border-top-color:#fff;animation:spin .65s linear infinite;display:inline-block}
.spinner-accent{border-color:rgba(220,36,100,.18);border-top-color:${C.accent}}
.badge{display:inline-flex;align-items:center;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:99px}
.cover-box{width:100%;aspect-ratio:3/4;border-radius:10px;overflow:hidden;background:${C.surfaceUp};position:relative}
.cover-box img{width:100%;height:100%;object-fit:cover;display:block}
.cover-empty{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:28px;color:${C.textDim};background:linear-gradient(135deg,${C.surfaceUp},${C.surface})}
/* Profile dropdown */
.profile-btn{display:flex;align-items:center;gap:7px;padding:6px 10px 6px 6px;background:${C.surfaceUp};border:1px solid ${C.border};border-radius:99px;cursor:pointer;transition:border-color .18s,background .18s;min-height:36px}
.profile-btn:hover{border-color:${C.borderMid};background:${C.surfaceHi}}
.dropdown{position:absolute;top:calc(100% + 8px);right:0;min-width:200px;background:${C.surfaceHi};border:1px solid ${C.borderMid};border-radius:14px;padding:6px;box-shadow:0 16px 48px rgba(0,0,0,.55);z-index:500;animation:dropDown .18s ease both}
.dropdown-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:9px;font-family:${F.body};font-size:14px;font-weight:500;cursor:pointer;border:none;background:transparent;width:100%;text-align:left;color:${C.textSub};transition:background .15s,color .15s;min-height:44px}
.dropdown-item:hover{background:${C.accentDim};color:${C.text}}
.dropdown-item.danger{color:${C.red}}
.dropdown-item.danger:hover{background:rgba(248,113,113,.08)}
.dropdown-sep{height:1px;background:${C.border};margin:4px 0}
/* Modal sheet */
.modal-bg{position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);display:flex;align-items:flex-end;animation:fadeIn .18s ease;padding-bottom:env(safe-area-inset-bottom,0)}
@media(min-width:640px){.modal-bg{align-items:center;padding:20px}.modal-box{border-radius:20px!important;max-width:660px!important;width:100%;margin:0 auto}}
.modal-box{background:${C.surface};border:1px solid ${C.border};border-radius:20px 20px 0 0;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 -8px 40px rgba(0,0,0,.5);animation:slideUp .26s cubic-bezier(.32,1,.56,1)}
.toast{animation:toastIn .28s cubic-bezier(.34,1.56,.64,1) both;border-radius:14px;font-family:${F.body};font-size:14px;font-weight:500;padding:12px 18px;backdrop-filter:blur(14px);box-shadow:0 6px 24px rgba(0,0,0,.4)}
/* Bottom nav */
.bottom-nav{display:flex;align-items:stretch;background:${C.surface};border-top:1px solid ${C.border};padding-bottom:env(safe-area-inset-bottom,0);flex-shrink:0}
.nav-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:none;background:transparent;cursor:pointer;padding:10px 4px;min-height:56px;font-family:${F.body};font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${C.textDim};transition:color .18s;position:relative}
.nav-tab.active{color:${C.accent}}
.nav-tab-icon{font-size:20px;line-height:1}
.nav-badge{position:absolute;top:8px;right:calc(50% - 14px);min-width:16px;height:16px;background:${C.accent};border-radius:99px;font-size:9px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid ${C.surface}}
/* Desktop sidebar */
.sidebar{flex-shrink:0;background:${C.surface};border-right:1px solid ${C.border};display:flex;flex-direction:column;padding:14px 8px;gap:3px;width:52px;overflow:hidden;transition:width .24s cubic-bezier(.4,0,.2,1)}
.sidebar:hover{width:178px}
.nav-btn{display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:10px;font-family:${F.body};font-size:14px;font-weight:500;color:${C.textSub};cursor:pointer;border:none;background:transparent;width:100%;text-align:left;white-space:nowrap;min-height:44px;transition:background .16s,color .16s;position:relative}
.nav-btn:hover{background:${C.accentDim};color:${C.text}}
.nav-btn.active{background:${C.accentDim};color:${C.accent};border:1px solid rgba(220,36,100,.18)}
/* Sub-tabs */
.sub-tabs{display:flex;background:${C.surfaceUp};border-radius:12px;padding:3px;gap:3px;margin-bottom:16px}
.sub-tab{flex:1;padding:9px 0;border-radius:9px;border:none;cursor:pointer;font-family:${F.body};font-size:14px;font-weight:500;transition:all .18s;background:transparent;color:${C.textSub};min-height:44px}
.sub-tab.active{background:${C.accent};color:#fff}
/* Settings */
.setting-row{display:flex;flex-direction:column;gap:6px;padding:16px 0;border-bottom:1px solid ${C.border}}
.setting-row:last-child{border-bottom:none}
.setting-label{font-size:12px;font-weight:600;color:${C.textSub};letter-spacing:.04em}
.setting-desc{font-size:11px;color:${C.textDim};line-height:1.5}
.setting-saved{font-size:11px;color:${C.emerald};animation:fadeIn .2s ease}
.tbl-row{border-bottom:1px solid rgba(220,36,100,.05);transition:background .14s}
.tbl-row:last-child{border-bottom:none}
.tbl-row:active{background:rgba(220,36,100,.04)}
@media(hover:hover){.tbl-row:hover{background:rgba(220,36,100,.04)}}
.clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.clamp1{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.desktop-sidebar{display:none!important}
.mobile-bottom-nav{display:flex!important}
@media(min-width:640px){.desktop-sidebar{display:flex!important}.mobile-bottom-nav{display:none!important}}
`;
function GlobalStyles() {
  useEffect(() => {
    const tag = document.createElement("style");
    tag.textContent = GLOBAL_CSS;
    document.head.appendChild(tag);
    let vm = document.querySelector('meta[name="viewport"]');
    if (!vm) { vm = document.createElement("meta"); vm.name = "viewport"; document.head.appendChild(vm); }
    vm.content = "width=device-width, initial-scale=1, viewport-fit=cover";
    return () => tag.remove();
  }, []);
  return null;
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function parseJwt(token) {
  try {
    const b = token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
    return JSON.parse(decodeURIComponent(atob(b).split("").map(c=>"%"+("00"+c.charCodeAt(0).toString(16)).slice(-2)).join("")));
  } catch { return null; }
}
function fmtSize(raw) {
  if (!raw) return "—";
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  if (n>=1e12) return (n/1e12).toFixed(2)+" TiB";
  if (n>=1e9)  return (n/1e9).toFixed(2)+" GiB";
  if (n>=1e6)  return (n/1e6).toFixed(1)+" MiB";
  return raw;
}
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); }
  catch { return iso; }
}
function fmtRelative(iso) {
  if (!iso) return null;
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch { return null; }
}
function ah(token) { return { Authorization:`Bearer ${token}`, "Content-Type":"application/json" }; }
// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts,setToasts] = useState([]);
  const addToast = useCallback((text,type="info",ms=3600)=>{
    const id=Date.now()+Math.random();
    setToasts(p=>[...p,{id,text,type}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),ms);
  },[]);
  return {toasts,addToast};
}
function Toasts({toasts}) {
  const map={
    success:{bg:"rgba(5,30,18,.96)",border:"rgba(16,185,129,.28)",color:"#6ee7b7"},
    error:  {bg:"rgba(30,5,12,.96)",border:"rgba(220,36,100,.28)",color:"#fca5a5"},
    info:   {bg:"rgba(12,12,16,.96)",border:"rgba(220,36,100,.12)",color:"#c4a0b0"},
  };
  return (
    <div style={{position:"fixed",bottom:"calc(64px + env(safe-area-inset-bottom,0px) + 8px)",left:0,right:0,zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",gap:8,pointerEvents:"none",padding:"0 16px"}}>
      {toasts.map(t=>{const s=map[t.type]||map.info;return(
        <div key={t.id} className="toast" style={{background:s.bg,border:`1px solid ${s.border}`,color:s.color,pointerEvents:"auto",maxWidth:480,width:"100%",textAlign:"center"}}>{t.text}</div>
      );})}
    </div>
  );
}
// ── Profile dropdown ──────────────────────────────────────────────────────────
function ProfileMenu({ username, onLogout, onSettings }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => { document.removeEventListener("mousedown", handle); document.removeEventListener("touchstart", handle); };
  }, [open]);
  return (
    <div ref={ref} style={{position:"relative",flexShrink:0}}>
      <button className="profile-btn" onClick={()=>setOpen(o=>!o)} aria-label="Profile menu">
        <div style={{width:26,height:26,borderRadius:"50%",background:C.accentDim,border:`1px solid rgba(220,36,100,.3)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:C.accent,flexShrink:0}}>
          {username?username[0].toUpperCase():"?"}
        </div>
        <span style={{fontSize:13,fontWeight:600,color:C.text,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{username}</span>
        <span style={{fontSize:10,color:C.textDim,transition:"transform .18s",transform:open?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
      </button>
      {open && (
        <div className="dropdown">
          <div style={{padding:"10px 12px 8px",borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
            <div style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:".08em"}}>Signed in as</div>
            <div style={{fontSize:15,fontWeight:600,color:C.text,marginTop:1}}>{username}</div>
          </div>
          <button className="dropdown-item" onClick={()=>{setOpen(false);onSettings();}}>
            <span style={{fontSize:16}}>⚙️</span> Settings
          </button>
          <div className="dropdown-sep"/>
          <button className="dropdown-item danger" onClick={()=>{setOpen(false);onLogout();}}>
            <span style={{fontSize:16}}>🚪</span> Log out
          </button>
        </div>
      )}
    </div>
  );
}
// ── Description modal ─────────────────────────────────────────────────────────
function DescModal({desc,title,onClose}) {
  if (!desc) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"center",padding:"10px 0 0"}}>
          <div style={{width:40,height:4,borderRadius:99,background:C.borderMid}}/>
        </div>
        <div style={{padding:"14px 20px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
          <div style={{fontFamily:F.display,fontSize:16,fontWeight:600,lineHeight:1.3,color:C.text}} className="clamp2">{title}</div>
          <button onClick={onClose} className="btn btn-ghost" style={{minHeight:40,width:40,padding:0,flexShrink:0,fontSize:20}}>×</button>
        </div>
        <div style={{padding:"16px 20px",overflowY:"auto",flex:1,fontSize:14,lineHeight:1.78,color:C.textSub,WebkitOverflowScrolling:"touch"}}
          dangerouslySetInnerHTML={{__html:desc}}/>
      </div>
    </div>
  );
}
// ── Book card ─────────────────────────────────────────────────────────────────
function BookCard({r,token,onAdd,onDescOpen,addingId}) {
  const proxyUrl = r.cover?`${API_URL}/api/proxy/cover?url=${encodeURIComponent(r.cover)}&token=${token}`:null;
  const busy = addingId===r.id;
  return (
    <div className="card" style={{display:"flex",flexDirection:"column"}}>
      <div style={{position:"relative"}}>
        <div className="cover-box">
          {proxyUrl?<img src={proxyUrl} alt={r.title} loading="lazy"/>:<div className="cover-empty">📖</div>}
        </div>
        <div style={{position:"absolute",top:7,left:7,display:"flex",flexDirection:"column",gap:3}}>
          {r.already_downloaded&&<span className="badge" style={{background:C.emeraldDim,color:C.emerald,border:"1px solid rgba(16,185,129,.22)"}}>✓ Got it</span>}
        </div>
      </div>
      <div style={{padding:"10px 11px 4px",flex:1,display:"flex",flexDirection:"column",gap:3}}>
        <div style={{fontFamily:F.display,fontSize:13,fontWeight:600,color:C.text,lineHeight:1.35}} className="clamp2">{r.title}</div>
        {r.author&&<div style={{fontSize:12,color:C.textSub}} className="clamp1">{r.author}</div>}
        {r.series&&<div style={{fontSize:11,color:C.textDim,fontStyle:"italic"}} className="clamp1">{r.series}</div>}
        <div style={{display:"flex",gap:6,fontSize:11,color:C.textDim,flexWrap:"wrap",marginTop:1}}>
          <span>{fmtSize(r.size)}</span>
          {r.seeders!=null&&<><span>·</span><span style={{color:r.seeders>4?C.emerald:C.textDim}}>{r.seeders}↑</span></>}
        </div>
        {r.description&&(
          <button onClick={()=>onDescOpen(r.description,r.title)} style={{textAlign:"left",background:"none",border:"none",cursor:"pointer",padding:"3px 0 0",minHeight:0}}>
            <span style={{fontSize:11,color:C.accent,fontWeight:600}}>Description →</span>
          </button>
        )}
      </div>
      <div style={{padding:"8px 11px 11px"}}>
        <button className="btn btn-primary" style={{width:"100%",fontSize:13,minHeight:42,
          ...(r.already_downloaded?{background:C.surfaceHi,color:C.textSub}:{})}}
          onClick={()=>onAdd(r.id,r.title)} disabled={busy}>
          {busy?<><span className="spinner"/>Sending…</>:r.already_downloaded?"Re-download":"↓ Add to qBittorrent"}
        </button>
      </div>
    </div>
  );
}
// ── SEARCH PAGE ───────────────────────────────────────────────────────────────
function SearchPage({token,addToast}) {
  const [q,setQ]           = useState("");
  const [field,setField]   = useState("title");
  const [results,setRes]   = useState([]);
  const [loading,setLoad]  = useState(false);
  const [addingId,setAdding] = useState(null);
  const [modal,setModal]   = useState(null);

  // Sort results by seeders descending on the client — no filter chips needed
  const sorted = [...results].sort((a,b)=>(b.seeders||0)-(a.seeders||0));

  async function doSearch(e) {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoad(true); setRes([]);
    try {
      const res = await fetch(
        `${API_URL}/api/search?q=${encodeURIComponent(q)}&field=${field}`,
        {headers:ah(token)}
      );
      if (!res.ok) { const d=await res.json().catch(()=>({})); addToast("❌ "+(d.detail||"Search failed"),"error"); return; }
      const data = await res.json();
      setRes(Array.isArray(data)?data:[]);
    } catch { addToast("⚠️ Network error","error"); }
    finally { setLoad(false); }
  }

  async function handleAdd(id,title) {
    setAdding(id);
    try {
      const res = await fetch(`${API_URL}/api/add`,{method:"POST",headers:ah(token),body:JSON.stringify({tid:id,title})});
      if (res.ok) { addToast(`✅ Added "${title}"`,"success"); setRes(p=>p.map(r=>r.id===id?{...r,already_downloaded:true}:r)); }
      else { const d=await res.json().catch(()=>({})); addToast("❌ "+(d.detail||"Failed"),"error"); }
    } catch { addToast("⚠️ Error","error"); }
    finally { setAdding(null); }
  }

  const dlCount = results.filter(r=>r.already_downloaded).length;

  return (
    <>
      {modal&&<DescModal desc={modal.d} title={modal.t} onClose={()=>setModal(null)}/>}
      <form onSubmit={doSearch} style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
        {/* Search bar */}
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:C.textDim,fontSize:16,pointerEvents:"none"}}>🔍</span>
          <input className="inp" style={{paddingLeft:44}} placeholder="Search audiobooks…" value={q} onChange={e=>setQ(e.target.value)}/>
        </div>
        {/* Field selector + Search button */}
        <div style={{display:"flex",gap:8}}>
          <select className="sel" style={{flex:1}} value={field} onChange={e=>setField(e.target.value)}>
            <option value="title">Title</option>
            <option value="author">Author</option>
            <option value="series">Series</option>
            <option value="narrator">Narrator</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{flexShrink:0,paddingLeft:20,paddingRight:20}}>
            {loading?<span className="spinner"/>:"Search"}
          </button>
        </div>
      </form>

      {/* Results meta */}
      {sorted.length>0&&(
        <div style={{display:"flex",gap:12,marginBottom:14,fontSize:12,color:C.textSub,flexWrap:"wrap",alignItems:"center"}}>
          <span>{sorted.length} result{sorted.length!==1?"s":""}</span>
          <span style={{color:C.textDim}}>· sorted by seeders</span>
          {dlCount>0&&<span style={{color:C.emerald}}>✓ {dlCount} already downloaded</span>}
        </div>
      )}

      {/* Grid */}
      {sorted.length>0&&(
        <div style={{display:"grid",gap:12,gridTemplateColumns:"repeat(2,1fr)"}}>
          {sorted.map((r,i)=>(
            <div key={r.id} className="anim-up" style={{animationDelay:`${Math.min(i*.04,.5)}s`}}>
              <BookCard r={r} token={token} onAdd={handleAdd}
                onDescOpen={(d,t)=>setModal({d,t})} addingId={addingId}/>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading&&sorted.length===0&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,paddingTop:60,gap:10,color:C.textDim,textAlign:"center"}}>
          <div style={{fontSize:52}}>📚</div>
          <div style={{fontFamily:F.display,fontSize:20,color:C.textSub}}>Find your next listen</div>
          <div style={{fontSize:13}}>Search by title, author, series or narrator</div>
        </div>
      )}
    </>
  );
}
// ── WATCHLIST PAGE ────────────────────────────────────────────────────────────
function WatchlistPage({token,addToast,onBadgeChange}) {
  const [tab,setTab]           = useState("watching"); // "browse" | "watching"
  const [olQuery,setOlQuery]   = useState("");
  const [olResults,setOlRes]   = useState([]);
  const [olLoading,setOlLoad]  = useState(false);
  const [watchlist,setWatchlist] = useState({items:[],found_count:0,watching_count:0,last_checked:null,poll_interval_hours:6});
  const [wlLoading,setWlLoad]  = useState(true);
  const [addingOl,setAddingOl] = useState(null);   // ol_key being added
  const [dlId,setDlId]         = useState(null);   // watchlist id being downloaded
  const [polling,setPolling]   = useState(false);
  const olTimer = useRef(null);

  // Load watchlist
  const loadWatchlist = useCallback(async()=>{
    setWlLoad(true);
    try {
      const res = await fetch(`${API_URL}/api/watchlist`,{headers:ah(token)});
      if (res.ok) {
        const d = await res.json();
        setWatchlist(d);
        onBadgeChange?.(d.found_count||0);
      }
    } catch { addToast("⚠️ Could not load watchlist","error"); }
    finally { setWlLoad(false); }
  },[token]);

  useEffect(()=>{ loadWatchlist(); },[loadWatchlist]);

  // OpenLibrary search — debounced 600ms
  useEffect(()=>{
    if (olTimer.current) clearTimeout(olTimer.current);
    if (!olQuery.trim() || olQuery.trim().length < 2) { setOlRes([]); return; }
    olTimer.current = setTimeout(async()=>{
      setOlLoad(true);
      try {
        const res = await fetch(`${API_URL}/api/openlibrary/search?q=${encodeURIComponent(olQuery)}`,{headers:ah(token)});
        if (res.ok) setOlRes(await res.json());
      } catch { addToast("⚠️ OpenLibrary unavailable","error"); }
      finally { setOlLoad(false); }
    }, 600);
    return ()=>clearTimeout(olTimer.current);
  },[olQuery,token]);

  // Add to watchlist from OpenLibrary result
  async function handleAddToWatch(book) {
    setAddingOl(book.ol_key);
    try {
      const res = await fetch(`${API_URL}/api/watchlist`,{
        method:"POST", headers:ah(token),
        body:JSON.stringify({
          ol_key: book.ol_key,
          title:  book.title,
          author: book.author||null,
          ol_cover_url: book.ol_cover_url||null,
          first_publish_year: book.first_publish_year||null,
          series: book.series||null,
        }),
      });
      if (res.ok) {
        addToast(`👁 Watching for "${book.title}"`,"success");
        await loadWatchlist();
      } else if (res.status===409) {
        addToast("Already in watchlist","info");
      } else {
        const d = await res.json().catch(()=>({}));
        addToast("❌ "+(d.detail||"Failed"),"error");
      }
    } catch { addToast("⚠️ Error","error"); }
    finally { setAddingOl(null); }
  }

  // Remove from watchlist
  async function handleRemove(id,title) {
    try {
      const res = await fetch(`${API_URL}/api/watchlist/${id}`,{method:"DELETE",headers:ah(token)});
      if (res.ok) { addToast(`Removed "${title}"`,"info"); await loadWatchlist(); }
    } catch { addToast("⚠️ Error","error"); }
  }

  // Download a found entry
  async function handleDownload(entry) {
    setDlId(entry.id);
    try {
      const res = await fetch(`${API_URL}/api/watchlist/${entry.id}/download`,{method:"POST",headers:ah(token)});
      if (res.ok) { addToast(`✅ Added "${entry.mam_title||entry.title}"`,"success"); await loadWatchlist(); }
      else { const d=await res.json().catch(()=>({})); addToast("❌ "+(d.detail||"Failed"),"error"); }
    } catch { addToast("⚠️ Error","error"); }
    finally { setDlId(null); }
  }

  // Manual poll
  async function handlePoll() {
    setPolling(true);
    try {
      const res = await fetch(`${API_URL}/api/watchlist/poll`,{method:"POST",headers:ah(token)});
      if (res.ok) { addToast("✅ Poll complete — checking for updates…","success"); await loadWatchlist(); }
      else { const d=await res.json().catch(()=>({})); addToast("❌ "+(d.detail||"Poll failed"),"error"); }
    } catch { addToast("⚠️ Error","error"); }
    finally { setPolling(false); }
  }

  // Which ol_keys are already in the watchlist
  const watchedKeys = new Set((watchlist.items||[]).map(i=>i.ol_key));

  const found    = (watchlist.items||[]).filter(i=>i.mam_found);
  const watching = (watchlist.items||[]).filter(i=>!i.mam_found);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:0}}>
      {/* Header */}
      <div style={{marginBottom:16}}>
        <div style={{fontFamily:F.display,fontSize:22,fontWeight:600,color:C.text}}>Watchlist</div>
        <div style={{fontSize:12,color:C.textSub,marginTop:3}}>
          {watchlist.watching_count} watching · {watchlist.found_count} found on MAM
          {watchlist.last_checked&&<span style={{color:C.textDim}}> · checked {fmtRelative(watchlist.last_checked)}</span>}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="sub-tabs">
        <button className={`sub-tab${tab==="browse"?" active":""}`} onClick={()=>setTab("browse")}>Browse books</button>
        <button className={`sub-tab${tab==="watching"?" active":""}`} onClick={()=>setTab("watching")}>
          Watching {watchlist.found_count>0&&`· ${watchlist.found_count} found`}
        </button>
      </div>

      {/* ── BROWSE TAB ── */}
      {tab==="browse"&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:C.textDim,fontSize:16,pointerEvents:"none"}}>🔍</span>
            <input className="inp" style={{paddingLeft:44}} placeholder="Search any book to watch for…"
              value={olQuery} onChange={e=>setOlQuery(e.target.value)}/>
            {olLoading&&<span className="spinner spinner-accent" style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",width:16,height:16}}/>}
          </div>

          {!olQuery&&(
            <div style={{textAlign:"center",paddingTop:40,color:C.textDim}}>
              <div style={{fontSize:40,marginBottom:10}}>🔎</div>
              <div style={{fontFamily:F.display,fontSize:17,color:C.textSub,marginBottom:6}}>Search any book</div>
              <div style={{fontSize:13,lineHeight:1.6}}>Results come from OpenLibrary.<br/>Tap + to watch for it on MAM.</div>
            </div>
          )}

          {olResults.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{fontSize:11,color:C.textDim,paddingLeft:2}}>{olResults.length} results from OpenLibrary</div>
              {olResults.map(book=>{
                const alreadyWatched = watchedKeys.has(book.ol_key);
                const isAdding = addingOl===book.ol_key;
                return (
                  <div key={book.ol_key} className="card" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px"}}>
                    {/* Cover */}
                    <div style={{width:44,height:60,borderRadius:6,overflow:"hidden",background:C.surfaceUp,flexShrink:0}}>
                      {book.ol_cover_url
                        ?<img src={book.ol_cover_url} alt={book.title} style={{width:"100%",height:"100%",objectFit:"cover"}} loading="lazy"/>
                        :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.textDim}}>📖</div>
                      }
                    </div>
                    {/* Info */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:F.display,fontSize:14,fontWeight:600,color:C.text,lineHeight:1.3}} className="clamp2">{book.title}</div>
                      {book.author&&<div style={{fontSize:12,color:C.textSub,marginTop:2}} className="clamp1">{book.author}</div>}
                      <div style={{fontSize:11,color:C.textDim,marginTop:2}}>
                        {[book.first_publish_year,book.series].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {/* Add button */}
                    <button
                      onClick={()=>!alreadyWatched&&handleAddToWatch(book)}
                      disabled={alreadyWatched||isAdding}
                      style={{
                        width:36,height:36,borderRadius:10,border:"none",flexShrink:0,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        cursor:alreadyWatched?"default":"pointer",fontSize:18,fontWeight:300,
                        background:alreadyWatched?C.emeraldDim:C.accentDim,
                        color:alreadyWatched?C.emerald:C.accent,
                        border:`1px solid ${alreadyWatched?"rgba(16,185,129,.3)":C.borderMid}`,
                        transition:"all .18s",
                      }}>
                      {isAdding?<span className="spinner spinner-accent" style={{width:14,height:14}}/>:alreadyWatched?"✓":"+"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── WATCHING TAB ── */}
      {tab==="watching"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* Poll controls */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
            background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 14px"}}>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:C.textSub}}>Auto-poll every {watchlist.poll_interval_hours}h</div>
              <div style={{fontSize:11,color:C.textDim,marginTop:1}}>
                {watchlist.last_checked?"Last checked "+fmtRelative(watchlist.last_checked):"Not checked yet"}
              </div>
            </div>
            <button className="btn btn-ghost" onClick={handlePoll} disabled={polling}
              style={{minHeight:38,padding:"0 14px",fontSize:12,flexShrink:0}}>
              {polling?<><span className="spinner spinner-accent" style={{width:14,height:14}}/>Checking…</>:"Check now"}
            </button>
          </div>

          {wlLoading&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[...Array(3)].map((_,i)=><div key={i} className="skel" style={{height:72}}/>)}
            </div>
          )}

          {!wlLoading&&watchlist.items?.length===0&&(
            <div style={{textAlign:"center",paddingTop:40,color:C.textDim}}>
              <div style={{fontSize:40,marginBottom:10}}>👁</div>
              <div style={{fontFamily:F.display,fontSize:17,color:C.textSub,marginBottom:6}}>Nothing being watched</div>
              <div style={{fontSize:13}}>Switch to Browse to add books to watch for</div>
            </div>
          )}

          {/* Found section */}
          {found.length>0&&(
            <>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:C.emerald}}>
                Found on MAM — ready to download
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {found.map(entry=>(
                  <div key={entry.id} className="card" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",
                    border:`1px solid rgba(16,185,129,.2)`,background:"rgba(16,185,129,.04)"}}>
                    <div style={{width:44,height:60,borderRadius:6,overflow:"hidden",background:C.surfaceUp,flexShrink:0}}>
                      {entry.ol_cover_url
                        ?<img src={entry.ol_cover_url} alt={entry.title} style={{width:"100%",height:"100%",objectFit:"cover"}} loading="lazy"/>
                        :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.textDim}}>📖</div>
                      }
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:F.display,fontSize:14,fontWeight:600,color:C.text}} className="clamp1">{entry.title}</div>
                      {entry.author&&<div style={{fontSize:12,color:C.textSub,marginTop:2}} className="clamp1">{entry.author}</div>}
                      <div style={{fontSize:11,color:C.emerald,marginTop:3}}>✓ Found as: {entry.mam_title||entry.title}</div>
                    </div>
                    <button className="btn btn-primary" style={{minHeight:38,padding:"0 14px",fontSize:12,flexShrink:0}}
                      onClick={()=>handleDownload(entry)} disabled={dlId===entry.id}>
                      {dlId===entry.id?<span className="spinner" style={{width:14,height:14}}/>:"↓ Get"}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Still watching section */}
          {watching.length>0&&(
            <>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:C.textDim,marginTop:found.length>0?4:0}}>
                Watching — not on MAM yet
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {watching.map(entry=>(
                  <div key={entry.id} className="card" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px"}}>
                    <div style={{width:44,height:60,borderRadius:6,overflow:"hidden",background:C.surfaceUp,flexShrink:0}}>
                      {entry.ol_cover_url
                        ?<img src={entry.ol_cover_url} alt={entry.title} style={{width:"100%",height:"100%",objectFit:"cover"}} loading="lazy"/>
                        :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.textDim}}>📖</div>
                      }
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:F.display,fontSize:14,fontWeight:600,color:C.text}} className="clamp1">{entry.title}</div>
                      {entry.author&&<div style={{fontSize:12,color:C.textSub,marginTop:2}} className="clamp1">{entry.author}</div>}
                      <div style={{fontSize:11,color:C.textDim,marginTop:3}}>
                        👁 Watching{entry.last_checked?" · checked "+fmtRelative(entry.last_checked):""}
                      </div>
                    </div>
                    <button onClick={()=>handleRemove(entry.id,entry.title)}
                      style={{width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",
                        background:"none",border:`1px solid ${C.border}`,borderRadius:9,
                        color:C.textDim,fontSize:18,cursor:"pointer",flexShrink:0}}>×</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
// ── HISTORY PAGE ──────────────────────────────────────────────────────────────
function HistoryPage({token,addToast}) {
  const [items,setItems]=useState([]); const [total,setTotal]=useState(0);
  const [loading,setLoad]=useState(true); const [filter,setFilter]=useState("");
  const load=useCallback(async()=>{
    setLoad(true);
    try{const res=await fetch(`${API_URL}/api/history?limit=200`,{headers:ah(token)});
      if(res.ok){const d=await res.json();setItems(d.items||[]);setTotal(d.total||0);}}
    catch{addToast("⚠️ Could not load history","error");}
    finally{setLoad(false);}
  },[token]);
  useEffect(()=>{load();},[load]);
  async function del(id,title){
    if(!confirm(`Remove "${title}" from history?`)) return;
    try{const res=await fetch(`${API_URL}/api/history/${id}`,{method:"DELETE",headers:ah(token)});
      if(res.ok){addToast("Removed","info");setItems(p=>p.filter(i=>i.id!==id));setTotal(p=>p-1);}}
    catch{addToast("⚠️ Error","error");}
  }
  const filtered=filter?items.filter(i=>(i.title+" "+i.author).toLowerCase().includes(filter.toLowerCase())):items;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div><div style={{fontFamily:F.display,fontSize:22,fontWeight:600,color:C.text}}>History</div>
        <div style={{fontSize:12,color:C.textSub,marginTop:3}}>{total} download{total!==1?"s":""}</div></div>
      <input className="inp" placeholder="Filter by title or author…" value={filter} onChange={e=>setFilter(e.target.value)}/>
      {loading&&<div style={{display:"flex",flexDirection:"column",gap:8}}>{[...Array(4)].map((_,i)=><div key={i} className="skel" style={{height:64}}/>)}</div>}
      {!loading&&filtered.length===0&&(
        <div style={{textAlign:"center",paddingTop:50,color:C.textDim}}>
          <div style={{fontSize:40,marginBottom:10}}>📋</div>
          <div style={{fontFamily:F.display,fontSize:17,color:C.textSub,marginBottom:6}}>{filter?"No matches":"No downloads yet"}</div>
          {!filter&&<div style={{fontSize:13}}>Books you add will appear here</div>}
        </div>
      )}
      {!loading&&filtered.length>0&&(
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
          {filtered.map(item=>(
            <div key={item.id} className="tbl-row" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px"}}>
              {item.cover_url
                ?<img src={item.cover_url} alt="" style={{width:36,height:48,objectFit:"cover",borderRadius:6,flexShrink:0}}/>
                :<div style={{width:36,height:48,background:C.surfaceUp,borderRadius:6,flexShrink:0}}/>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:500,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title||"—"}</div>
                <div style={{fontSize:12,color:C.textSub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.author||""}</div>
                <div style={{fontSize:11,color:C.textDim,marginTop:1}}>{fmtDate(item.added_at)} · {fmtSize(item.size)}</div>
              </div>
              <button onClick={()=>del(item.id,item.title)}
                style={{background:"none",border:"none",color:C.textDim,fontSize:22,cursor:"pointer",width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,borderRadius:8}}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// ── DEBUG PANEL ───────────────────────────────────────────────────────────────
function DebugPanel({token, addToast}) {
  const [cookieInfo, setCookieInfo] = useState(null);
  const [statsTest,  setStatsTest]  = useState(null);
  const [loading,    setLoading]    = useState({cookie:false, stats:false});
  const [open,       setOpen]       = useState(true);
  async function testCookie() {
    setLoading(p=>({...p,cookie:true})); setCookieInfo(null);
    try {
      const res = await fetch(`${API_URL}/api/debug/cookie`, {headers:ah(token)});
      if (res.ok) setCookieInfo(await res.json());
      else addToast("❌ Debug request failed","error");
    } catch { addToast("⚠️ Network error","error"); }
    finally { setLoading(p=>({...p,cookie:false})); }
  }
  async function testStats() {
    setLoading(p=>({...p,stats:true})); setStatsTest(null);
    try {
      const res = await fetch(`${API_URL}/api/debug/stats-test`, {headers:ah(token)});
      if (res.ok) setStatsTest(await res.json());
      else addToast("❌ Debug request failed","error");
    } catch { addToast("⚠️ Network error","error"); }
    finally { setLoading(p=>({...p,stats:false})); }
  }
  const pre = (obj) => JSON.stringify(obj, null, 2);
  const codeStyle = {background:C.surfaceHi,borderRadius:10,padding:"12px 14px",fontSize:12,
    color:C.textSub,overflowX:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all",
    border:`1px solid ${C.border}`,fontFamily:"monospace",lineHeight:1.6,marginTop:8};
  return (
    <div style={{marginTop:4}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",
          background:C.surfaceUp,border:`1px solid ${C.border}`,borderRadius:12,
          cursor:"pointer",padding:"12px 14px",fontFamily:F.body}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>🔧</span>
          <div style={{textAlign:"left"}}>
            <div style={{fontSize:13,fontWeight:600,color:C.text}}>Diagnostics</div>
            <div style={{fontSize:11,color:C.textDim,marginTop:1}}>Test cookie &amp; stats connection</div>
          </div>
        </div>
        <span style={{fontSize:14,color:C.textDim,transition:"transform .18s",transform:open?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
      </button>
      {open&&(
        <div style={{display:"flex",flexDirection:"column",gap:16,marginTop:12}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,gap:10}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:C.text}}>Cookie Check</div>
                <div style={{fontSize:11,color:C.textDim,marginTop:2}}>Verify the backend is using the correct cookie value</div>
              </div>
              <button className="btn btn-ghost" onClick={testCookie} disabled={loading.cookie}
                style={{minHeight:38,padding:"0 14px",fontSize:12,flexShrink:0}}>
                {loading.cookie?<><span className="spinner spinner-accent" style={{width:14,height:14}}/>Checking…</>:"Run"}
              </button>
            </div>
            {cookieInfo&&(
              cookieInfo.status==="empty"
                ? <div style={{...codeStyle,color:C.amber}}>⚠️ {cookieInfo.hint}</div>
                : <div style={codeStyle}>{`Status:         ${cookieInfo.status}\nCookie length:  ${cookieInfo.cookie_length} chars\nCookie preview: ${cookieInfo.cookie_preview}\nHeader sent:    ${cookieInfo.header_built}\nHeader length:  ${cookieInfo.header_length} chars`}</div>
            )}
          </div>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,gap:10}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:C.text}}>Stats Fetch Test</div>
                <div style={{fontSize:11,color:C.textDim,marginTop:2}}>See exactly what MAM returns — takes ~5 seconds</div>
              </div>
              <button className="btn btn-ghost" onClick={testStats} disabled={loading.stats}
                style={{minHeight:38,padding:"0 14px",fontSize:12,flexShrink:0}}>
                {loading.stats?<><span className="spinner spinner-accent" style={{width:14,height:14}}/>Testing…</>:"Run"}
              </button>
            </div>
            {statsTest&&(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div>
                  <div style={{fontSize:11,fontWeight:600,color:C.textSub,marginBottom:4,textTransform:"uppercase",letterSpacing:".06em"}}>
                    jsonLoad.php — status {statsTest.jsonload?.status_code??'—'}
                    {statsTest.jsonload?.username?<span style={{color:C.emerald,marginLeft:8}}>✓ Working!</span>
                      :statsTest.jsonload?.redirected_to_login?<span style={{color:C.amber,marginLeft:8}}>⚠️ Cookie expired</span>:null}
                  </div>
                  {statsTest.jsonload?.username
                    ?<div style={{...codeStyle,color:C.emerald}}>{`✓ Username:  ${statsTest.jsonload.username}\n  Uploaded:  ${statsTest.jsonload.uploaded}\n  Downloaded:${statsTest.jsonload.downloaded}\n  Ratio:     ${statsTest.jsonload.ratio}`}</div>
                    :<div style={codeStyle}>{statsTest.jsonload?.body_preview||pre(statsTest.jsonload)}</div>}
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:600,color:C.textSub,marginBottom:4,textTransform:"uppercase",letterSpacing:".06em"}}>
                    usercp.php — status {statsTest.usercp?.status_code??'—'}
                    {statsTest.usercp?.redirected_to_login&&<span style={{color:C.amber,marginLeft:8}}>⚠️ Also redirected</span>}
                  </div>
                  <div style={codeStyle}>{statsTest.usercp?.body_preview||pre(statsTest.usercp)}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
// ── SETTINGS PAGE ─────────────────────────────────────────────────────────────
const SETTING_META = {
  MAM_COOKIE:            { label:"MAM Cookie",            desc:"Paste just the cookie value from MyAnonamouse — do NOT include 'mam_id=', just the long string after it.",      type:"password", placeholder:"fNm_I4_aV04LL_Xd… (just the value, no mam_id= prefix)" },
  MAM_BASE:              { label:"MAM Base URL",           desc:"The MAM site URL. Only change this if the domain changes.",                                     type:"text",     placeholder:"https://www.myanonamouse.net" },
  QBITTORRENT_URL:       { label:"qBittorrent URL",        desc:"URL to your qBittorrent Web UI, including port.",                                              type:"text",     placeholder:"http://qbittorrent:8080" },
  QBITTORRENT_USER:      { label:"qBittorrent Username",   desc:"Username for the qBittorrent Web UI.",                                                          type:"text",     placeholder:"admin" },
  QBITTORRENT_PASS:      { label:"qBittorrent Password",   desc:"Password for the qBittorrent Web UI.",                                                          type:"password", placeholder:"••••••••" },
  QBITTORRENT_SAVEPATH:  { label:"Save Path",              desc:"Where qBittorrent saves downloaded audiobooks on disk.",                                         type:"text",     placeholder:"/media/audiobooks" },
  INVITE_CODE:           { label:"Invite Code",            desc:"Code required for new users to register.",                                                       type:"text",     placeholder:"my-secret-code" },
  DISCORD_WEBHOOK:       { label:"Discord Webhook URL",    desc:"Optional. Paste a Discord webhook URL to get notifications when torrents are added or watchlist matches are found.",    type:"password", placeholder:"https://discord.com/api/webhooks/…" },
  BP_THRESHOLD:          { label:"BP Auto-spend Threshold",desc:"Bonus points threshold for automatic spending. Set to 0 to disable.",                           type:"text",     placeholder:"1000" },
  BP_PRODUCT_ID:         { label:"BP Product ID",          desc:"The MAM store product ID to auto-purchase when BP threshold is reached.",                       type:"text",     placeholder:"2" },
  WATCHLIST_POLL_HOURS:  { label:"Watchlist Poll Interval",desc:"How often (in hours) the backend checks MAM for watchlist matches.",                            type:"text",     placeholder:"6" },
};
function SettingsPage({token,addToast}) {
  const [settings,setSettings] = useState([]);
  const [loading,setLoad]      = useState(true);
  const [values,setValues]     = useState({});
  const [saving,setSaving]     = useState({});
  const [saved,setSaved]       = useState({});
  const [revealed,setRevealed] = useState({});
  useEffect(()=>{
    (async()=>{
      setLoad(true);
      try{
        const res=await fetch(`${API_URL}/api/settings`,{headers:ah(token)});
        if(res.ok){
          const data=await res.json();
          setSettings(data);
          const init={};
          data.forEach(s=>{ init[s.key]=s.masked?"":s.value; });
          setValues(init);
        }
      }catch{addToast("⚠️ Could not load settings","error");}
      finally{setLoad(false);}
    })();
  },[token]);
  async function saveSetting(key){
    const val=values[key];
    if(val===undefined||val==="") { addToast("Enter a value first","info"); return; }
    setSaving(p=>({...p,[key]:true}));
    try{
      const res=await fetch(`${API_URL}/api/settings`,{method:"POST",headers:ah(token),body:JSON.stringify({key,value:val})});
      if(res.ok){
        addToast(`✅ ${SETTING_META[key]?.label||key} saved`,"success");
        setSaved(p=>({...p,[key]:true}));
        setTimeout(()=>setSaved(p=>({...p,[key]:false})),3000);
        setSettings(p=>p.map(s=>s.key===key?{...s,masked:SETTING_META[key]?.type==="password"&&!!val,value:SETTING_META[key]?.type==="password"?"••••••••":val}:s));
        if(SETTING_META[key]?.type==="password") setValues(p=>({...p,[key]:""}));
      } else {
        const d=await res.json().catch(()=>({})); addToast("❌ "+(d.detail||"Save failed"),"error");
      }
    }catch{addToast("⚠️ Error saving","error");}
    finally{setSaving(p=>({...p,[key]:false}));}
  }
  if(loading) return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {[...Array(5)].map((_,i)=><div key={i} className="skel" style={{height:80}}/>)}
    </div>
  );
  return (
    <div style={{display:"flex",flexDirection:"column",gap:0,maxWidth:640}}>
      <div style={{marginBottom:24}}>
        <div style={{fontFamily:F.display,fontSize:22,fontWeight:600,color:C.text}}>Settings</div>
        <div style={{fontSize:13,color:C.textSub,marginTop:4,lineHeight:1.5}}>Changes take effect immediately — no Docker rebuild required.</div>
      </div>
      <div style={{marginBottom:20}}><DebugPanel token={token} addToast={addToast}/></div>
      {[
        {label:"MyAnonamouse",keys:["MAM_COOKIE","MAM_BASE"]},
        {label:"qBittorrent",keys:["QBITTORRENT_URL","QBITTORRENT_USER","QBITTORRENT_PASS","QBITTORRENT_SAVEPATH"]},
        {label:"App",keys:["INVITE_CODE","DISCORD_WEBHOOK","BP_THRESHOLD","BP_PRODUCT_ID","WATCHLIST_POLL_HOURS"]},
      ].map(group=>(
        <div key={group.label} style={{marginBottom:20}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:C.textDim,marginBottom:8,paddingLeft:2}}>{group.label}</div>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"0 16px"}}>
            {group.keys.map(key=>(
              <SettingRow key={key} k={key} settings={settings} values={values} setValues={setValues}
                saving={saving} saved={saved} revealed={revealed} setRevealed={setRevealed} onSave={saveSetting}/>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
function SettingRow({k,settings,values,setValues,saving,saved,revealed,setRevealed,onSave}) {
  const meta  = SETTING_META[k] || {label:k,desc:"",type:"text",placeholder:""};
  const s     = settings.find(x=>x.key===k)||{};
  const isPass= meta.type==="password";
  const show  = revealed[k];
  return (
    <div className="setting-row">
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:0}}>
          <div className="setting-label">{meta.label}</div>
          {meta.desc&&<div className="setting-desc" style={{marginTop:3}}>{meta.desc}</div>}
          {s.masked&&<div style={{fontSize:11,color:C.textDim,marginTop:3,fontStyle:"italic"}}>Current value hidden — enter new value to change</div>}
          {saved[k]&&<div className="setting-saved" style={{marginTop:3}}>✓ Saved</div>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginTop:6}}>
        <div style={{flex:1,position:"relative"}}>
          <input className={`inp${isPass?" inp-password":""}`}
            type={isPass&&!show?"password":"text"}
            placeholder={s.masked?"Enter new value to change…":meta.placeholder}
            value={values[k]||""}
            onChange={e=>setValues(p=>({...p,[k]:e.target.value}))}
            autoCapitalize="off" autoCorrect="off" spellCheck="false"/>
          {isPass&&(
            <button onClick={()=>setRevealed(p=>({...p,[k]:!p[k]}))}
              style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.textSub,cursor:"pointer",fontSize:16,padding:4,lineHeight:1}}>
              {show?"🙈":"👁"}
            </button>
          )}
        </div>
        <button className="btn btn-primary" onClick={()=>onSave(k)} disabled={saving[k]||!values[k]}
          style={{flexShrink:0,minHeight:44,padding:"0 18px",fontSize:13}}>
          {saving[k]?<span className="spinner"/>:"Save"}
        </button>
      </div>
    </div>
  );
}
// ── AUTH PAGE ─────────────────────────────────────────────────────────────────
function AuthPage({onLogin,addToast}) {
  const [tab,setTab]=useState("login");
  const [lf,setLf]=useState({username:"",password:""});
  const [sf,setSf]=useState({username:"",password:"",invite_code:""});
  const [busy,setBusy]=useState(false);
  async function doLogin(e){
    e.preventDefault(); setBusy(true);
    try{
      const fd=new URLSearchParams({username:lf.username,password:lf.password});
      const res=await fetch(`${API_URL}/api/login`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:fd});
      const d=await res.json().catch(()=>({}));
      if(!res.ok){addToast("❌ "+(d.detail||"Invalid login"),"error");return;}
      onLogin(d.access_token); addToast("✅ Welcome back!","success");
    }catch{addToast("⚠️ Error","error");}
    finally{setBusy(false);}
  }
  async function doSignup(e){
    e.preventDefault(); setBusy(true);
    try{
      const res=await fetch(`${API_URL}/api/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(sf)});
      const d=await res.json().catch(()=>({}));
      if(!res.ok){addToast("❌ "+(d.detail||"Failed"),"error");return;}
      onLogin(d.access_token); addToast("✅ Account created!","success");
    }catch{addToast("⚠️ Error","error");}
    finally{setBusy(false);}
  }
  return (
    <div style={{minHeight:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:"20px 20px calc(20px + env(safe-area-inset-bottom,0px))",
      background:`radial-gradient(ellipse 70% 40% at 50% 0%, rgba(220,36,100,.07) 0%, transparent 60%), ${C.bg}`}}>
      <div className="anim-up" style={{width:"100%",maxWidth:400}}>
        <div style={{borderRadius:14,overflow:"hidden",marginBottom:20,border:`1px solid ${C.border}`,boxShadow:"0 20px 50px rgba(0,0,0,.55)"}}>
          <img src="/image.png" alt="MAM" style={{width:"100%",height:110,objectFit:"cover",display:"block"}}/>
        </div>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:18,padding:"24px 22px 20px",boxShadow:"0 24px 70px rgba(0,0,0,.45)"}}>
          <div style={{display:"flex",background:C.surfaceUp,borderRadius:12,padding:3,gap:3,marginBottom:22}}>
            {[["login","Log In"],["signup","Sign Up"]].map(([t,label])=>(
              <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"10px 0",borderRadius:10,border:"none",cursor:"pointer",fontFamily:F.body,fontWeight:600,fontSize:14,transition:"all .18s",background:tab===t?C.accent:"transparent",color:tab===t?"#fff":C.textSub,minHeight:44}}>
                {label}
              </button>
            ))}
          </div>
          {tab==="login"&&(
            <form onSubmit={doLogin} style={{display:"flex",flexDirection:"column",gap:12}}>
              <input className="inp" placeholder="Username" value={lf.username} onChange={e=>setLf({...lf,username:e.target.value})} autoCapitalize="off" autoCorrect="off" spellCheck="false"/>
              <input className="inp" type="password" placeholder="Password" value={lf.password} onChange={e=>setLf({...lf,password:e.target.value})}/>
              <button type="submit" className="btn btn-primary" disabled={busy} style={{width:"100%",marginTop:4,fontSize:15}}>
                {busy?<><span className="spinner"/>Logging in…</>:"Log In"}
              </button>
            </form>
          )}
          {tab==="signup"&&(
            <form onSubmit={doSignup} style={{display:"flex",flexDirection:"column",gap:12}}>
              <input className="inp" placeholder="Username" value={sf.username} onChange={e=>setSf({...sf,username:e.target.value})} autoCapitalize="off" autoCorrect="off" spellCheck="false"/>
              <input className="inp" type="password" placeholder="Password" value={sf.password} onChange={e=>setSf({...sf,password:e.target.value})}/>
              <input className="inp" placeholder="Invite code" value={sf.invite_code} onChange={e=>setSf({...sf,invite_code:e.target.value})} autoCapitalize="off"/>
              <button type="submit" className="btn btn-primary" disabled={busy} style={{width:"100%",marginTop:4,fontSize:15}}>
                {busy?<><span className="spinner"/>Creating…</>:"Create Account"}
              </button>
            </form>
          )}
          <div style={{textAlign:"center",fontSize:10,color:C.textDim,marginTop:18,textTransform:"uppercase",letterSpacing:".12em"}}>
            Unofficial · Powered by MyAnonamouse
          </div>
        </div>
      </div>
    </div>
  );
}
// ── ROOT APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [token,setToken]       = useState(localStorage.getItem("mam_token")||"");
  const [username,setUser]     = useState("");
  const [stats,setStats]       = useState(null);
  const [page,setPage]         = useState("search");
  const [watchBadge,setWatchBadge] = useState(0); // found-on-MAM count
  const {toasts,addToast}      = useToast();

  useEffect(()=>{
    if(!token){setUser("");return;}
    const p=parseJwt(token);
    if(p?.sub) setUser(p.sub);
  },[token]);

  const fetchStats=useCallback(async(tk)=>{
    const t=tk||token; if(!t) return;
    try{const res=await fetch(`${API_URL}/api/user/stats`,{headers:ah(t)});if(res.ok)setStats(await res.json());}catch{}
  },[token]);

  useEffect(()=>{if(token)fetchStats(token);},[token]);

  function handleLogin(tk){localStorage.setItem("mam_token",tk);setToken(tk);fetchStats(tk);}
  function handleLogout(){localStorage.removeItem("mam_token");setToken("");setStats(null);setPage("search");addToast("Logged out","info");}

  if(!token) return <><GlobalStyles/><Toasts toasts={toasts}/><AuthPage onLogin={handleLogin} addToast={addToast}/></>;

  const nav=[
    {id:"search",    icon:"🔍", label:"Search"},
    {id:"watchlist", icon:"👁",  label:"Watchlist"},
    {id:"history",   icon:"📋", label:"History"},
    {id:"settings",  icon:"⚙️", label:"Settings"},
  ];

  return (
    <>
      <GlobalStyles/>
      <Toasts toasts={toasts}/>
      <div style={{display:"flex",flexDirection:"column",height:"100%",background:C.bg}}>
        {/* HEADER */}
        <header style={{flexShrink:0,background:C.surface,borderBottom:`1px solid ${C.border}`,paddingTop:"env(safe-area-inset-top,0px)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,height:52,padding:"0 16px"}}>
            <div style={{borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`,flexShrink:0}}>
              <img src="/image.png" alt="MAM" style={{height:34,width:"auto",display:"block",objectFit:"cover"}}/>
            </div>
            <style>{`.hstat-d{display:none}.hstat-m{display:flex}@media(min-width:640px){.hstat-d{display:flex}.hstat-m{display:none}}`}</style>
            {stats&&(
              <div className="hstat-d" style={{flex:1,gap:7,alignItems:"center",minWidth:0,overflow:"hidden"}}>
                {stats.warning?(
                  <button onClick={()=>setPage("settings")} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.35)",borderRadius:99,cursor:"pointer",flexShrink:0}}>
                    <span style={{fontSize:12}}>⚠️</span>
                    <span style={{fontSize:11,fontWeight:600,color:C.amber,whiteSpace:"nowrap"}}>Cookie issue — click to fix</span>
                  </button>
                ):[["Upload",stats.upload],["Download",stats.download],["Ratio",stats.ratio]].map(([label,val])=>(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 11px",background:C.surfaceUp,border:`1px solid ${C.border}`,borderRadius:99,flexShrink:0}}>
                    <span style={{fontSize:9,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:C.textDim}}>{label}</span>
                    <span style={{fontSize:12,fontWeight:600,color:C.text,whiteSpace:"nowrap"}}>{val}</span>
                  </div>
                ))}
              </div>
            )}
            {stats&&<div className="hstat-m" style={{flex:1}}/>}
            {!stats&&<div style={{flex:1}}/>}
            <ProfileMenu username={stats?.username||username} onLogout={handleLogout} onSettings={()=>setPage("settings")}/>
          </div>
          {stats&&(
            <div className="hstat-m" style={{overflowX:"auto",gap:8,padding:"0 16px 10px",scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
              <style>{`.hstat-m::-webkit-scrollbar{display:none}`}</style>
              {stats.warning?(
                <button onClick={()=>setPage("settings")} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 14px",background:"rgba(245,158,11,0.12)",borderRadius:99,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap",border:"none"}}>
                  <span style={{fontSize:13}}>⚠️</span>
                  <span style={{fontSize:12,fontWeight:600,color:C.amber}}>MAM cookie needs updating — tap to fix</span>
                </button>
              ):[["Upload",stats.upload],["Download",stats.download],["Ratio",stats.ratio]].map(s=>(
                <div key={s[0]} style={{flexShrink:0,display:"flex",alignItems:"center",gap:5,background:C.surfaceUp,border:`1px solid ${C.border}`,borderRadius:99,padding:"5px 12px"}}>
                  <span style={{fontSize:9,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:C.textDim}}>{s[0]}</span>
                  <span style={{fontSize:12,fontWeight:600,color:C.text,whiteSpace:"nowrap"}}>{s[1]}</span>
                </div>
              ))}
            </div>
          )}
        </header>

        {/* BODY */}
        <div style={{display:"flex",flex:1,minHeight:0}}>
          <aside className="sidebar desktop-sidebar">
            {nav.map(item=>(
              <button key={item.id} className={`nav-btn${page===item.id?" active":""}`} onClick={()=>setPage(item.id)}>
                <span style={{fontSize:16,flexShrink:0,width:20,textAlign:"center"}}>{item.icon}</span>
                <span style={{overflow:"hidden",fontSize:14}}>{item.label}</span>
                {item.id==="watchlist"&&watchBadge>0&&(
                  <span style={{marginLeft:"auto",minWidth:18,height:18,background:C.accent,borderRadius:99,fontSize:9,fontWeight:700,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",padding:"0 5px"}}>{watchBadge}</span>
                )}
              </button>
            ))}
            <div style={{marginTop:"auto"}}>
              <div style={{height:1,background:C.border,margin:"8px 4px 10px"}}/>
              <div style={{fontSize:9,color:C.textDim,textTransform:"uppercase",letterSpacing:".1em",padding:"0 4px",overflow:"hidden",whiteSpace:"nowrap"}}>MAM WebApp</div>
            </div>
          </aside>

          <main style={{flex:1,overflowY:"auto",padding:"18px 16px 24px",WebkitOverflowScrolling:"touch",display:"flex",flexDirection:"column"}}>
            {page==="search"    && <SearchPage    token={token} addToast={addToast}/>}
            {page==="watchlist" && <WatchlistPage token={token} addToast={addToast} onBadgeChange={setWatchBadge}/>}
            {page==="history"   && <HistoryPage   token={token} addToast={addToast}/>}
            {page==="settings"  && <SettingsPage  token={token} addToast={addToast}/>}
          </main>
        </div>

        {/* MOBILE BOTTOM NAV */}
        <nav className="bottom-nav mobile-bottom-nav">
          {nav.map(item=>(
            <button key={item.id} className={`nav-tab${page===item.id?" active":""}`} onClick={()=>setPage(item.id)}>
              <span className="nav-tab-icon">{item.icon}</span>
              {item.id==="watchlist"&&watchBadge>0&&<span className="nav-badge">{watchBadge}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
