// node scripts/sheet.cjs out.jpg cols tileWidth file1 file2 ...
const sharp = require("sharp");
(async () => {
  const [out, colsS, twS, ...files] = process.argv.slice(2);
  const cols = +colsS, tw = +twS;
  const tiles = await Promise.all(files.map((f) => sharp(f).resize(tw).toBuffer({ resolveWithObject: true })));
  const th = Math.max(...tiles.map((t) => t.info.height));
  const rows = Math.ceil(tiles.length / cols);
  await sharp({ create: { width: cols * tw + (cols + 1) * 8, height: rows * th + (rows + 1) * 8, channels: 3, background: "#777" } })
    .composite(tiles.map((t, i) => ({ input: t.data, left: 8 + (i % cols) * (tw + 8), top: 8 + Math.floor(i / cols) * (th + 8) })))
    .jpeg({ quality: 82 }).toFile(out);
})();
