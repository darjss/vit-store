const data = await Bun.file("/tmp/img-avail-results.json").json();
const CDN = "https://cdn.darjs.dev";
const OPTS = "width=360,quality=75,fit=contain,format=auto";

function transform(url) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return `${CDN}/cdn-cgi/image/${OPTS}/${url}`;
  }
  const p = url.startsWith("/") ? url : `/${url}`;
  return `${CDN}/cdn-cgi/image/${OPTS}${p}`;
}

async function check(u) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(u, { method: "GET", signal: ctrl.signal, redirect: "follow" });
    return { status: r.status, ct: r.headers.get("content-type"), ok: r.ok || r.status===206 };
  } catch (e) { return { status: null, ct: null, ok: false, err: e.message }; }
  finally { clearTimeout(t); }
}

// Test cdn source + amazon source, primary + non-primary
const cdnNonPri = data.find(r => !r.is_primary && r.url.includes("cdn.darjs.dev"));
const cdnPri = data.find(r => r.is_primary && r.url.includes("cdn.darjs.dev"));
const amznNonPri = data.find(r => !r.is_primary && r.url.includes("m.media-amazon.com"));
const amznPri = data.find(r => r.is_primary && r.url.includes("m.media-amazon.com"));

for (const [label, r] of [["cdn non-pri", cdnNonPri], ["cdn pri", cdnPri], ["amzn non-pri", amznNonPri], ["amzn pri", amznPri]]) {
  const tu = transform(r.url);
  const c = await check(tu);
  console.log(label, "=>", c.status, c.ct, "ok="+c.ok, c.err||"");
  console.log("  src:", r.url.slice(0,70));
  console.log("  tfm:", tu.slice(0,120));
}

// Now batch-check ALL transformed non-primary URLs
console.log("\n=== Batch transform check (non-primary) ===");
const nonPri = data.filter(r => !r.is_primary);
let broken = 0;
const brokenByHost = {};
const sampleBroken = [];
const CONC = 8;
for (let i = 0; i < nonPri.length; i += CONC) {
  const batch = nonPri.slice(i, i+CONC);
  await Promise.all(batch.map(async r => {
    const tu = transform(r.url);
    const c = await check(tu);
    if (!c.ok) {
      broken++;
      let h; try { h = new URL(r.url).host; } catch { h = "(invalid)"; }
      brokenByHost[h] = (brokenByHost[h]||0)+1;
      if (sampleBroken.length < 12) sampleBroken.push({ src: r.url.slice(0,80), status: c.status, ct: c.ct, err: c.err });
    }
  }));
  if ((i/CONC) % 20 === 0) console.error(`  ${i}/${nonPri.length} broken so far: ${broken}`);
}
console.log("non-primary total:", nonPri.length, "broken(transform):", broken);
console.log("brokenByHost:", brokenByHost);
console.log("samples:");
for (const s of sampleBroken) console.log(" ", s.status, s.ct, s.err||"", "|", s.src);
