/** 个人旗号随机建议:有梗、无压力,不满意就 🎲 */
const ADJ = ["熬夜", "摸鱼", "闪电", "卷王", "佛系", "暴走", "低调", "赛博", "隐身", "满血"];
const NOUN = ["船长", "厂长", "监工", "堂主", "指挥官", "练习生", "车间主任", "包工头", "司机", "掌门"];

export function suggestHandle(): string {
  return (
    ADJ[Math.floor(Math.random() * ADJ.length)] +
    NOUN[Math.floor(Math.random() * NOUN.length)] +
    "#" +
    Math.floor(10 + Math.random() * 90)
  );
}
