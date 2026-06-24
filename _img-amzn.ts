const data = await Bun.file("/tmp/img-avail-results.json").json();
const amzn = data.filter(r => r.url.includes("m.media-amazon.com"));
console.log("amazon count:", amzn.length);
for (const r of amzn) console.log(r.is_primary ? "PRI" : "non", r.status, r.content_type, r.url);
