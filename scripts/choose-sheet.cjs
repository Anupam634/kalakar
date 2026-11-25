// node scripts/choose-sheet.cjs <mockDir> <outDir> : builds CHOOSE-A-B-C.png (landing + app per direction)
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
(async () => {
  const [dir, out] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const rows = [
    ["A", "Blocks", "Cream + one hot colour, huge type, bento tiles"],
    ["B", "Studio", "Crisp white SaaS, real app UI in the hero"],
    ["C", "Cinema", "Dark, full-screen real photo, big serif"],
  ];
  const TW = 1080, TH = 675, LW = 330, G = 24;
  const W = LW + TW * 2 + G * 4, H = rows.length * (TH + G) + G;
  const layers = [];
  for (const [i, [k, name, line]] of rows.entries()) {
    const y = G + i * (TH + G);
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${LW}" height="${TH}">
      <rect width="${LW}" height="${TH}" rx="28" fill="#111"/>
      <text x="36" y="200" font-family="Georgia, serif" font-size="190" fill="#f3f0ea">${k}</text>
      <text x="38" y="290" font-family="Arial" font-weight="700" font-size="48" fill="#f3f0ea">${name}</text>
      ${line.split(", ").map((t, j) => `<text x="40" y="${360 + j * 40}" font-family="Arial" font-size="26" fill="#bdb6aa">${t}</text>`).join("")}
      <text x="40" y="${TH - 40}" font-family="Arial" font-size="22" fill="#8c867c">Left: website · Right: app</text></svg>`);
    layers.push({ input: label, left: G, top: y });
    for (const [j, s] of ["landing", "app"].entries()) {
      const f = path.join(dir, `${k.toLowerCase()}-${s}.png`);
      const img = await sharp(f).resize(TW, TH).png().toBuffer();
      const mask = Buffer.from(`<svg width="${TW}" height="${TH}"><rect width="${TW}" height="${TH}" rx="22" fill="#fff"/></svg>`);
      layers.push({ input: await sharp(img).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer(), left: G * 2 + LW + j * (TW + G), top: y });
      fs.copyFileSync(f, path.join(out, `${k}-${name.toLowerCase()}-${s}.png`));
    }
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: "#d9d4ca" } }).composite(layers).png().toFile(path.join(out, "CHOOSE-A-B-C.png"));
  console.log("ok", W, H);
})();
