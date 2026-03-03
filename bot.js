require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cron = require('node-cron');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
const MY_NUM = process.env.MY_PHONE_NUMBER;
const DATA_F = '/tmp/daily.json';

const GYM_SPLIT = {
  Monday:    { focus: 'Lower Body + Glutes',    ex: ['Squats 3x15', 'Lunges 3x12', 'Hip Thrusts 3x15', 'Leg Press 3x15', 'Leg Curl 3x12', 'Calf Raises 3x20'], burn: 280 },
  Tuesday:   { focus: 'Upper Body + Arms',       ex: ['Chest Press 3x12', 'Shoulder Press 3x12', 'Lat Pulldown 3x12', 'Bicep Curl 3x15', 'Tricep Pushdown 3x15', 'Face Pulls 3x15'], burn: 240 },
  Wednesday: { focus: 'HIIT + Core',             ex: ['Burpees 3x10', 'Mountain Climbers 3x30s', 'Plank 3x45s', 'Russian Twist 3x20', 'Leg Raises 3x15', 'Dead Bug 3x10'], burn: 340 },
  Thursday:  { focus: 'Back + Posterior Chain',  ex: ['Deadlift 3x10', 'Seated Row 3x12', 'Single Arm Row 3x12', 'Reverse Fly 3x15', 'Superman Hold 3x30s', 'Good Mornings 3x12'], burn: 260 },
  Friday:    { focus: 'Lower Body + Cardio',     ex: ['Sumo Squat 3x15', 'Bulgarian Split 3x10', 'Glute Kickback 3x15', 'Inner Thigh Press 3x15', 'Step Ups 3x12', 'Jump Squat 3x10'], burn: 320 },
  Saturday:  { focus: 'Active Recovery + Yoga',  ex: ['Light stretching 10 min', 'Hip flexor stretch', 'Pigeon pose', 'Foam rolling', 'Cat-cow flow', 'Childs pose'], burn: 150 },
  Sunday:    { focus: 'Rest Day',                ex: ['Full rest - let muscles repair'], burn: 80 }
};

function newDay() {
  return {
    date: new Date().toDateString(),
    cal: 0, protein: 0, water: 0, waterDone: false,
    gym: false, gymBurn: 0,
    spearmint: 0, lemon: false, flax: false, walnuts: false,
    supps: { vitD: false, b12: false, inositol: false, omega3: false },
    meals: []
  };
}

function loadDay() {
  try {
    if (fs.existsSync(DATA_F)) {
      const d = JSON.parse(fs.readFileSync(DATA_F, 'utf8'));
      if (d.date === new Date().toDateString()) return d;
    }
  } catch (e) {}
  return newDay();
}

function saveDay() {
  try { fs.writeFileSync(DATA_F, JSON.stringify(day, null, 2)); } catch (e) {}
}

let day = loadDay();
let chat = [];
let sock;

function getDOW() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' });
}

function getTime() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function buildContext() {
  const dow = getDOW();
  const g = GYM_SPLIT[dow] || GYM_SPLIT['Monday'];
  return `You are Bhumi's personal WhatsApp AI health coach, dietician, and gym trainer. Give hyper-personalised answers based on her exact medical reports. Be like a warm, knowledgeable best friend.

CURRENT TIME: ${getTime()} IST | Day: ${dow}
TODAY'S GYM PLAN: ${g.focus} — ${g.ex.slice(0, 3).join(', ')}

TODAY'S LIVE TRACKER:
- Calories: ${day.cal}/1500 kcal consumed (${Math.max(0, 1500 - day.cal)} kcal remaining)
- Protein: ${day.protein}/90g
- Water: ${day.water}/8 glasses
- Gym: ${day.gym ? 'Done! Burnt ~' + day.gymBurn + ' kcal' : 'Pending'}
- Spearmint tea: ${day.spearmint}/2 cups
- Lemon water: ${day.lemon ? 'Done' : 'Not done'}
- Flaxseeds: ${day.flax ? 'Done' : 'Not done'}
- Supplements: VitD:${day.supps.vitD ? 'Done' : 'Pending'} | B12:${day.supps.b12 ? 'Done' : 'Pending'} | Inositol:${day.supps.inositol ? 'Done' : 'Pending'} | Omega3:${day.supps.omega3 ? 'Done' : 'Pending'}
- Meals today: ${day.meals.length > 0 ? day.meals.map(m => m.t + ' ' + m.n + '(' + m.c + 'kcal)').join(', ') : 'None logged yet'}

BHUMI'S COMPLETE HEALTH PROFILE:
Age: 26F | Weight: 78kg | Height: 5ft 2in | BMI: 31.4 | Blood Group: AB Negative
Location: India | Lives alone, self-cooks | Night shift: 4:30pm-1:30am Mon-Fri
Wakes: 11am | Gym: 1pm | Sleeps: 2:30am

CONFIRMED MEDICAL CONDITIONS (from Oct 2025 reports):
- Bilateral PCOD: left ovary ENLARGED 15.53ml (normal <10ml), multiple peripheral follicles
- Grade-I Fatty Liver: diffuse bright echoes - FULLY REVERSIBLE with diet and exercise
- Pelvic inflammation: free fluid in Pouch of Douglas (inflammatory origin)
- Mildly bulky cervix
- Eosinophilia 9.4% - active systemic inflammation

KEY LAB VALUES:
- Vitamin D: 17.7 ng/mL - INSUFFICIENT (target 30-100)
- Vitamin B12: 157 pg/mL - SEVERELY DEFICIENT (target 211-911)
- HDL cholesterol: 41 mg/dL - LOW for women (needs 50+)
- Eosinophils: 9.4% - HIGH (normal 1-6%)
- RDW-CV: 14.4% - slightly high (mild anemia pattern)
NORMAL: Blood glucose 82, TSH 1.763, SGOT 19, SGPT 18, lipid profile good, kidneys normal

DIET: Vegetarian + eggs. No meat or fish. No regular dairy milk (worsens PCOD hormones).
Can eat: eggs, paneer, curd, A2 milk occasionally.

DAILY NUTRITION TARGETS:
Calories: 1500 kcal/day | Protein: 90g | Carbs: 150g (low-GI only) | Fat: 50g | Water: 8-10 glasses

PCOD AND FATTY LIVER MUST EAT DAILY:
- Lemon + turmeric water (morning liver detox)
- Spearmint tea x2/day (proven anti-androgen for PCOD)
- Flaxseeds 1 tbsp (lignans - most powerful natural anti-androgen)
- Walnuts 5-6 (omega-3, raises HDL)
- Turmeric and ginger (anti-inflammatory)
- 8-10 glasses water

ALLOWED: brown rice, oats, whole wheat roti, bajra, ragi, jowar, quinoa, all dals, rajma, chana, moong, paneer, curd, tofu max 2x/week, all vegetables, berries/apple/pear/guava, walnuts/almonds/flaxseeds/chia seeds

STRICTLY AVOID: sugar, maida, white rice, white bread, fried food, packaged food, fruit juices, regular dairy milk, eating after 11:30 PM, soy more than 2x/week, alcohol

SUPPLEMENT SCHEDULE:
- Vitamin D3: with breakfast (fat-soluble)
- B12 Methylcobalamin: before gym (energy)
- Myo-Inositol: with post-gym meal (PCOD insulin sensitivity)
- Omega-3 Algae-based: with dinner (anti-inflammatory)

YOUR FULL CAPABILITIES:
1. MEAL PHOTO ANALYSIS: identify food, estimate calories/protein/carbs/fat, rate PCOD safety, rate liver friendliness, give improvement tip, show running daily total
2. GYM VIDEO/IMAGE ANALYSIS: identify exercise, check posture in detail, estimate calories burnt, rate effectiveness 1-10, give 2-3 coaching cues
3. RECIPE GENERATOR: complete PCOD-safe recipe with ingredients, steps (max 20 mins), full nutrition breakdown
4. PRODUCT QUERIES: personalised yes/no for any food/supplement using her exact conditions
5. KITCHEN INVENTORY TO MEAL PLAN: full day plan from available ingredients only
6. DAILY PLAN: hour-by-hour schedule 11am to 2:30am
7. WEEKLY MEAL PLANNER: 7-day plan with full grocery list
8. FOOD ALTERNATIVES: 3 alternatives when she cannot eat something
9. HEALTH QUESTIONS: answered using her exact lab values
10. CALORIE COUNTER: running total updated every meal
11. DAMAGE CONTROL: non-judgmental recovery plan after cheat meal

RESPONSE STYLE:
- WhatsApp format using *bold* and _italics_
- Warm and friendly like a knowledgeable best friend
- Use Indian food names naturally: dal, roti, sabzi, makhana, chana, khichdi
- Short for simple questions, detailed for planning requests
- Celebrate every win genuinely
- Zero judgment on slip-ups, always focus on next right action`;
}

async function askAI(userMsg, imgData, imgMime) {
  try {
    let result;
    if (imgData && imgMime) {
      result = await model.generateContent([
        buildContext() + '\n\nBhumi sent a photo/video. Analyse it thoroughly as per your capabilities.',
        { inlineData: { data: imgData, mimeType: imgMime } },
        userMsg || 'Please analyse this'
      ]);
    } else {
      const history = chat.slice(-8).map(m => (m.r === 'u' ? 'Bhumi' : 'You') + ': ' + m.t).join('\n');
      const fullPrompt = buildContext() + (history ? '\n\nRECENT CONVERSATION:\n' + history : '') + '\n\n---\nBhumi: ' + userMsg + '\n\nYou:';
      result = await model.generateContent(fullPrompt);
    }
    const reply = result.response.text();
    chat.push({ r: 'u', t: userMsg });
    chat.push({ r: 'a', t: reply });
    if (chat.length > 20) chat = chat.slice(-20);
    parseNutrition(reply, userMsg);
    return reply;
  } catch (e) {
    console.error('AI error:', e.message);
    if (e.message && e.message.includes('quota')) return 'Hit free limit for a moment! Resets every minute - try again shortly 😊';
    return 'Quick glitch! Try again? I am here 💙';
  }
}

function parseNutrition(reply, userMsg) {
  const combined = (reply + ' ' + (userMsg || '')).toLowerCase();
  if (!combined.match(/cal|kcal|protein|ate|had|meal|food|breakfast|lunch|dinner|snack/)) return;
  const calMatch = reply.match(/[~]?\s*(\d{3,4})\s*kcal/i);
  if (calMatch) {
    const c = parseInt(calMatch[1]);
    if (c > 50 && c < 1200) {
      day.cal += c;
      const pm = reply.match(/(\d{1,3})g?\s*protein/i);
      if (pm) day.protein += Math.min(parseInt(pm[1]), 80);
      const foodNames = ['oats', 'eggs', 'dal', 'roti', 'rice', 'paneer', 'salad', 'khichdi', 'soup', 'chana', 'curd', 'banana', 'apple', 'rajma'];
      const found = foodNames.find(f => combined.includes(f)) || 'Meal';
      day.meals.push({
        t: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
        n: found.charAt(0).toUpperCase() + found.slice(1),
        c: c
      });
      saveDay();
    }
  }
}

function buildDashboard() {
  const dow = getDOW();
  const g = GYM_SPLIT[dow] || GYM_SPLIT['Monday'];
  const bar = (v, max) => {
    const filled = Math.min(10, Math.round((v / max) * 10));
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  };
  return `📊 *Daily Dashboard*\n━━━━━━━━━━━━━━\n\n🔥 *Calories* ${day.cal}/1500 kcal\n${bar(day.cal, 1500)} ${Math.round((day.cal / 1500) * 100)}%\n_${Math.max(0, 1500 - day.cal)} kcal remaining_\n\n🥩 *Protein* ${day.protein}/90g\n${bar(day.protein, 90)} ${Math.round((day.protein / 90) * 100)}%\n\n💧 *Water* ${day.water}/8 glasses\n${bar(day.water, 8)} ${Math.round((day.water / 8) * 100)}%\n\n━━━ *Checklist* ━━━\n${day.gym ? '✅' : '❌'} Gym: ${g.focus}\n${day.lemon ? '✅' : '❌'} Lemon + turmeric water\n${day.spearmint >= 1 ? '✅' : '❌'} Spearmint tea cup 1\n${day.spearmint >= 2 ? '✅' : '❌'} Spearmint tea cup 2\n${day.flax ? '✅' : '❌'} Flaxseeds 1 tbsp\n${day.walnuts ? '✅' : '❌'} Walnuts 5-6\n${day.supps.vitD ? '✅' : '❌'} Vitamin D3\n${day.supps.b12 ? '✅' : '❌'} B12 Methylcobalamin\n${day.supps.inositol ? '✅' : '❌'} Myo-Inositol\n${day.supps.omega3 ? '✅' : '❌'} Omega-3\n\n━━━ *Meals Today* ━━━\n${day.meals.length > 0 ? day.meals.map(m => m.t + ' — ' + m.n + ': ' + m.c + ' kcal').join('\n') : 'No meals logged yet'}\n\n${day.gym ? '🔥 Gym calories burnt: ~' + day.gymBurn + ' kcal' : '🏋️ Today gym: ' + g.focus}`;
}

async function send(text) {
  if (!sock || !MY_NUM) return;
  try {
    await sock.sendMessage(MY_NUM + '@s.whatsapp.net', { text });
  } catch (e) {
    console.error('Send error:', e.message);
  }
}

async function handleCommand(text) {
  const t = text.toLowerCase().trim();

  if (t === 'status' || t === 'dashboard' || t === 'today') {
    await send(buildDashboard()); return true;
  }
  if (t.match(/gym done|finished gym|completed gym|just gymmed/)) {
    const g = GYM_SPLIT[getDOW()] || GYM_SPLIT['Monday'];
    day.gym = true; day.gymBurn = g.burn; saveDay();
    await send(`🎉 *GYM DONE! That is what I am talking about!*\n\n💪 Today was: *${g.focus}*\n🔥 Estimated burn: *~${g.burn} kcal*\n\n⚡ *Post-gym meal window — eat within 45 mins!*\n\nBest options:\n• 2 eggs + brown rice + dal + salad\n• Paneer bhurji + whole wheat roti + curd\n• Rajma + rice + roasted veggies\n\n💊 Take your *Myo-Inositol* with this meal!\nSend me a photo! 📸`);
    return true;
  }
  if (t.match(/lemon done|had lemon|lemon water done/)) {
    day.lemon = true; saveDay();
    await send(`🍋 *Lemon + turmeric water done!*\n\nLiver detox activated! 🫀 This daily habit directly helps reverse your Grade-I fatty liver. Keep it up! 💪`);
    return true;
  }
  if (t.match(/flax done|flaxseed done|had flax/)) {
    day.flax = true; saveDay();
    await send(`🌱 *Flaxseeds logged!*\n\nLignans = most powerful natural anti-androgen for PCOD 🌸\nAlso raises your HDL from 41 toward 50+! ⭐`);
    return true;
  }
  if (t.match(/walnuts done|had walnuts/)) {
    day.walnuts = true; saveDay();
    await send(`🌰 *Walnuts logged!*\n\nOmega-3 + HDL booster! Clinically shown to improve PCOD hormone balance! 💪`);
    return true;
  }
  if (t.match(/spearmint done|mint tea done|had spearmint|had mint tea/)) {
    day.spearmint = Math.min(day.spearmint + 1, 2); saveDay();
    await send(`🍵 *Spearmint tea #${day.spearmint} logged!*\n\n${day.spearmint < 2 ? '1 more cup to go — best in the evening! 🌸' : '✅ Both cups done! PCOD anti-androgen protocol complete! 🌸'}`);
    return true;
  }
  if (t.match(/vitd done|vitamin d done|vit d done/)) {
    day.supps.vitD = true; saveDay();
    await send(`☀️ *Vitamin D3 logged!*\n\nYour level was 17.7 (needs 30+). Daily consistency is everything! Results in 8-12 weeks 📈`);
    return true;
  }
  if (t.match(/b12 done|took b12/)) {
    day.supps.b12 = true; saveDay();
    await send(`⚡ *B12 logged!*\n\nYour level was 157 pg/mL — critically low. This is your energy, mood, and hair medicine! Feel the difference in 4-6 weeks 💊`);
    return true;
  }
  if (t.match(/inositol done|took inositol/)) {
    day.supps.inositol = true; saveDay();
    await send(`🌸 *Myo-Inositol logged!*\n\nMost evidence-backed PCOD supplement! Improves insulin sensitivity + helps regulate cycles 🍱`);
    return true;
  }
  if (t.match(/omega3 done|omega-3 done|took omega/)) {
    day.supps.omega3 = true; saveDay();
    await send(`🌿 *Omega-3 logged!*\n\nRaises HDL from 41 toward 50+ • Reduces pelvic inflammation • Supports fatty liver reversal 🐟`);
    return true;
  }
  const waterMatch = t.match(/drank (\d+)|(\d+) glass/);
  if (waterMatch) {
    const glasses = parseInt(waterMatch[1] || waterMatch[2]);
    day.water = glasses;
    if (day.water >= 8 && !day.waterDone) {
      day.waterDone = true; saveDay();
      await send(`💧🎉 *WATER GOAL REACHED — 8 glasses!*\n\nYour liver, PCOD hormones, and kidneys are celebrating! 🎊 No more water reminders today! 🙌`);
    } else {
      saveDay();
      await send(`💧 Water updated: *${day.water}/8 glasses*\n${8 - day.water > 0 ? (8 - day.water) + ' more to go! 🌊' : 'Goal hit! 🎉'}`);
    }
    return true;
  }
  return false;
}

function setupSchedules() {
  cron.schedule('0 11 * * *', async () => {
    const g = GYM_SPLIT[getDOW()] || GYM_SPLIT['Monday'];
    await send(`🌅 *Good morning Bhumi!*\n\n*Morning ritual — do these NOW:*\n🍋 Lemon + turmeric water → reply _"lemon done"_\n🌱 1 tbsp flaxseeds in breakfast\n☀️ Vitamin D3 with food\n\n*Today's gym: ${g.focus}*\n${g.ex.slice(0, 3).join(' | ')}\n\nWhat are you having for breakfast? Send a photo! 📸`);
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('45 11 * * *', async () => {
    if (!day.flax) await send(`🌱 *Flaxseed reminder!*\nAdd 1 tbsp ground flaxseeds to breakfast!\nReply _"flax done"_ ✅`);
    if (!day.supps.vitD) await send(`☀️ *Vitamin D3 — take with food now!*\nYour level is only 17.7 (needs 30+) — critical!\nReply _"vitd done"_ ✅`);
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 12 * * *', async () => {
    if (!day.walnuts) await send(`🌰 *Walnut reminder!* 5-6 walnuts now!\nBest veg omega-3 for your HDL (currently 41, needs 50+)!\nReply _"walnuts done"_ 💪`);
    if (!day.supps.b12) await send(`⚡ *B12 — take before gym!*\nYour level was 157 (critically low). Pre-workout is perfect timing!\nReply _"b12 done"_ ✅`);
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('30 12 * * 1-5', async () => {
    const g = GYM_SPLIT[getDOW()] || GYM_SPLIT['Monday'];
    await send(`🏋️ *Gym in 30 minutes!*\n\n*Pre-workout snack now:*\n• Small banana + 5 almonds, OR\n• Small bowl curd + walnuts\n\n⚡ B12 if not done! → _"b12 done"_\n\n*Today: ${g.focus}*\n🔥 Target burn: ~${g.burn} kcal`);
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 15 * * *', async () => {
    if (!day.supps.inositol) await send(`🌸 *Myo-Inos
