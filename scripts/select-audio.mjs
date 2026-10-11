import { readFile, writeFile, mkdir } from "node:fs/promises";
const existing = await readFile("content/audio-sources.json", "utf8").catch((error) => {
  if (error.code !== "ENOENT") throw error;
  return null;
});
if (existing)
  throw new Error(
    "Legacy selection cannot replace an existing source manifest. Use npm run audio:discover to preserve existing recordings and extend discovery.",
  );
const candidates = JSON.parse(await readFile("media/evidence/candidates.json", "utf8"));
const choices = [
  [
    "Meditation Impromptu 01 (ISRC USUAN1100163).mp3",
    "Một khoảng bình yên",
    "A quiet beginning",
    "instrumental",
    "piano",
    ["relax", "rest"],
  ],
  [
    "Bourne woods Birdsong and rain 2020-06-17 0742.mp3",
    "Mưa và tiếng chim trong rừng",
    "Rain and forest birds",
    "nature",
    "forest",
    ["relax", "focus"],
  ],
  [
    "Evening Fall (Piano) (ISRC USUAN1100235).mp3",
    "Khúc piano chiều",
    "Evening piano",
    "instrumental",
    "piano",
    ["rest", "relax"],
  ],
  [
    "Forest lawn creek.ogg",
    "Dòng suối nhỏ",
    "A little woodland creek",
    "nature",
    "river",
    ["relax", "focus"],
  ],
  [
    "Meditation Impromptu 02 (ISRC USUAN1100162).mp3",
    "Giai điệu chậm rãi",
    "A slower melody",
    "instrumental",
    "night",
    ["rest", "relax"],
  ],
  [
    "Meditation Impromptu 03 (ISRC USUAN1100161).mp3",
    "Một chút tĩnh lặng",
    "A little stillness",
    "instrumental",
    "piano",
    ["relax", "focus"],
  ],
  [
    "Luminous Rain (ISRC USUAN1100169).mp3",
    "Những hạt mưa sáng",
    "Luminous rain",
    "instrumental",
    "rain",
    ["rest", "relax"],
  ],
  [
    "Dream Culture (ISRC USUAN1300046).mp3",
    "Giai điệu mơ màng",
    "Dream culture",
    "instrumental",
    "night",
    ["rest"],
  ],
  [
    "Clean Soul (ISRC USUAN1300033).mp3",
    "Buổi sáng nhẹ nhàng",
    "A gentle morning",
    "instrumental",
    "forest",
    ["focus", "relax"],
  ],
  [
    "Danse Morialta (ISRC USUAN1200026).mp3",
    "Điệu nhạc dịu dàng",
    "Danse Morialta",
    "instrumental",
    "piano",
    ["focus", "relax"],
  ],
  [
    "Light Thought var 1 (ISRC USUAN1200006).mp3",
    "Ý nghĩ nhẹ tênh",
    "Light thought",
    "instrumental",
    "river",
    ["focus"],
  ],
  [
    "Porch Swing Days - slower (ISRC USUAN1100715).mp3",
    "Chiều trên hiên nhà",
    "A porch swing afternoon",
    "instrumental",
    "forest",
    ["relax", "focus"],
  ],
  ["Sound of light rainfall.ogg", "Mưa nhẹ", "Light rainfall", "nature", "rain", ["rest", "relax"]],
  [
    "Birds singing in Fribourg 01.ogg",
    "Tiếng chim buổi sáng",
    "Morning birdsong",
    "nature",
    "forest",
    ["focus", "relax"],
  ],
  [
    "Common Blackbird song (Turdus merula).ogg",
    "Tiếng chim sáo đen",
    "Blackbird song",
    "nature",
    "forest",
    ["focus"],
  ],
  [
    "Bourne woods windy 2020-05-05 0757.mp3",
    "Gió qua tán cây",
    "Wind through the trees",
    "nature",
    "forest",
    ["relax"],
  ],
  ["On a pebble beach.ogg", "Sóng bên bờ sỏi", "On a pebble beach", "nature", "sea", ["relax"]],
  [
    "Nature sounds ambience in a Dordogne pond.ogg",
    "Bên hồ lúc hoàng hôn",
    "A pond at dusk",
    "nature",
    "night",
    ["rest", "relax"],
  ],
  [
    "Sounds of fountain in Fribourg 01.ogg",
    "Nước chảy nơi vòi phun",
    "Water at a fountain",
    "nature",
    "river",
    ["focus", "relax"],
  ],
  [
    "2013-07-24 00-19-04hrs Chiang Mai Chang Khien rain animal sounds night time.ogg",
    "Tiếng đêm sau mưa",
    "Night sounds after rain",
    "nature",
    "night",
    ["rest", "relax"],
  ],
];
const colors = ["sage", "sage", "sand", "blue", "lavender", "sage"];
const sources = choices.map(([originalTitle, vi, en, category, artwork, goals], index) => {
  const evidence = candidates.find((entry) => entry.title === originalTitle);
  if (
    !evidence ||
    !/^(CC BY(?:-SA)? [234]\.0|Public domain)$/.test(evidence.license) ||
    evidence.restrictions
  )
    throw new Error(`Review license: ${originalTitle}`);
  return {
    ...evidence,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    originalTitle,
    title: { vi, en },
    category,
    artwork,
    goals,
    color: colors[index % colors.length],
    position: index,
    artist: category === "instrumental" ? "Kevin MacLeod" : evidence.artist,
    licenseUrl: evidence.licenseUrl || "https://creativecommons.org/publicdomain/mark/1.0/",
    review: {
      provenance: "Verified against Wikimedia Commons imageinfo/extmetadata evidence",
      subjectiveAudio: "Pending human review before production publication",
    },
  };
});
await mkdir("content", { recursive: true });
await writeFile("content/audio-sources.json", JSON.stringify(sources, null, 2) + "\n");
console.log(`Selected ${sources.length} recordings with retained source and license evidence.`);
