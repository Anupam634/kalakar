// Real photos from Unsplash (unsplash.com/license). Hotlinked from Unsplash as the API guidelines require;
// photographers are credited on the page. Download events were sent when these were chosen.
export type Photo = { id: string; raw: string; name: string; user: string; alt: string };
const UTM = "utm_source=kalakar&utm_medium=referral";
/** Sized URL from Unsplash CDN (crop keeps the subject). */
export const src = (p: Photo, w: number, h?: number) => `${p.raw}&w=${w}${h ? `&h=${h}&fit=crop&crop=entropy` : ""}&q=80&fm=jpg`;
export const profile = (p: Photo) => `https://unsplash.com/@${p.user}?${UTM}`;
export const UNSPLASH = `https://unsplash.com/?${UTM}`;

export const PHOTOS = {
  perfume7: {"id":"TY4QMCrS6P4","raw":"https://images.unsplash.com/photo-1535683577427-740aaac4ec25?ixid=M3wxMTM3NzE5fDB8MXxzZWFyY2h8OHx8cGVyZnVtZSUyMGJvdHRsZXxlbnwxfDF8fHwxNzk1MDA1NjQxfDA&ixlib=rb-4.1.0","name":"William Bout","user":"williambout","alt":"four clear glass cruets"},
  perfume3: {"id":"nka_sIQpKEU","raw":"https://images.unsplash.com/photo-1622618991746-fe6004db3a47?ixid=M3wxMTM3NzE5fDB8MXxzZWFyY2h8NHx8cGVyZnVtZSUyMGJvdHRsZXxlbnwxfDF8fHwxNzk1MDA1NjQxfDA&ixlib=rb-4.1.0","name":"Birgith Roosipuu","user":"msbirgith","alt":"A glass perfume bottle and two small cosmetic jars on a yellow surface"},
  saree1: {"id":"njVir8eVq1M","raw":"https://images.unsplash.com/photo-1679006831648-7c9ea12e5807?ixid=M3wxMTM3NzE5fDB8MXxzZWFyY2h8Mnx8c2FyZWV8ZW58MXwxfHx8MTc5NTAwNTY0Mnww&ixlib=rb-4.1.0","name":"Sabesh Photography LTD","user":"sabesh","alt":"a woman wearing a green sari and jewelry"},
  saree5: {"id":"NQ0dtGvTZEQ","raw":"https://images.unsplash.com/photo-1710440189404-e95fabead2a3?ixid=M3wxMTM3NzE5fDB8MXxzZWFyY2h8Nnx8c2FyZWV8ZW58MXwxfHx8MTc5NTAwNTY0Mnww&ixlib=rb-4.1.0","name":"vinay manda","user":"vinaymanda","alt":"a bunch of colorful t - shirts are stacked on a shelf"},
  chai2: {"id":"dXGl11H1Kbg","raw":"https://images.unsplash.com/photo-1619581073186-5b4ae1b0caad?ixid=M3wxMTM3NzE5fDB8MXxzZWFyY2h8M3x8bWFzYWxhJTIwY2hhaXxlbnwxfDF8fHwxNzk1MDA1NjQ2fDA&ixlib=rb-4.1.0","name":"Harsh Pandey","user":"harsh_clicks__","alt":"brown clay pots on brown wooden table"},
  chai1: {"id":"K-VJWFkqad0","raw":"https://images.unsplash.com/photo-1693302050215-66ae33076745?ixid=M3wxMTM3NzE5fDB8MXxzZWFyY2h8Mnx8bWFzYWxhJTIwY2hhaXxlbnwxfDF8fHwxNzk1MDA1NjQ2fDA&ixlib=rb-4.1.0","name":"Dhruval Upadhyay","user":"dhruval47","alt":"a person pouring liquid into a cup on a table"},
  chai6: {"id":"HHM4Ejj0SCE","raw":"https://images.unsplash.com/photo-1630748662359-40a2105640c7?ixid=M3wxMTM3NzE5fDB8MXxzZWFyY2h8N3x8bWFzYWxhJTIwY2hhaXxlbnwxfDF8fHwxNzk1MDA1NjQ2fDA&ixlib=rb-4.1.0","name":"VD Photography","user":"vdphotography","alt":"brown cup on white and blue ceramic plate"},
  jewel6: {"id":"KA_Inf531b8","raw":"https://images.unsplash.com/photo-1671642883395-0ab89c3ac890?ixid=M3wxMTM3NzE5fDB8MXxzZWFyY2h8N3x8aW5kaWFuJTIwamV3ZWxsZXJ5fGVufDF8MXx8fDE3OTUwMDU2NDR8MA&ixlib=rb-4.1.0","name":"fatemeh zakeri","user":"fatemeh_photography","alt":"a pair of red and white earrings sitting on top of a wooden table"},
  jewel3: {"id":"KxHcyNOIO_M","raw":"https://images.unsplash.com/photo-1756483560049-e7b2208f99a0?ixid=M3wxMTM3NzE5fDB8MXxzZWFyY2h8NHx8aW5kaWFuJTIwamV3ZWxsZXJ5fGVufDF8MXx8fDE3OTUwMDU2NDR8MA&ixlib=rb-4.1.0","name":"iKshana Productions","user":"ikshanaproductions","alt":"A smiling woman adorned in traditional indian jewelry and attire"},
  kulfi1: {"id":"P8wvUauIIbE","raw":"https://images.unsplash.com/photo-1760678874444-a9a481c45a2e?ixid=M3wxMTM3NzE5fDB8MXxzZWFyY2h8Mnx8a3VsZml8ZW58MXx8fHwxNzk1MDA1NjQzfDA&ixlib=rb-4.1.0","name":"Praswin Prakashan","user":"praswinprakashan","alt":"Juice corner stand with a ferris wheel behind"},
  creator0: {"id":"lkHNDf-oXTk","raw":"https://images.unsplash.com/photo-1543525469-65b61cc2bc06?ixid=M3wxMTM3NzE5fDB8MXxzZWFyY2h8MXx8Y3JlYXRvciUyMGZpbG1pbmclMjBzbWFydHBob25lfGVufDF8fHx8MTc5NTAwNTY0Nnww&ixlib=rb-4.1.0","name":"charlesdeluvio","user":"charlesdeluvio","alt":"person using smartphone and capturing images"},
  phone5: {"id":"LBGmaMQTR_c","raw":"https://images.unsplash.com/photo-1663082076137-486bc3ff6fd7?ixid=M3wxMTM3NzE5fDB8MXxzZWFyY2h8Nnx8aW5kaWFuJTIwd29tYW4lMjBzbWFydHBob25lfGVufDF8fHx8MTc5NTAwNTY0NXww&ixlib=rb-4.1.0","name":"Rushi Shah","user":"rushicumar3433","alt":"a woman talking on a cell phone"},
} satisfies Record<string, Photo>;

/** Sample products a visitor can switch between on the landing page. */
export type Preset = { id: string; label: string; name: string; price: string; line: string; main: Photo; detail: Photo; extra: Photo };
export const PRESETS: Preset[] = [
  { id: "attar", label: "Attar", name: "Monsoon Oudh", price: "₹1,499", line: "Hand-blended in Lucknow", main: PHOTOS.perfume7, detail: PHOTOS.perfume3, extra: PHOTOS.perfume7 },
  { id: "saree", label: "Saree", name: "Kanjivaram Silk", price: "₹12,500", line: "Woven by hand in 21 days", main: PHOTOS.saree1, detail: PHOTOS.saree5, extra: PHOTOS.saree1 },
  { id: "chai", label: "Chai", name: "Kulhad Masala Chai", price: "₹60", line: "Brewed fresh, every hour", main: PHOTOS.chai2, detail: PHOTOS.chai1, extra: PHOTOS.chai6 },
  { id: "jewel", label: "Jewellery", name: "Ruby Drop Earrings", price: "₹3,200", line: "Kundan work, gold plated", main: PHOTOS.jewel6, detail: PHOTOS.jewel3, extra: PHOTOS.jewel6 },
];
export const ALL_CREDITS: Photo[] = Object.values(PHOTOS);
