
/* DESI OFFICIALS — DO GALAXY + MEMBERSHIP */
(() => {
  "use strict";

  const EMAILS = [
    "desioficials@gmail.com",
    "desiofficials26@gmail.com"
  ];

  const $ = (s, root = document) => root.querySelector(s);

  let currentMember = null;
  let currentUser = null;
  let membershipLoaded = false;

  const css = document.createElement("style");
  css.textContent = `
    #home .bg { overflow:hidden; }
    #doGalaxyCanvas {
      position:absolute; inset:0; width:100%; height:100%;
      z-index:1; pointer-events:none; opacity:.9;
    }
    .do-member-card {
      position:relative; isolation:isolate; overflow:hidden;
      border:1px solid rgba(215,255,58,.58);
      background:radial-gradient(ellipse at 50% 0%,rgba(215,255,58,.13),transparent 55%),#050805;
      padding:26px;
      box-shadow:0 0 35px rgba(180,255,0,.08),inset 0 0 35px rgba(180,255,0,.035);
    }
    .do-member-card:before {
      content:""; position:absolute; inset:-60%; z-index:-1;
      background:repeating-conic-gradient(from 0deg,transparent 0 13deg,rgba(215,255,58,.045) 14deg 14.5deg,transparent 15deg 30deg);
      animation:doCardOrbit 34s linear infinite;
    }
    .do-card-kicker {
      font-size:10px; letter-spacing:.28em; color:#d7ff3a;
      text-transform:uppercase;
    }
    .do-card-id {
      font-size:clamp(25px,6vw,42px); font-weight:900;
      letter-spacing:.08em; color:#eaff9b; margin:14px 0;
      text-shadow:0 0 18px rgba(215,255,58,.35);
      overflow-wrap:anywhere;
    }
    .do-card-name { font-size:20px; font-weight:800; text-transform:uppercase; }
    .do-card-meta { font-size:12px; color:#b7c39b; margin-top:7px; overflow-wrap:anywhere; }
    .do-card-rule {
      height:1px; background:linear-gradient(90deg,transparent,rgba(215,255,58,.65),transparent);
      margin:20px 0;
    }
    .do-card-foot {
      display:flex; justify-content:space-between; gap:14px;
      flex-wrap:wrap; font-size:10px; letter-spacing:.13em;
      color:#d7ff3a; text-transform:uppercase;
    }
    .do-card-email {
      display:block; color:#d7ff3a; font-size:12px;
      margin-top:8px; overflow-wrap:anywhere;
    }
    .do-card-actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:20px; }
    .do-auth-note { margin-top:12px; color:var(--mute); font-size:12px; }
    @keyframes doCardOrbit { to { transform:rotate(360deg); } }
    @media(prefers-reduced-motion:reduce) {
      #doGalaxyCanvas { opacity:.55; }
      .do-member-card:before { animation:none; }
    }
    @media print {
      body * { visibility:hidden!important; }
      #aDlg,#aDlg * { visibility:visible!important; }
      #aDlg {
        position:absolute!important; inset:0!important;
        width:100%!important; max-width:none!important;
        max-height:none!important; border:0!important;
        background:#050505!important;
      }
      #aDlg .dhead,[data-no-print] { display:none!important; }
      #aBody { padding:0!important; }
      .do-member-card { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
    }
  `;
  document.head.append(css);

  /* Animated green galaxy — original hero image is preserved */
  function startGalaxy() {
    const bg = $("#home .bg");
    if (!bg || $("#doGalaxyCanvas")) return;

    const canvas = document.createElement("canvas");
    canvas.id = "doGalaxyCanvas";
    canvas.setAttribute("aria-hidden", "true");
    bg.append(canvas);

    const ctx = canvas.getContext("2d", { alpha:true });
    if (!ctx) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0, height = 0, dpr = 1, frame = 0;
    let start = performance.now();
    let stars = [];

    const rand = (a,b) => a + Math.random() * (b-a);

    function resize() {
      const rect = bg.getBoundingClientRect();
      width = Math.max(1,rect.width);
      height = Math.max(1,rect.height);
      dpr = Math.min(devicePixelRatio || 1,2);
      canvas.width = Math.round(width*dpr);
      canvas.height = Math.round(height*dpr);
      canvas.style.width = width+"px";
      canvas.style.height = height+"px";
      ctx.setTransform(dpr,0,0,dpr,0,0);

      stars = Array.from({length:Math.min(190,Math.max(85,Math.round(width*height/8500)))},()=>({
        x:rand(0,width), y:rand(0,height),
        r:rand(.35,1.65), phase:rand(0,Math.PI*2),
        speed:rand(.55,1.5)
      }));
      draw(performance.now());
    }

    function draw(now) {
      ctx.clearRect(0,0,width,height);

      const elapsed = (now-start)/1000;
      const formation = Math.floor(elapsed/9);
      const morph = (elapsed%9)/9;
      const cx = width*(.52+Math.sin(formation*1.7)*.055);
      const cy = height*(.43+Math.cos(formation*1.3)*.045);
      const scale = Math.min(width,height)*(.24+.035*Math.sin(formation));
      const rotation = elapsed*.035+formation*.7;

      const glow = ctx.createRadialGradient(cx,cy,0,cx,cy,scale*2.5);
      glow.addColorStop(0,"rgba(215,255,58,.15)");
      glow.addColorStop(.28,"rgba(160,255,0,.075)");
      glow.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0,0,width,height);

      /* Stars pulse approximately once per second */
      for (const s of stars) {
        const pulse = .22+.78*(.5+.5*Math.sin(now/620*s.speed+s.phase));
        ctx.globalAlpha = pulse*.78;
        ctx.fillStyle = "#d7ff3a";
        ctx.beginPath();
        ctx.arc(s.x,s.y,s.r*(.8+pulse*.45),0,Math.PI*2);
        ctx.fill();
        if (pulse>.91 && s.r>1.1) {
          ctx.globalAlpha = pulse*.42;
          ctx.fillRect(s.x-3,s.y-.35,6,.7);
          ctx.fillRect(s.x-.35,s.y-3,.7,6);
        }
      }
      ctx.globalAlpha = 1;

      /* Formation switches between spiral, ring and twin-arm */
      const arms = formation%3===0 ? 3 : formation%3===1 ? 5 : 2;
      for (let i=0;i<720;i++) {
        const t=i/720;
        const arm=i%arms;
        const angle=t*Math.PI*7+arm*(Math.PI*2/arms)+rotation;
        const spiral=scale*(.08+.98*t);
        const ring=scale*(.58+.13*Math.sin(t*Math.PI*2+rotation));
        const blend=.5-.5*Math.cos(morph*Math.PI*2);
        const radius=spiral*(1-blend)+ring*blend;
        const scatter=(1-t)*7+1.5;
        const x=cx+Math.cos(angle)*radius+rand(-scatter,scatter);
        const y=cy+Math.sin(angle)*radius*.47+rand(-scatter,scatter);

        ctx.globalAlpha=Math.max(.05,.16+.55*(1-t)+.18*Math.sin(now/700+i));
        ctx.fillStyle="#cfff35";
        ctx.beginPath();
        ctx.arc(x,y,rand(.35,1.15),0,Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha=1;
    }

    function animate(now) {
      draw(now);
      if (!reduced) frame=requestAnimationFrame(animate);
    }

    resize();
    if (!reduced) frame=requestAnimationFrame(animate);
    addEventListener("resize",resize,{passive:true});
    document.addEventListener("visibilitychange",()=>{
      if (document.hidden) cancelAnimationFrame(frame);
      else if (!reduced) frame=requestAnimationFrame(animate);
    });
  }

  function escapeHTML(value) {
    return String(value??"").replace(/[&<>"']/g,c=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }

  async function api(url,options={}) {
    const response=await fetch(url,{
      credentials:"same-origin",
      cache:"no-store",
      ...options,
      headers:{
        ...(options.body?{"Content-Type":"application/json"}:{}),
        ...(options.headers||{})
      }
    });
    let data={};
    try { data=await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error||`Request failed (${response.status})`);
    return data;
  }

  function updateMember(value) {
    currentMember=value;
    membershipLoaded=true;
    window.member=()=>currentMember;
    if (typeof window.renderBid==="function") window.renderBid();
  }

  async function loadMembership() {
    try {
      const me=await api("/api/me");
      currentUser=me.user||null;

      const data=await api("/api/membership");

      if (data.success && data.customer && data.customer.member_id && data.membership) {
        updateMember({
          id:data.customer.member_id,
          name:data.customer.name||currentUser?.name||"DO MEMBER",
          email:data.customer.email||currentUser?.email||"",
          phone:data.customer.phone||"",
          since:data.membership.joined_at||data.customer.created_at||"",
          level:data.membership.level||"BASIC",
          status:data.membership.status||"ACTIVE",
          expires:data.membership.expires_at||""
        });
      } else {
        updateMember(null);
      }
      renderMembership();
    } catch(error) {
      currentUser=null;
      updateMember(null);
      renderMembership(error.message||"Unable to load your account.");
    }
  }

  function cardHTML(m) {
    const since=m.since
      ? new Date(m.since).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})
      : "Membership active";

    return `
      <article class="do-member-card">
        <p class="do-card-kicker">DO — DESI OFFICIALS · OFFICIAL MEMBER</p>
        <p class="do-card-id">${escapeHTML(m.id)}</p>
        <p class="do-card-name">${escapeHTML(m.name)}</p>
        <p class="do-card-meta">${escapeHTML(m.email)}</p>
        <p class="do-card-meta">${escapeHTML(m.phone||"Phone not added")}</p>
        <div class="do-card-rule"></div>
        <div class="do-card-foot">
          <span>${escapeHTML(m.level||"BASIC")} MEMBERSHIP</span>
          <span>${escapeHTML(m.status||"ACTIVE")}</span>
        </div>
        <p class="do-card-meta">MEMBER SINCE · ${escapeHTML(since)}</p>
        ${m.expires?`<p class="do-card-meta">VALID UNTIL · ${escapeHTML(new Date(m.expires).toLocaleDateString("en-IN"))}</p>`:""}
        <div class="do-card-rule"></div>
        <p class="do-card-kicker">OFFICIAL DO CONTACT</p>
        ${EMAILS.map(email=>`<a class="do-card-email" href="mailto:${email}">${email}</a>`).join("")}
        <div class="do-card-rule"></div>
        <div class="do-card-foot">
          <span>DESIOFFICIALS.COM</span>
          <span>BEYOND FASHION.</span>
        </div>
      </article>
      <div class="do-card-actions" data-no-print>
        <button class="btn solid" type="button" id="doPrintCard">SAVE / PRINT MEMBER CARD</button>
        <button class="btn" type="button" id="doRefreshCard">REFRESH DETAILS</button>
      </div>`;
  }

  function renderMembership(message="") {
    const box=$("#joinBox");
    if (!box) return;

    if (currentMember) {
      box.innerHTML=`
        <p class="eyebrow">You're in · Membership verified</p>
        <h3 style="font-size:34px;margin:10px 0">WELCOME, ${escapeHTML((currentMember.name||"MEMBER").split(" ")[0])}</h3>
        <p class="lead" style="margin-bottom:20px">Your permanent DO Member ID is active in the DO database.</p>
        ${cardHTML(currentMember)}`;

      $("#doPrintCard")?.addEventListener("click",()=>window.print());
      $("#doRefreshCard")?.addEventListener("click",loadMembership);
      return;
    }

    if (currentUser) {
      box.innerHTML=`
        <p class="eyebrow">Google account connected</p>
        <h3 style="font-size:28px;margin:10px 0">ACTIVATE YOUR DO MEMBERSHIP.</h3>
        <p class="lead">${escapeHTML(currentUser.name||currentUser.email||"Your account")} — activate your membership to receive your permanent DO Member ID.</p>
        <div style="margin-top:22px">
          <button class="btn solid" type="button" id="doJoinNow">ACTIVATE DO MEMBERSHIP ↗</button>
        </div>
        <p class="do-auth-note">${escapeHTML(message)}</p>`;
      $("#doJoinNow")?.addEventListener("click",joinMembership);
      return;
    }

    box.innerHTML=`
      <p class="eyebrow">Official DO account</p>
      <h3 style="font-size:28px;margin:10px 0">SIGN IN TO JOIN DO.</h3>
      <p class="lead">Use your Google account to create your DO account. Your permanent Member ID and membership details are stored in the DO database.</p>
      <div style="margin-top:22px">
        <a class="btn solid" href="/auth/google">CONTINUE WITH GOOGLE ↗</a>
      </div>
      <p class="do-auth-note">${escapeHTML(message||"Your membership is linked to your signed-in account.")}</p>`;
  }

  async function joinMembership() {
    const button=$("#doJoinNow");
    if (button) {
      button.disabled=true;
      button.textContent="ACTIVATING…";
    }

    try {
      const result=await api("/api/membership/join",{
        method:"POST",
        body:JSON.stringify({})
      });
      if (!result.success) throw new Error(result.error||"Membership activation failed.");
      await loadMembership();
    } catch(error) {
      renderMembership(error.message);
    }
  }

  function openDOAccount() {
    const dialog=$("#aDlg");
    const body=$("#aBody");
    if (!dialog||!body) return;

    if (!membershipLoaded) {
      body.innerHTML='<p class="lead">Loading your secure DO account…</p>';
      dialog.showModal();
      loadMembership();
      return;
    }

    if (currentMember) {
      body.innerHTML=cardHTML(currentMember);
      $("#doPrintCard")?.addEventListener("click",()=>window.print());
      $("#doRefreshCard")?.addEventListener("click",loadMembership);
    } else {
      body.innerHTML=`
        <p class="lead">${currentUser
          ?"Your Google account is connected. Activate your membership below."
          :"Sign in with Google to access your DO account and membership."}</p>
        <div style="margin-top:20px">
          ${currentUser
            ?'<button class="btn solid" type="button" id="doJoinAccount">ACTIVATE MEMBERSHIP ↗</button>'
            :'<a class="btn solid" href="/auth/google">CONTINUE WITH GOOGLE ↗</a>'}
        </div>`;
      $("#doJoinAccount")?.addEventListener("click",joinMembership);
    }
    dialog.showModal();
  }

  /* Connect to the existing storefront account controls */
  window.member=()=>currentMember;
  window.renderJoin=renderMembership;
  window.openAccount=openDOAccount;

  const accountButton=$("#acctBtn");
  if (accountButton) accountButton.onclick=openDOAccount;

  startGalaxy();
  loadMembership();
})();
