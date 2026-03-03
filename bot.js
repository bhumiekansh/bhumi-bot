require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cron = require('node-cron');
const fs = require('fs');

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
let waBot;

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
Location: Lucknow, India | Lives alone, self-cooks | Night shift: 4:30pm-1:30am Mon-Fri
Wakes: 11am | Gym: 1pm | Sleeps: 2:30am

CONFIRMED MEDICAL CONDITIONS (from Oct 2025 reports):
- Bilateral PCOD: left ovary ENLARGED 15.53ml (normal less than 10ml), multiple peripheral follicles
- Grade-I Fatty Liver: diffuse bright echoes on ultrasound - FULLY REVERSIBLE with diet and exercise
- Pelvic inflammation: free fluid in Pouch of Douglas (inflammatory origin)
- Mildly bulky cervix
- Eosinophilia 9.4% - active systemic inflammation marker

KEY LAB VALUES:
- Vitamin D: 17.7 ng/mL - INSUFFICIENT (target 30-100)
- Vitamin B12: 157 pg/mL - SEVERELY DEFICIENT (target 211-911)
- HDL cholesterol: 41 mg/dL - LOW for women (needs 50+)
- Eosinophils: 9.4% - HIGH (normal 1-6%)
- RDW-CV: 14.4% - slightly high (mild anemia pattern)
NORMAL RESULTS: Blood glucose 82, TSH 1.763, SGOT 19, SGPT 18, lipid profile good, kidneys normal

DIET: Vegetarian + eggs. No meat or fish. No regular dairy milk (worsens PCOD hormones).
Can eat: eggs, paneer, curd, A2 milk occasionally.

DAILY NUTRITION TARGETS:
Calories: 1500 kcal/day | Protein: 90g | Carbs: 150g (low-GI only) | Fat: 50g | Water: 8-10 glasses

PCOD AND FATTY LIVER DIET RULES:
MUST EAT DAILY:
- Lemon + turmeric water first thing every morning (liver detox)
- Spearmint tea x2 per day (natural anti-androgen for PCOD - clinically proven)
- Flaxseeds 1 tbsp (lignans - most powerful natural anti-androgen)
- Walnuts 5-6 (omega-3, raises HDL)
- Turmeric and ginger (anti-inflammatory for pelvic fluid)
- 8-10 glasses water

ALLOWED FOODS:
Grains (low-GI only): brown rice, oats, whole wheat roti, bajra, ragi, jowar, quinoa, barley
Protein: eggs max 2/day, all dals, rajma, chana, moong, paneer, curd, tofu max 2x/week
All vegetables especially leafy greens, broccoli, beetroot, carrot
Fruits max 2/day whole fruit only: berries, apple, pear, guava, pomegranate
Healthy fats: walnuts, almonds, flaxseeds, chia seeds, pumpkin seeds, olive oil

STRICTLY AVOID:
- Sugar in any form, maida, white rice, white bread, biscuits
- Regular dairy milk (use oat milk, almond milk, or A2 milk instead)
- Fried food of any kind (worsens both PCOD and fatty liver)
- Packaged and processed food, chips, namkeen
- Fruit juices (eat whole fruit only)
- Soy products more than 2x per week (phytoestrogens worsen PCOD)
- Eating after 11:30 PM (critical for both PCOD and fatty liver)
- Alcohol

SUPPLEMENT SCHEDULE (all prescribed):
- Vitamin D3: take with breakfast (fat-soluble, needs food)
- B12 Methylcobalamin: take before gym (energy conversion)
- Myo-Inositol: take with post-gym meal (PCOD insulin sensitivity)
- Omega-3 Algae-based: take with dinner (anti-inflammatory)

YOUR FULL CAPABILITIES - answer all of these:

1. MEAL PHOTO ANALYSIS: When photo received, identify every food item, estimate calories + protein + carbs + fat precisely, rate PCOD safety (Safe/Moderate/Avoid), rate liver friendliness, give one specific improvement tip, show updated running daily total

2. GYM VIDEO OR IMAGE ANALYSIS: Identify exercise being performed, check posture and form in detail (what is correct, what needs fixing), estimate calories burnt, rate workout effectiveness 1-10, give 2-3 specific coaching cues, say if it matches today's planned workout, suggest what to do next in the session

3. RECIPE GENERATOR: When asked for any recipe, give complete PCOD-safe version with exact ingredients and quantities, step-by-step instructions (max 20 minutes, solo cooking friendly), full nutrition breakdown, any PCOD-specific modifications

4. PRODUCT AND INGREDIENT QUERIES: Answer any "is X good for me?" question with personalised yes or no using her exact conditions and lab values

5. KITCHEN INVENTORY TO MEAL PLAN: When she lists available ingredients, create full day meal plan using only those ingredients, all PCOD-safe combinations, calorie counts per meal, shopping list for missing essentials

6. DAILY PLAN GENERATOR: Full hour-by-hour schedule from 11am to 2:30am including wake rituals, all meals with recipes, gym plan, supplements, work shift, sleep

7. WEEKLY MEAL PLANNER: Full 7-day plan Monday to Sunday with all meals, variety, and complete grocery list

8. SMART FOOD ALTERNATIVES: When she says she cannot eat something or does not have it, give 3 alternatives with same nutrition, explain why each works for her PCOD and fatty liver

9. HEALTH QUESTIONS: Answer any health question using her exact lab values. Examples: why am I tired (B12 157), why belly fat (PCOD insulin resistance), will PCOD be cured (honest encouraging answer), what exercises help PCOD

10. RUNNING CALORIE COUNTER: Every meal mentioned or photographed updates the daily total shown as eaten/1500 kcal

11. DAMAGE CONTROL: When she overeats or has a cheat meal, give non-judgmental recovery plan for rest of the day

RESPONSE STYLE:
- WhatsApp format using bold with asterisks and italics with underscores
- Warm and friendly like a knowledgeable best friend
- Use Indian food names naturally: dal, roti, sabzi, makhana, chana, khichdi
- Short messages for simple questions, detailed for planning requests
- Celebrate every win with genuine enthusiasm
- Never be preachy, never repeat warnings she already knows
- Zero judgment on slip-ups, always focus on next right action`;
}

async function askAI(userMsg, imgData, imgMime) {
  try {
    let result;
    if (imgData && imgMime) {
      result = await model.generateContent([
        buildContext() + '\n\nBhumi sent a photo or video. Analyse it thoroughly as per your capabilities above.',
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
  return `📊 *Daily Dashboard*
━━━━━━━━━━━━━━

🔥 *Calories* ${day.cal}/1500 kcal
${bar(day.cal, 1500)} ${Math.round((day.cal / 1500) * 100)}%
_${Math.max(0, 1500 - day.cal)} kcal remaining_

🥩 *Protein* ${day.protein}/90g
${bar(day.protein, 90)} ${Math.round((day.protein / 90) * 100)}%

💧 *Water* ${day.water}/8 glasses
${bar(day.water, 8)} ${Math.round((day.water / 8) * 100)}%

━━━ *Checklist* ━━━
${day.gym ? '✅' : '❌'} Gym: ${g.focus}
${day.lemon ? '✅' : '❌'} Lemon + turmeric water
${day.spearmint >= 1 ? '✅' : '❌'} Spearmint tea cup 1
${day.spearmint >= 2 ? '✅' : '❌'} Spearmint tea cup 2
${day.flax ? '✅' : '❌'} Flaxseeds 1 tbsp
${day.walnuts ? '✅' : '❌'} Walnuts 5-6
${day.supps.vitD ? '✅' : '❌'} Vitamin D3
${day.supps.b12 ? '✅' : '❌'} B12 Methylcobalamin
${day.supps.inositol ? '✅' : '❌'} Myo-Inositol
${day.supps.omega3 ? '✅' : '❌'} Omega-3

━━━ *Meals Today* ━━━
${day.meals.length > 0 ? day.meals.map(m => m.t + ' — ' + m.n + ': ' + m.c + ' kcal').join('\n') : 'No meals logged yet'}

${day.gym ? '🔥 Gym calories burnt: ~' + day.gymBurn + ' kcal' : '🏋️ Today gym: ' + g.focus}`;
}

async function send(text) {
  if (!waBot || !MY_NUM) return;
  try {
    await waBot.sendMessage(MY_NUM + '@c.us', text);
  } catch (e) {
    console.error('Send error:', e.message);
  }
}

async function handleCommand(text) {
  const t = text.toLowerCase().trim();

  if (t === 'status' || t === 'dashboard' || t === 'today') {
    await send(buildDashboard());
    return true;
  }

  if (t.match(/gym done|finished gym|completed gym|just gymmed/)) {
    const dow = getDOW();
    const g = GYM_SPLIT[dow] || GYM_SPLIT['Monday'];
    day.gym = true;
    day.gymBurn = g.burn;
    saveDay();
    await send(`🎉 *GYM DONE! That is what I am talking about!*\n\n💪 Today was: *${g.focus}*\n🔥 Estimated burn: *~${g.burn} kcal*\n\n⚡ *Post-gym meal window is open — eat within 45 mins!*\n\nBest options right now:\n• 2 eggs + brown rice + dal + salad\n• Paneer bhurji + whole wheat roti + curd\n• Rajma + rice + roasted veggies\n\n💊 Take your *Myo-Inositol* with this meal!\nSend me a photo! 📸`);
    return true;
  }

  if (t.match(/lemon done|had lemon|lemon water done/)) {
    day.lemon = true;
    saveDay();
    await send(`🍋 *Lemon + turmeric water done!*\n\nLiver detox activated for today! 🫀\nThis daily habit directly helps reverse your Grade-I fatty liver.\nKeep this up every single morning! 💪`);
    return true;
  }

  if (t.match(/flax done|flaxseed done|had flax/)) {
    day.flax = true;
    saveDay();
    await send(`🌱 *Flaxseeds logged!*\n\nLignans in flax = most powerful natural anti-androgen for PCOD 🌸\nAlso raises your HDL from 41 toward 50+\nGold star today! ⭐`);
    return true;
  }

  if (t.match(/walnuts done|had walnuts/)) {
    day.walnuts = true;
    saveDay();
    await send(`🌰 *Walnuts logged!*\n\nOmega-3 + brain food + HDL booster!\nClinically shown to improve PCOD hormone balance with daily use! 💪`);
    return true;
  }

  if (t.match(/spearmint done|mint tea done|had spearmint|had mint tea/)) {
    day.spearmint = Math.min(day.spearmint + 1, 2);
    saveDay();
    await send(`🍵 *Spearmint tea #${day.spearmint} logged!*\n\n${day.spearmint < 2 ? '1 more cup to go — best in the evening!\nNatural anti-androgen working for your PCOD 🌸' : '✅ Both cups done! PCOD anti-androgen protocol complete for today! 🌸'}`);
    return true;
  }

  if (t.match(/vitd done|vitamin d done|vit d done/)) {
    day.supps.vitD = true;
    saveDay();
    await send(`☀️ *Vitamin D3 logged!*\n\nYour level was 17.7 (needs 30+). Daily consistency is everything!\nAlways take WITH food for best absorption!\nResults show in 8-12 weeks 📈`);
    return true;
  }

  if (t.match(/b12 done|took b12/)) {
    day.supps.b12 = true;
    saveDay();
    await send(`⚡ *B12 Methylcobalamin logged!*\n\nYour level was 157 pg/mL — critically low.\nThis is your energy, mood, and hair medicine!\nFeel the difference in 4-6 weeks of daily dosing 💊`);
    return true;
  }

  if (t.match(/inositol done|took inositol/)) {
    day.supps.inositol = true;
    saveDay();
    await send(`🌸 *Myo-Inositol logged!*\n\nMost evidence-backed PCOD supplement!\n• Improves insulin sensitivity\n• Helps regulate cycles\n• Directly helps your enlarged left ovary\nBest taken with your post-gym meal 🍱`);
    return true;
  }

  if (t.match(/omega3 done|omega-3 done|took omega/)) {
    day.supps.omega3 = true;
    saveDay();
    await send(`🌿 *Omega-3 logged!*\n\nPerfect with dinner!\n• Raises HDL from 41 toward 50+\n• Reduces pelvic inflammation\n• Supports fatty liver reversal\nAlgae-based = veg-friendly and just as effective! 🐟`);
    return true;
  }

  const waterMatch = t.match(/drank (\d+)|(\d+) glass/);
  if (waterMatch) {
    const glasses = parseInt(waterMatch[1] || waterMatch[2]);
    day.water = glasses;
    if (day.water >= 8 && !day.waterDone) {
      day.waterDone = true;
      saveDay();
      await send(`💧🎉 *WATER GOAL REACHED — 8 glasses!*\n\nYour liver, PCOD hormones, and kidneys are all celebrating! 🎊\nNo more water reminders today — you crushed it! 🙌`);
    } else {
      saveDay();
      await send(`💧 Water updated: *${day.water}/8 glasses*\n${8 - day.water > 0 ? (8 - day.water) + ' more to go! Keep sipping 🌊' : 'Goal hit! 🎉'}`);
    }
    return true;
  }

  if (t === 'weekly report') {
    await send('Weekly tracking coming soon! Keep logging meals daily and I will have your full report card ready 📊');
    return true;
  }

  return false;
}

function setupSchedules() {
  // 11:00 AM - Good morning + daily plan
  cron.schedule('0 11 * * *', async () => {
    const dow = getDOW();
    const g = GYM_SPLIT[dow] || GYM_SPLIT['Monday'];
    await send(`🌅 *Good morning Bhumi!*\n\n*Morning ritual — do these NOW:*\n🍋 Lemon + turmeric water → reply _"lemon done"_\n🌱 1 tbsp flaxseeds in breakfast\n☀️ Vitamin D3 with food\n\n*Today's gym: ${g.focus}*\n${g.ex.slice(0, 3).join(' | ')}\n\nWhat are you having for breakfast? Send a photo! 📸`);
  }, { timezone: 'Asia/Kolkata' });

  // 11:15 AM - Full gym plan
  cron.schedule('15 11 * * *', async () => {
    const dow = getDOW();
    const g = GYM_SPLIT[dow] || GYM_SPLIT['Monday'];
    if (g.focus === 'Rest Day') {
      await send(`😴 *Today is Rest Day!*\n\nActive recovery options:\n• 20-30 min gentle walk\n• Light stretching and yoga\n• Foam rolling sore muscles\n\nRest is when muscles actually grow stronger 💪\nFocus today: perfect nutrition and hydration 💧`);
      return;
    }
    await send(`🏋️ *Today's Full Workout — ${g.focus}*\n\n${g.ex.map((e, i) => (i + 1) + '. ' + e).join('\n')}\n\n🔥 *Estimated burn: ~${g.burn} kcal*\n\n💡 *Form tip:* Focus on mind-muscle connection — feel the target muscle, do not just move the weight!\n\n📸 Send me a gym video and I will check your form! 🎥\n⚡ Take your *B12* before you go!`);
  }, { timezone: 'Asia/Kolkata' });

  // 11:10 AM - Lemon water reminder if not done
  cron.schedule('10 11 * * *', async () => {
    if (day.lemon) return;
    await send(`🍋 *Lemon + turmeric water reminder!*\n\n1 glass warm water + juice of half lemon + pinch turmeric\nThis is your liver's daily detox signal! 🫀\n\nReply _"lemon done"_ to log it ✅`);
  }, { timezone: 'Asia/Kolkata' });

  // 11:45 AM - Flaxseed reminder
  cron.schedule('45 11 * * *', async () => {
    if (day.flax) return;
    await send(`🌱 *Flaxseed reminder!*\n\nAdd 1 tbsp ground flaxseeds to your breakfast!\nCan mix into oats, curd, smoothie, or roti dough\nYour daily PCOD anti-androgen! 🌸\n\nReply _"flax done"_ ✅`);
  }, { timezone: 'Asia/Kolkata' });

  // 12:00 PM - Walnut reminder
  cron.schedule('0 12 * * *', async () => {
    if (day.walnuts) return;
    await send(`🌰 *Walnut reminder!*\n\n5-6 walnuts with breakfast or mid-morning snack\nBest veg omega-3 source for your HDL (currently 41, needs 50+)!\nReply _"walnuts done"_ 💪`);
  }, { timezone: 'Asia/Kolkata' });

  // 12:00 PM - B12 reminder
  cron.schedule('0 12 * * *', async () => {
    if (day.supps.b12) return;
    await send(`⚡ *B12 Methylcobalamin — take NOW before gym!*\n\nB12 converts food into energy — perfect pre-workout!\nYour level was 157 (critically low). This daily dose is your energy medicine!\nReply _"b12 done"_ ✅`);
  }, { timezone: 'Asia/Kolkata' });

  // 11:15 AM - Vitamin D reminder
  cron.schedule('15 11 * * *', async () => {
    if (day.supps.vitD) return;
    await send(`☀️ *Vitamin D3 — take with breakfast!*\n\nFat-soluble vitamin absorbs best with food!\nYour level is only 17.7 (needs 30+) — this is critical!\nReply _"vitd done"_ ✅`);
  }, { timezone: 'Asia/Kolkata' });

  // 12:30 PM - Pre-gym reminder weekdays
  cron.schedule('30 12 * * 1-5', async () => {
    const dow = getDOW();
    const g = GYM_SPLIT[dow] || GYM_SPLIT['Monday'];
    await send(`🏋️ *Gym in 30 minutes!*\n\n*Pre-workout snack (eat now):*\n• Small banana + 5 almonds, OR\n• Small bowl curd + walnuts\n\n⚡ Take your *B12* if not done! Reply _"b12 done"_ 💊\n\n*Today: ${g.focus}*\n🔥 Target burn: ~${g.burn} kcal\n\nSend me a gym video — I will analyse your form! 🎥`);
  }, { timezone: 'Asia/Kolkata' });

  // 3:00 PM - Post gym meal (Inositol reminder)
  cron.schedule('0 15 * * *', async () => {
    if (!day.supps.inositol) {
      await send(`🌸 *Myo-Inositol — take with your post-gym meal!*\n\nBest time for absorption and PCOD insulin effect!\nProven to improve ovarian function and regulate hormones.\nReply _"inositol done"_ ✅`);
    }
  }, { timezone: 'Asia/Kolkata' });

  // Water reminders every 90 minutes until goal hit
  ['30 11', '0 13', '30 14', '0 16', '30 17', '0 19', '30 20', '0 22', '30 23'].forEach(t => {
    cron.schedule(t + ' * * *', async () => {
      if (day.waterDone || day.water >= 8) return;
      const remaining = 8 - day.water;
      const options = [
        `💧 *Water check!* ${day.water}/8 glasses\n${remaining} more needed! Water flushes excess androgens from PCOD 🌊\nReply _"drank X glasses"_ to update!`,
        `🥤 *Hydration reminder!* ${day.water}/8 glasses so far\n${remaining} more to go! Your fatty liver heals faster when well hydrated 💧`,
        `💧 ${day.water} of 8 glasses done. ${remaining} to go!\nSet a glass next to you RIGHT NOW 🥛`,
        `🌊 *Water reminder!* ${remaining} glasses still needed.\nPelvic inflammation reduces faster when you are properly hydrated! 🌸`
      ];
      await send(options[Math.floor(Math.random() * options.length)]);
    }, { timezone: 'Asia/Kolkata' });
  });

  // 6:00 PM - Spearmint tea reminder
  cron.schedule('0 18 * * *', async () => {
    if (day.spearmint >= 2) return;
    await send(`🍵 *Spearmint tea reminder!*\n\n${day.spearmint === 0 ? 'No cups yet today!' : '1 more cup to go!'}\nSpearmint tea = proven natural anti-androgen for PCOD 🌸\nReduces testosterone levels clinically — 2 cups daily is your target!\nReply _"spearmint done"_ ✅`);
  }, { timezone: 'Asia/Kolkata' });

  // 7:00 PM - Mid shift snack weekdays
  cron.schedule('0 19 * * 1-5', async () => {
    await send(`🍵 *Mid-shift snack time!*\n\n📊 So far today: ${day.cal}/1500 kcal\n\n*Smart desk snacks:*\n• Roasted makhana plain\n• Handful roasted chana\n• Apple or guava\n• Mixed seeds\n\n🍵 2nd spearmint tea now! Reply _"spearmint done"_ 🌸\n\nHow is the shift going? 🌙`);
  }, { timezone: 'Asia/Kolkata' });

  // 10:00 PM - Light dinner reminder
  cron.schedule('0 22 * * *', async () => {
    const remaining = Math.max(0, 1500 - day.cal);
    await send(`🌙 *Dinner time — keep it light!*\n\n_${remaining} kcal remaining today_\n\n*Liver-friendly options:*\n• Moong dal soup + 1 roti\n• Vegetable khichdi small bowl\n• Curd + cucumber\n• Palak soup + boiled egg\n\n❌ No heavy carbs after 10pm!\nSend a photo 📸`);
  }, { timezone: 'Asia/Kolkata' });

  // 10:00 PM - Omega-3 reminder
  cron.schedule('0 22 * * *', async () => {
    if (day.supps.omega3) return;
    await send(`🌿 *Omega-3 with dinner — take now!*\n\nRaises HDL from 41 toward 50+\nReduces pelvic inflammation\nSupports fatty liver reversal\nReply _"omega3 done"_ ✅`);
  }, { timezone: 'Asia/Kolkata' });

  // 11:00 PM - Cut-off warning
  cron.schedule('0 23 * * *', async () => {
    await send(`⏰ *30 minutes left to eat!*\n\nStop all food by 11:30pm — your liver enters repair mode! 🫀\nEating after this = fat storage + worsens fatty liver\n\nIf hungry after 11:30: max 1 glass warm A2 milk or small curd only.`);
  }, { timezone: 'Asia/Kolkata' });

  // 1:30 AM - End of day report
  cron.schedule('30 1 * * *', async () => {
    const grade = (day.gym && day.cal <= 1500 && day.water >= 7) ? 'A 🏆' :
      (day.gym || day.cal <= 1500) ? 'B 💪' : 'C 📈';
    await send(`🌟 *End of Day Report*\n\n🔥 Calories: ${day.cal}/1500 ${day.cal <= 1500 ? '✅' : '⚠️'}\n🥩 Protein: ${day.protein}/90g\n💧 Water: ${day.water}/8 ${day.water >= 8 ? '✅' : '⚠️'}\n🏋️ Gym: ${day.gym ? '✅ Done' : '❌ Missed'}\n🌱 Flaxseeds: ${day.flax ? '✅' : '❌'}\n🍵 Spearmint: ${day.spearmint}/2 ${day.spearmint >= 2 ? '✅' : '⚠️'}\n⚡ B12: ${day.supps.b12 ? '✅' : '❌'}\n\n*Grade: ${grade}*\n\n${grade.includes('A') ? 'Perfect day! PCOD and fatty liver healing in action! 🌸' : grade.includes('B') ? 'Good effort! One or two things to tighten tomorrow 💪' : "Tomorrow is a fresh start! Small steps equal big results 🌱"}\n\nSleep by 2:30am — PCOD hormones reset during deep sleep! 😴`);

    // Reset for new day
    day = newDay();
    chat = [];
    saveDay();
  }, { timezone: 'Asia/Kolkata' });

  // Sunday 10:00 AM - Weekly planning
  cron.schedule('0 10 * * 0', async () => {
    await send(`📅 *Sunday Planning Mode!* 🌸\n\nStart your week right:\n_"plan my week"_ → 7-day meal plan\n_"weekly report"_ → how last week went\n\n📏 *Weekly measurements — after bathroom, before food:*\n• Weight on scale\n• Waist measurement at belly button\n• Hip measurement\n\nSend me the numbers! Measurements tell more than weight alone with PCOD 💪`);
  }, { timezone: 'Asia/Kolkata' });

  // Saturday 10:00 AM - Meal prep
  cron.schedule('0 10 * * 6', async () => {
    await send(`🍳 *Saturday Meal Prep — 30 mins = healthy week!*\n\n*Prep list:*\n□ Boil 8 eggs\n□ Big batch dal 3-4 cups\n□ Soak rajma or chana overnight\n□ Chop onions and veggies in bulk\n□ Make seed mix jar: flax + chia + pumpkin\n□ Spearmint tea in fridge 1 litre\n\n30 minutes now means no excuses after night shifts all week! 💪`);
  }, { timezone: 'Asia/Kolkata' });

  console.log('All schedules set up successfully');
}

async function onMessage(msg) {
  const senderNum = msg.from.replace('@c.us', '');
  if (senderNum !== MY_NUM) return;

  const text = (msg.body || '').trim();
  console.log('Message from Bhumi: ' + text.substring(0, 60));

  const handled = await handleCommand(text);
  if (handled) return;

  let imgData = null;
  let imgMime = null;
  let prompt = text;

  if (msg.hasMedia) {
    try {
      const media = await msg.downloadMedia();
      if (!media) throw new Error('No media data');

      if (media.mimetype && media.mimetype.startsWith('image/')) {
        imgData = media.data;
        imgMime = media.mimetype;
        prompt = text || 'Analyse this meal photo. Identify all food items, estimate calories, protein, carbs, fat. Is it PCOD-safe and liver-friendly? Give me the running daily total.';
        console.log('Photo received - sending for meal analysis');

      } else if (media.mimetype && media.mimetype.startsWith('video/')) {
        imgData = media.data;
        imgMime = 'image/jpeg';
        const dow = getDOW();
        const g = GYM_SPLIT[dow] || GYM_SPLIT['Monday'];
        prompt = 'GYM VIDEO RECEIVED. Please analyse: 1) Identify the exercise being performed 2) Check posture and form in detail - what is correct and what needs fixing 3) Estimate calories burnt 4) Rate workout effectiveness 1-10 5) Give 2-3 specific coaching cues 6) Does this match today planned workout: ' + g.focus + '? 7) What should she do next in this session?';
        day.gym = true;
        day.gymBurn = g.burn || 250;
        saveDay();
        console.log('Gym video received - sending for form analysis');
      }
    } catch (e) {
      console.error('Media error:', e.message);
      await send("Could not download that file 😅 Try sending it again?");
      return;
    }
  }

  if (!prompt && !imgData) return;

  const reply = await askAI(prompt, imgData, imgMime);
  await send(reply);

  if (imgData && imgMime && imgMime.startsWith('image/') && day.meals.length > 0) {
    const lastMeal = day.meals[day.meals.length - 1];
    if (lastMeal && lastMeal.c > 0) {
      setTimeout(async () => {
        await send(`📊 *Running Total: ${day.cal}/1500 kcal*\n🥩 Protein: ${day.protein}/90g | 💧 Water: ${day.water}/8\n_${Math.max(0, 1500 - day.cal)} kcal remaining today_`);
      }, 2000);
    }
  }
}

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'bhumi-cloud',
    dataPath: '/tmp/.wwebjs_auth'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--disable-extensions'
    ]
  }
});

client.on('qr', qr => {
  console.log('\n============================================');
  console.log('   SCAN THIS QR CODE WITH YOUR WHATSAPP');
  console.log('============================================\n');
  qrcode.generate(qr, { small: true });
  console.log('\nOn iPhone: WhatsApp > Settings > Linked Devices > Link a Device\n');
});

client.on('ready', async () => {
  waBot = client;
  console.log('Bot is LIVE and ready!');
  setupSchedules();
  setTimeout(async () => {
    const dow = getDOW();
    const g = GYM_SPLIT[dow] || GYM_SPLIT['Monday'];
    await send(`🌸 *Your AI Health Coach is LIVE!*\n\nHey Bhumi! I am your personal health companion, ready 24/7.\n\n*What I can do:*\n📸 Send meal photos → calorie and PCOD analysis\n🎥 Send gym videos → form check and calories burnt\n💧 Water reminders every 90 mins until goal\n💊 Supplement alerts at optimal times\n🌱 Seed reminders daily\n\n*Commands:*\n📊 _"status"_ → full daily dashboard\n📅 _"plan my day"_ → full schedule\n🍳 _"recipe for dal"_ → PCOD-safe recipe\n❓ _"is oat milk ok?"_ → personalised answer\n\n*Today's gym: ${g.focus}*\n\nHow are you feeling today? 🌟`);
  }, 3000);
});

client.on('message', onMessage);

client.on('disconnected', reason => {
  console.log('Disconnected: ' + reason + ' - reconnecting in 5 seconds...');
  setTimeout(() => client.initialize(), 5000);
});

client.on('auth_failure', () => {
  console.log('Authentication failed. The session may have expired.');
  process.exit(1);
});

console.log('Starting Bhumi AI Health Coach...');
client.initialize();
