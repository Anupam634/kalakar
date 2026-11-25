// node scripts/label-sheet.cjs <dir-with-th> <out.jpg> : 8 columns, tag label on each tile
const sharp = require("sharp"); const fs = require("fs"); const path = require("path");
(async () => {
  const [dir, out] = process.argv.slice(2);
  const files = fs.readdirSync(path.join(dir, "th")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const W = 170, H = 210, cols = 8;
  const tiles = [];
  for (const f of files) {
    const tag = f.replace(".jpg", "");
    const img = await sharp(path.join(dir, "th", f)).resize(W, H, { fit: "cover" }).toBuffer();
    const lbl = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="26"><rect width="${W}" height="26" fill="#000" opacity="0.75"/><text x="6" y="19" font-size="17" font-family="sans-serif" fill="#fff">${tag}</text></svg>`);
    tiles.push(await sharp(img).composite([{ input: lbl, left: 0, top: 0 }]).toBuffer());
  }
  const rows = Math.ceil(tiles.length / cols);
  await sharp({ create: { width: cols * (W + 4) + 4, height: rows * (H + 4) + 4, channels: 3, background: "#444" } })
    .composite(tiles.map((t, i) => ({ input: t, left: 4 + (i % cols) * (W + 4), top: 4 + Math.floor(i / cols) * (H + 4) })))
    .jpeg({ quality: 80 }).toFile(out);
})();
