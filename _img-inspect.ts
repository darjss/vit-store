import { config } from "dotenv";
config({ path: ".env" });
const data = await Bun.file("/tmp/img-avail-results.json").json();
console.log("total:", data.length);
const byHost = {};
const byCt = {};
const byStatus = {};
for (const r of data) {
  let h; try { h = new URL(r.url).host; } catch { h = "(invalid)"; }
  byHost[h] = (byHost[h]||0)+1;
  const ct = (r.content_type || "(none)").split(";")[0];
  byCt[ct] = (byCt[ct]||0)+1;
  byStatus[r.status] = (byStatus[r.status]||0)+1;
}
console.log("\n=== HOSTS ===");
console.log(Object.entries(byHost).sort((a,b)=>b[1]-a[1]));
console.log("\n=== CONTENT-TYPES ===");
console.log(Object.entries(byCt).sort((a,b)=>b[1]-a[1]));
console.log("\n=== STATUS ===");
console.log(Object.entries(byStatus).sort((a,b)=>b[1]-a[1]));
console.log("\n=== non-ok count ===", data.filter(r=>!r.ok).length);
// sample non-image content types
const nonImg = data.filter(r => r.content_type && !/^image\//i.test(r.content_type));
console.log("\n=== non-image CT samples ===", nonImg.length);
for (const r of nonImg.slice(0,10)) console.log(r.status, r.content_type, r.url.slice(0,80));
