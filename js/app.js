(() => {
  const cfg = window.ZEN_CONFIG || {};
  const API = cfg.API_URL;
  const CACHE_KEY = "zen_public_cache_v1";
  const $ = (s) => document.querySelector(s);
  const escapeHTML = (v="") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const safeURL = (v="") => { try { const u = new URL(v); return ["http:","https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
  const money = v => v ? (String(v).match(/[^\d]/) ? escapeHTML(v) : "Rp " + Number(v).toLocaleString("id-ID")) : "Hubungi kami";
  const jsonp = (params) => new Promise((resolve,reject) => {
    if (!API || API.includes("PASTE_")) return reject(new Error("API_URL belum diatur."));
    const cb = "zen_cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const timer = setTimeout(() => { cleanup(); reject(new Error("Koneksi spreadsheet timeout")); }, 12000);
    function cleanup(){ clearTimeout(timer); delete window[cb]; script.remove(); }
    window[cb] = data => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("Gagal membaca spreadsheet")); };
    script.src = API + (API.includes("?") ? "&" : "?") + new URLSearchParams({...params, callback:cb, _:Date.now()});
    document.body.appendChild(script);
  });
  function mediaURL(url) {
    const u = safeURL(url); if (!u) return "";
    const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    if (yt) return {type:"embed",src:"https://www.youtube-nocookie.com/embed/"+yt[1]};
    const ig = u.match(/instagram\.com\/(p|reel|tv)\/([^/?]+)/);
    if (ig) return {type:"embed",src:`https://www.instagram.com/${ig[1]}/${ig[2]}/embed`};
    const fb = u.match(/facebook\.com\/.*\/videos\/(\d+)/);
    if (fb) return {type:"embed",src:"https://www.facebook.com/plugins/video.php?href="+encodeURIComponent(u)+"&show_text=false"};
    if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(u)) return {type:"video",src:u};
    return {type:"link",src:u};
  }
  function renderProducts(items, contacts) {
    const grid=$("#productGrid"); const visible=(items||[]).filter(x=>String(x.active).toLowerCase()!=="false" && x.active!==0);
    if (!visible.length){grid.innerHTML="";$("#productEmpty").classList.remove("hidden");return;}
    $("#productEmpty").classList.add("hidden");
    const preferred=contacts.find(c=>c.isOrder==="true"||c.isOrder===true)||contacts.find(c=>/whatsapp/i.test(c.type||""))||contacts[0];
    grid.innerHTML=visible.map(p=>{
      const image=safeURL(p.image);
      const order=preferred ? (String(preferred.type).toLowerCase().includes("whatsapp") ? "https://wa.me/"+String(preferred.value||"").replace(/\\D/g,"")+"?text="+encodeURIComponent("Halo ZEN, saya tertarik dengan "+p.name) : safeURL(preferred.value)) : "";
      return `<article class="product-card"><div class="product-image">${image?`<img src="${image}" alt="${escapeHTML(p.name)}" loading="lazy" onerror="this.style.display='none'">`:`<span class="image-fallback">ZEN</span>`}</div><div class="product-info"><span class="product-meta">${escapeHTML(p.category||"ZEN COLLECTION")}</span><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.description||"Merchandise khas ZEN.")}</p><div class="product-bottom"><span class="product-price">${money(p.price)}</span>${order?`<a class="order-link" href="${escapeHTML(order)}" target="_blank" rel="noopener">ORDER ↗</a>`:`<span class="product-meta">HUBUNGI KAMI</span>`}</div></div></article>`;
    }).join("");
  }
  function renderGallery(items) {
    const grid=$("#galleryGrid"); const visible=(items||[]).filter(x=>String(x.active).toLowerCase()!=="false" && x.active!==0);
    if(!visible.length){grid.innerHTML="";$("#galleryEmpty").classList.remove("hidden");return;}
    $("#galleryEmpty").classList.add("hidden");
    grid.innerHTML=visible.map(m=>{
      const media=mediaURL(m.url); let content="";
      if(media?.type==="embed") content=`<iframe src="${escapeHTML(media.src)}" title="${escapeHTML(m.title||"ZEN video")}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
      else if(media?.type==="video") content=`<video controls playsinline preload="metadata"><source src="${escapeHTML(media.src)}"></video>`;
      else if((m.type||"").toLowerCase().includes("video")) content=`<a href="${escapeHTML(media?.src||"#")}" target="_blank" rel="noopener" class="media-fallback">▶ Buka video ↗</a>`;
      else content=`<img src="${escapeHTML(media?.src||"")}" alt="${escapeHTML(m.title||"ZEN gallery")}" loading="lazy">`;
      return `<div class="gallery-item">${content}<span class="media-label">${escapeHTML(m.title||"ZEN MOMENT")}</span></div>`;
    }).join("");
  }
  function renderContacts(items) {
    const box=$("#contactLinks"); const visible=(items||[]).filter(x=>String(x.active).toLowerCase()!=="false" && x.active!==0);
    if(!visible.length){box.innerHTML="<span>Kontak belum tersedia.</span>";return;}
    box.innerHTML=visible.map(c=>{
      let url=safeURL(c.value);
      if(/whatsapp/i.test(c.type||"")) url="https://wa.me/"+String(c.value||"").replace(/\D/g,"");
      else if(/telepon|phone/i.test(c.type||"")) url="tel:"+String(c.value||"").replace(/[^\d+]/g,"");
      else if(/email/i.test(c.type||"")) url="mailto:"+c.value;
      return `<a href="${escapeHTML(url||"#")}" target="_blank" rel="noopener">${escapeHTML(c.label||c.type||"Kontak")} <span>↗</span></a>`;
    }).join("");
  }
  async function loadData() {
    // Stale-while-revalidate: tampilkan cache seketika, lalu sinkronkan data terbaru.
    try { const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||"null"); if(cached) render(cached); } catch {}
    try {
      const result=await jsonp({action:"publicData"});
      if(!result.ok) throw new Error(result.error||"Tidak dapat memuat data");
      localStorage.setItem(CACHE_KEY,JSON.stringify(result.data)); render(result.data);
    } catch(err) {
      if(!localStorage.getItem(CACHE_KEY)) {
        $("#productGrid").innerHTML=`<div class="loading-card">Data belum dapat dimuat. ${escapeHTML(err.message)}</div>`;
      }
      console.warn(err);
    }
  }
  function render(data) {
    const products=data.products||[], gallery=data.media||[], contacts=data.contacts||[];
    renderProducts(products,contacts); renderGallery(gallery); renderContacts(contacts);
    if(data.settings?.heroDescription) $("#heroDescription").textContent=data.settings.heroDescription;
  }
  $("#menuToggle")?.addEventListener("click",()=>$("#mainNav").classList.toggle("open"));
  document.querySelectorAll(".main-nav a").forEach(a=>a.addEventListener("click",()=>$("#mainNav").classList.remove("open")));
  loadData();
})();