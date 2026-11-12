export const weatherTypes = [
  "sunny",
  "cloudy",
  "fog",
  "rain",
  "storm",
  "snow",
  "wind",
  "downpour",
  "hail",
  "rainbow",
  "typhoon",
  "tornado",
] as const;
export type Weather = (typeof weatherTypes)[number];

// Each recorded day keeps its own weather color, regardless of the current sky.
export const calendarColors: Record<Weather, { light: string; dark: string }> =
  {
    sunny: { light: "#b67916", dark: "#ffd279" },
    cloudy: { light: "#5b788c", dark: "#bdcfdf" },
    fog: { light: "#806798", dark: "#d0bde9" },
    rain: { light: "#2879ad", dark: "#82c9f1" },
    storm: { light: "#8056b3", dark: "#c4a0f5" },
    snow: { light: "#438ca3", dark: "#b7e8f3" },
    wind: { light: "#328478", dark: "#93d9c7" },
    downpour: { light: "#335fb1", dark: "#93b7ff" },
    hail: { light: "#6874a9", dark: "#bbc6fa" },
    rainbow: { light: "#b35c83", dark: "#f5add0" },
    typhoon: { light: "#247b85", dark: "#7fdbda" },
    tornado: { light: "#976586", dark: "#e8acd2" },
  };
export const weatherInfo: Record<
  Weather,
  {
    name: string;
    feeling: string;
    title: string;
    text: string;
    reply: string;
    color: string;
  }
> = {
  sunny: {
    name: "晴朗",
    feeling: "心里有光",
    title: "今天，心里有阳光。",
    text: "让好心情晒一会儿太阳。",
    reply: "记下了，今天有光。",
    color: "#dca756",
  },
  cloudy: {
    name: "阴天",
    feeling: "平平淡淡",
    title: "阴天，就把节奏放慢。",
    text: "不用每天都晴朗，慢慢来就好。",
    reply: "记下了，云也有云的自在。",
    color: "#839b8f",
  },
  fog: {
    name: "有雾",
    feeling: "有点迷茫",
    title: "看不清，也可以慢慢走。",
    text: "暂时没有答案，也没有关系。",
    reply: "记下了，给自己一点时间。",
    color: "#a6a0b6",
  },
  rain: {
    name: "小雨",
    feeling: "有点低落",
    title: "今天，允许心里下点雨。",
    text: "找个舒服的角落，听雨落下来。",
    reply: "记下了，今天有雨。",
    color: "#789aaa",
  },
  storm: {
    name: "雷雨",
    feeling: "心里打雷",
    title: "心里打雷，也没关系。",
    text: "情绪有声音，这里听得见。",
    reply: "记下了，这场雷雨有人听见。",
    color: "#827c9f",
  },
  snow: {
    name: "落雪",
    feeling: "想静一静",
    title: "世界轻一点，心也轻一点。",
    text: "把喧闹关小，给自己一点留白。",
    reply: "记下了，今天安安静静。",
    color: "#94aab3",
  },
  wind: {
    name: "大风",
    feeling: "心绪不宁",
    title: "风有点大，先站稳自己。",
    text: "思绪被吹散了，就一件一件慢慢捡。",
    reply: "记下了，今天心里起了风。",
    color: "#8caaad",
  },
  downpour: {
    name: "暴雨",
    feeling: "情绪倾泻",
    title: "想痛快下一场雨，就下吧。",
    text: "不用急着收拾心情，先让它流出来。",
    reply: "记下了，这场雨不必忍着。",
    color: "#547d9b",
  },
  hail: {
    name: "冰雹",
    feeling: "被事砸中",
    title: "有些突然，落下来有点疼。",
    text: "今天遇到的那些碰撞，都可以留在这里。",
    reply: "记下了，今天有些磕磕碰碰。",
    color: "#9aaec7",
  },
  rainbow: {
    name: "彩虹",
    feeling: "雨过天晴",
    title: "原来，雨后真的会有彩虹。",
    text: "好起来的这一刻，也值得好好记住。",
    reply: "记下了，今天有一道彩虹。",
    color: "#c29eab",
  },
  typhoon: {
    name: "台风",
    feeling: "快撑不住",
    title: "风很大，先照顾好自己。",
    text: "不急着迎风往前，允许自己躲一会儿。",
    reply: "记下了，今天的风雨很大。",
    color: "#598d95",
  },
  tornado: {
    name: "龙卷风",
    feeling: "乱成一团",
    title: "心里打了个旋，暂时理不清。",
    text: "乱一点也没关系，先给思绪一个出口。",
    reply: "记下了，心里这一场龙卷风。",
    color: "#9e8eaa",
  },
};

export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function monthOf(date: Date): string {
  return localDate(date).slice(0, 7);
}
export function parseDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}
export function shiftMonth(month: string, offset: number): string {
  const date = parseDate(`${month}-01`);
  return monthOf(new Date(date.getFullYear(), date.getMonth() + offset, 1));
}
