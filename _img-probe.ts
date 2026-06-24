const tests = [
  "https://cdn.darjs.dev/this-definitely-does-not-exist-xyz123.jpg",
  "https://cdn.darjs.dev/",
  "https://cdn.darjs.dev/foo/bar/baz/nonexistent.webp",
];
for (const u of tests) {
  try {
    const r = await fetch(u, { method: "GET", headers: { Range: "bytes=0-0" }, redirect: "follow" });
    console.log(u, "->", r.status, r.headers.get("content-type"), "len:", r.headers.get("content-length"));
  } catch (e) { console.log(u, "ERR", e.message); }
}
// also test a real one from results
const data = await Bun.file("/tmp/img-avail-results.json").json();
const sample = data.find(r => r.url.includes("cdn.darjs.dev"));
console.log("\nsample real url:", sample.url);
const r2 = await fetch(sample.url, { method: "GET", headers: { Range: "bytes=0-0" } });
console.log("real ->", r2.status, r2.headers.get("content-type"), r2.headers.get("content-length"));
