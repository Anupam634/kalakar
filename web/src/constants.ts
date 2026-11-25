export const LANGS: [string, string][] = [
  ["en", "English"], ["hinglish", "Hinglish"], ["hi", "हिन्दी"], ["mr", "मराठी"], ["bn", "বাংলা"], ["ta", "தமிழ்"],
  ["te", "తెలుగు"], ["gu", "ગુજરાતી"], ["kn", "ಕನ್ನಡ"], ["ml", "മലയാളം"], ["pa", "ਪੰਜਾਬੀ"],
];

export const GOALS: [string, string][] = [
  ["showcase", "Show it off"], ["launch", "New launch"], ["offer", "Offer / sale"], ["educate", "Tips & how-to"],
  ["testimonial", "Why people love it"], ["behind", "Behind the scenes"], ["festival", "Festival greeting"], ["story", "Personal story"],
];

export const STYLES: { id: string; name: string; note: string }[] = [
  { id: "auto", name: "Auto", note: "Matches your brand" },
  { id: "studio", name: "Studio", note: "Clean, product first" },
  { id: "bold", name: "Bold", note: "Big type, high contrast" },
  { id: "luxury", name: "Luxury", note: "Dark, serif, gold lines" },
  { id: "lifestyle", name: "Lifestyle", note: "Full photo, text on top" },
  { id: "playful", name: "Playful", note: "Shapes, tilted photo" },
];

export const FONT_STYLES: { id: string; name: string; css: string }[] = [
  { id: "modern", name: "Modern", css: "font-tight font-extrabold" },
  { id: "serif", name: "Editorial", css: "font-serif" },
  { id: "bold", name: "Bold", css: "font-tight font-black uppercase tracking-tight" },
  { id: "playful", name: "Playful", css: "font-tight font-extrabold italic" },
  { id: "luxury", name: "Luxury", css: "font-serif italic" },
];

export const PALETTES: { name: string; colors: [string, string, string] }[] = [
  { name: "Ink & brass", colors: ["#1B1A17", "#F1EBE1", "#B8865B"] },
  { name: "Forest", colors: ["#1F3A2E", "#F2EFE6", "#D9A441"] },
  { name: "Terracotta", colors: ["#3B2219", "#F6EEE6", "#D2693C"] },
  { name: "Navy", colors: ["#14213D", "#F4F1EA", "#E5A13A"] },
  { name: "Rose", colors: ["#3A1F2B", "#FBF1F0", "#D97A8B"] },
  { name: "Mono", colors: ["#111111", "#F5F5F2", "#8C8C86"] },
];

export const CATEGORIES = ["Clothing", "Jewellery", "Beauty & skincare", "Food & bakery", "Cafe / restaurant", "Home decor", "Handmade / crafts", "Fitness", "Coaching / courses", "Salon & spa", "Electronics", "Real estate"];
export const TONES = ["Warm & friendly", "Premium & calm", "Bold & energetic", "Fun & witty", "Expert & trustworthy"];
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
