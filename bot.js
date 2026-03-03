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
  Monday:    { focus: 'Lower Body + Glutes',   ex: ['Squats 3x15', 'Lunges 3x12', 'Hip Thrusts 3x15', 'Leg Press 3x15', 'Leg Curl 3x12', 'Calf Raises 3x20'], burn: 280 },
  Tuesday:   { focus: 'Upper Body + Arms',      ex: ['Chest Press 3x12', 'Shoulder Press 3x12', 'Lat Pulldown 3x12', 'Bicep Curl 3x15', 'Tricep Pushdown 3x15', 'Face Pulls 3x15'], burn: 240 },
  Wednesday: { focus: 'HIIT + Core',            ex: ['Burpees 3x10', 'Mountain Climbers 3x30s', 'Plank 3x45s', 'Russian Twist 3x20', 'Leg Raises 3x15', 'Dead Bug 3x10'], burn: 340 },
  Thursday:  { focus: 'Back + Posterior Chain', ex: ['Deadlift 3x10', 'Seated Row 3x12', 'Single Arm Row 3x12', 'Reverse Fly 3x15', 'Superman Hold 3x30s', 'Good Mornings 3x12'], burn: 260 },
  Friday:    { focus: 'Lower Body + Cardio',    ex: ['Sumo Squat 3x15', 'Bulgarian Split 3x10', 'Glute Kickback 3x15', 'Inner Thigh Press 3x15', 'Step Ups 3x12', 'Jump Squat 3x10'], burn: 320 },
  Saturday:  { focus: 'Active Recovery + Yoga', ex: ['Light stretching 10 min', 'Hip flexor stretch', 'Pigeon pose', 'Foam rolling', 'Cat-cow flow', 'Childs pose'], burn: 150 },
  Sunday:    { focus: 'Rest Day',               ex: ['Full rest - let muscles repair'], burn: 80 }
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

CONFIRMED MEDICAL CONDITIONS:
- Bilateral PCOD: left ovary ENLARGED 15.53ml (normal less than 10ml), multiple peripheral follicles
- Grade-I Fatty Liver: FULLY REVERSIBLE with diet and exercise
- Pelvic inflammation: free fluid in Pouch of Douglas
- Mildly bulky cervix
- Eosinophilia 9.4%

KEY LAB VALUES:
- Vitamin D: 17.7 ng/mL - INSUFFICIENT (target 30-100)
- Vitamin B12: 157 pg/mL - SEVERELY DEFICIENT (target 211-911)
- HDL cholesterol: 41 mg/dL - LOW (needs 50+)
- Eosinophils: 9.4% - HIGH (normal 1-6%)
- RDW-CV: 14.4% slightly high
NORMAL: Blood glucose 82, TSH 1.763, SGOT 19, SGPT 18, lipid profile good, kidneys normal

DIET: Vegetarian plus eggs. No meat or fish. No regular dairy milk.
Can eat: eggs, paneer, curd, A2 milk occasionally.

DAILY TARGETS: 1500 kcal | 90g protein | 150g carbs low-GI only | 50g fat | 8-10 glasses water

MUST EAT DAILY: lemon+turmeric water, spearmint tea x2, flaxseeds 1 tbsp, walnuts 5-6, turmeric+ginger, 8-10 glasses water

ALLOWED: brown rice, oats, whole wheat roti, bajra, ragi, jowar, quinoa, all dals, rajma, chana, moong, paneer, curd, tofu max 2x/week, all vegetables, berries/apple/pear/guava, walnuts/almonds/flaxseeds/chia seeds

STRICTLY AVOID: sugar, maida, white rice, white bread, fried food, packaged food, fruit juices, regular dairy milk, eating after 11:30 PM, soy more than 2x/week, alcohol

SUPPLEMENTS: VitD3 with breakfast | B12 before gym | Myo-Inositol with post-gym meal | Omega-3 with dinner

CAPABILITIES: meal photo analysis with calories, gym video form check, PCOD-safe recipes, product queries, meal planning from ingredients, daily schedule, weekly planner, food alternatives, health questions using lab values, running calorie counter, damage control after cheat meals.

STYLE: WhatsApp format with *bold* and _italics_, warm best-friend tone, Indian food names, zero judgment, celebrate every win.`;
}

async function askAI(userMsg, imgData, imgMime) {
  try {
    let result;
    if (imgData && imgMime) {
      result = await model.generateContent([
        buildContext() + '\n\nBhumi sent a photo or video. Analyse it thoroughly.',
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
    if (e.message && e.message.includes('quota')) return 'Hit free limit for a moment! Resets every minute - try again shortly';
    return 'Quick glitch! Try again? I am here';
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
    return '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
  };
  return '*Daily Dashboard*\n\n'
    + '*Calories* ' + day.cal + '/1500 kcal\n' + bar(day.cal, 1500) + ' ' + Math.round((day.cal / 1500) * 100) + '%\n_' + Math.max(0, 1500 - day.cal) + ' kcal remaining_\n\n'
    + '*Protein* ' + day.protein + '/90g\n' + bar(day.protein, 90) + ' ' + Math.round((day.protein / 90) * 100) + '%\n\n'
    + '*Water* ' + day.water + '/8 glasses\n' + bar(day.water, 8) + ' ' + Math.round((day.water / 8) * 100) + '%\n\n'
    + '*Checklist*\n'
    + (day.gym ? 'YES' : 'NO') + ' Gym: ' + g.focus + '\n'
    + (day.lemon ? 'YES' : 'NO') + ' Lemon + turmeric water\n'
    + (day.spearmint >= 1 ? 'YES' : 'NO') + ' Spearmint tea cup 1\n'
    + (day.spearmint >= 2 ? 'YES' : 'NO') + ' Spearmint tea cup 2\n'
    + (day.flax ? 'YES' : 'NO') + ' Flaxseeds 1 tbsp\n'
    + (day.walnuts ? 'YES' : 'NO') + ' Walnuts 5-6\n'
    + (day.supps.vitD ? 'YES' : 'NO') + ' Vitamin D3\n'
    + (day.supps.b12 ? 'YES' : 'NO') + ' B12 Methylcobalamin\n'
    + (day.supps.inositol ? 'YES' : 'NO') + ' Myo-Inositol\n'
    + (day.supps.omega3 ? 'YES' : 'NO') + ' Omega-3\n\n'
    + '*Meals Today*\n'
    + (day.meals.length > 0 ? day.meals.map(m => m.t + ' - ' + m.n + ': ' + m.c + ' kcal').join('\n') : 'No meals logged yet') + '\n\n'
    + (day.gym ? 'Gym calories burnt: ~' + day.gymBurn + ' kcal' : 'Gym today: ' + g.focus);
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
    await send(buildDashboard());
    return true;
  }
  if (t.match(/gym done|finished gym|completed gym|just gymmed/)) {
    const g = GYM_SPLIT[getDOW()] || GYM_SPLIT['Monday'];
    day.gym = true; day.gymBurn = g.burn; saveDay();
    await send('GYM DONE! Amazing work!\n\nToday was: ' + g.focus + '\nEstimated burn: ~' + g.burn + ' kcal\n\nPost-gym meal window open - eat within 45 mins!\n\nBest options:\n- 2 eggs + brown rice + dal + salad\n- Paneer bhurji + whole wheat roti + curd\n- Rajma + rice + roasted veggies\n\nTake your Myo-Inositol with this meal!\nSend me a photo!');
    return true;
  }
  if (t.match(/lemon done|had lemon|lemon water done/)) {
    day.lemon = true; saveDay();
    await send('Lemon + turmeric water done! Liver detox activated! This daily habit directly helps reverse your Grade-I fatty liver. Keep it up!');
    return true;
  }
  if (t.match(/flax done|flaxseed done|had flax/)) {
    day.flax = true; saveDay();
    await send('Flaxseeds logged! Lignans = most powerful natural anti-androgen for PCOD. Also raises your HDL from 41 toward 50+!');
    return true;
  }
  if (t.match(/walnuts done|had walnuts/)) {
    day.walnuts = true; saveDay();
    await send('Walnuts logged! Omega-3 + HDL booster! Clinically shown to improve PCOD hormone balance!');
    return true;
  }
  if (t.match(/spearmint done|mint tea done|had spearmint|had mint tea/)) {
    day.spearmint = Math.min(day.spearmint + 1, 2); saveDay();
    await send('Spearmint tea #' + day.spearmint + ' logged! ' + (day.spearmint < 2 ? '1 more cup to go - best in the evening!' : 'Both cups done! PCOD anti-androgen protocol complete for today!'));
    return true;
  }
  if (t.match(/vitd done|vitamin d done|vit d done/)) {
    day.supps.vitD = true; saveDay();
    await send('Vitamin D3 logged! Your level was 17.7 (needs 30+). Daily consistency is everything! Results in 8-12 weeks.');
    return true;
  }
  if (t.match(/b12 done|took b12/)) {
    day.supps.b12 = true; saveDay();
    await send('B12 logged! Your level was 157 pg/mL - critically low. This is your energy, mood, and hair medicine! Feel the difference in 4-6 weeks.');
    return true;
  }
  if (t.match(/inositol done|took inositol/)) {
    day.supps.inositol = true; saveDay();
    await send('Myo-Inositol logged! Most evidence-backed PCOD supplement! Improves insulin sensitivity and helps regulate cycles.');
    return true;
  }
  if (t.match(/omega3 done|omega-3 done|took omega/)) {
    day.supps.omega3 = true; saveDay();
    await send('Omega-3 logged! Raises HDL from 41 toward 50+, reduces pelvic inflammation, supports fatty liver reversal.');
    return true;
  }
  const waterMatch = t.match(/drank (\d+)|(\d+) glass/);
  if (waterMatch) {
    const glasses = parseInt(waterMatch[1] || waterMatch[2]);
    day.water = glasses;
    if (day.water >= 8 && !day.waterDone) {
      day.waterDone = true; saveDay();
      await send('WATER GOAL REACHED - 8 glasses! Your liver, PCOD hormones, and kidneys are celebrating! No more water reminders today!');
    } else {
      saveDay();
      await send('Water updated: ' + day.water + '/8 glasses. ' + (8 - day.water > 0 ? (8 - day.water) + ' more to go!' : 'Goal hit!'));
    }
    return true;
  }
  return false;
}

function setupSchedules() {
  cron.schedule('0 11 * * *', async () => {
    const g = GYM_SPLIT[getDOW()] || GYM_SPLIT['Monday'];
    await send('Good morning Bhumi!\n\nMorning ritual - do these NOW:\n- Lemon + turmeric water - reply "lemon done"\n- 1 tbsp flaxseeds in breakfast\n- Vitamin D3 with food\n\nToday gym: ' + g.focus + '\n' + g.ex.slice(0, 3).join(', ') + '\n\nWhat are you having for breakfast? Send a photo!');
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('45 11 * * *', async () => {
    if (!day.flax) await send('Flaxseed reminder! Add 1 tbsp ground flaxseeds to breakfast. Reply "flax done"');
    if (!day.supps.vitD) await send('Vitamin D3 reminder - take with food now! Your level is only 17.7 (needs 30+). Reply "vitd done"');
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 12 * * *', async () => {
    if (!day.walnuts) await send('Walnut reminder! 5-6 walnuts now. Best veg omega-3 for your HDL (currently 41, needs 50+). Reply "walnuts done"');
    if (!day.supps.b12) await send('B12 reminder - take before gym! Your level was 157 (critically low). Pre-workout is perfect timing. Reply "b12 done"');
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('30 12 * * 1-5', async () => {
    const g = GYM_SPLIT[getDOW()] || GYM_SPLIT['Monday'];
    await send('Gym in 30 minutes!\n\nPre-workout snack now:\n- Small banana + 5 almonds, OR\n- Small bowl curd + walnuts\n\nB12 if not done - reply "b12 done"\n\nToday: ' + g.focus + '\nTarget burn: ~' + g.burn + ' kcal');
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 15 * * *', async () => {
    if (!day.supps.inositol) await send('Myo-Inositol - take with post-gym meal now! Best time for PCOD insulin effect. Reply "inositol done"');
  }, { timezone: 'Asia/Kolkata' });

  ['30 11', '0 13', '30 14', '0 16', '30 17', '0 19', '30 20', '0 22'].forEach(t => {
    cron.schedule(t + ' * * *', async () => {
      if (day.waterDone || day.water >= 8) return;
      const remaining = 8 - day.water;
      const options = [
        'Water check! ' + day.water + '/8 glasses - ' + remaining + ' more needed! Reply "drank X glasses"',
        'Hydration reminder! ' + day.water + '/8 done. ' + remaining + ' to go! Your fatty liver heals faster when hydrated.',
        day.water + '/8 glasses done. ' + remaining + ' to go! Set a glass next to you RIGHT NOW.',
        'Water reminder! ' + remaining + ' glasses still needed. Pelvic inflammation reduces when well hydrated.'
      ];
      await send(options[Math.floor(Math.random() * options.length)]);
    }, { timezone: 'Asia/Kolkata' });
  });

  cron.schedule('0 18 * * *', async () => {
    if (day.spearmint < 2) await send('Spearmint tea reminder! ' + (day.spearmint === 0 ? 'No cups yet today!' : '1 more cup to go!') + ' 2 cups daily = proven anti-androgen for PCOD. Reply "spearmint done"');
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 19 * * 1-5', async () => {
    await send('Mid-shift snack time!\n\nSo far today: ' + day.cal + '/1500 kcal\n\nSmart desk snacks:\n- Roasted makhana plain\n- Handful roasted chana\n- Apple or guava\n\n2nd spearmint tea now! Reply "spearmint done"');
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 22 * * *', async () => {
    const remaining = Math.max(0, 1500 - day.cal);
    await send('Dinner time - keep it light!\n\n' + remaining + ' kcal remaining today\n\nLiver-friendly options:\n- Moong dal soup + 1 roti\n- Vegetable khichdi small bowl\n- Curd + cucumber\n\nNo heavy carbs after 10pm!');
    if (!day.supps.omega3) await send('Omega-3 with dinner - take now! Reply "omega3 done"');
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 23 * * *', async () => {
    await send('30 minutes left to eat! Stop all food by 11:30pm - liver enters repair mode. If hungry after 11:30: max 1 glass warm A2 milk or small curd only.');
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('30 1 * * *', async () => {
    const grade = (day.gym && day.cal <= 1500 && day.water >= 7) ? 'A - Perfect!' : (day.gym || day.cal <= 1500) ? 'B - Good effort!' : 'C - Fresh start tomorrow!';
    await send('End of Day Report\n\nCalories: ' + day.cal + '/1500 ' + (day.cal <= 1500 ? 'OK' : 'Over') + '\nProtein: ' + day.protein + '/90g\nWater: ' + day.water + '/8 ' + (day.water >= 8 ? 'OK' : 'Under') + '\nGym: ' + (day.gym ? 'Done' : 'Missed') + '\nFlaxseeds: ' + (day.flax ? 'Done' : 'Missed') + '\nSpearmint: ' + day.spearmint + '/2\nB12: ' + (day.supps.b12 ? 'Done' : 'Missed') + '\n\nGrade: ' + grade + '\n\nSleep by 2:30am - PCOD hormones reset during deep sleep!');
    day = newDay(); chat = []; saveDay();
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 10 * * 0', async () => {
    await send('Sunday Planning Mode!\n\nSay "plan my week" for a 7-day meal plan.\n\nWeekly measurements - after bathroom, before food:\n- Weight on scale\n- Waist at belly button\n- Hip measurement\n\nSend me the numbers!');
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 10 * * 6', async () => {
    await send('Saturday Meal Prep - 30 mins = healthy week!\n\n- Boil 8 eggs\n- Big batch dal\n- Soak rajma or chana overnight\n- Chop veggies in bulk\n- Make seed mix jar: flax + chia + pumpkin\n- Spearmint tea in fridge 1 litre\n\n30 minutes now = no excuses all week!');
  }, { timezone: 'Asia/Kolkata' });

  console.log('All schedules set up successfully');
}

async function onMessage(messages) {
  const msg = messages[0];
  if (!msg || msg.key.fromMe) return;

  const senderJid = msg.key.remoteJid;
  const senderNum = senderJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
  if (senderNum !== MY_NUM) return;

  const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
  console.log('Message from Bhumi: ' + text.substring(0, 60));

  const handled = await handleCommand(text);
  if (handled) return;

  let imgData = null;
  let imgMime = null;
  let prompt = text;

  const imgMsg = msg.message?.imageMessage;
  const videoMsg = msg.message?.videoMessage;

  if (imgMsg || videoMsg) {
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
      imgData = buffer.toString('base64');
      if (imgMsg) {
        imgMime = imgMsg.mimetype || 'image/jpeg';
        prompt = text || 'Analyse this meal photo. Identify all food items, estimate calories, protein, carbs, fat. Is it PCOD-safe and liver-friendly? Give me the running daily total.';
        console.log('Photo received for meal analysis');
      } else if (videoMsg) {
        imgMime = 'image/jpeg';
        const g = GYM_SPLIT[getDOW()] || GYM_SPLIT['Monday'];
        prompt = 'GYM VIDEO RECEIVED. Analyse: 1) Identify exercise 2) Check posture and form in detail 3) Estimate calories burnt 4) Rate effectiveness 1-10 5) Give 2-3 coaching cues 6) Does this match today plan: ' + g.focus + '? 7) What to do next?';
        day.gym = true; day.gymBurn = g.burn || 250; saveDay();
        console.log('Gym video received for form analysis');
      }
    } catch (e) {
      console.error('Media error:', e.message);
      await send('Could not download that file. Try sending it again?');
      return;
    }
  }

  if (!prompt && !imgData) return;

  const reply = await askAI(prompt, imgData, imgMime);
  await send(reply);

  if (imgData && imgMime && imgMime.startsWith('image/') && day.meals.length > 0) {
    setTimeout(async () => {
      await send('Running Total: ' + day.cal + '/1500 kcal\nProtein: ' + day.protein + '/90g | Water: ' + day.water + '/8\n' + Math.max(0, 1500 - day.cal) + ' kcal remaining today');
    }, 2000);
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('/tmp/.baileys_auth');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['Bhumi Bot', 'Chrome', '1.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n============================================');
      console.log('   SCAN THIS QR CODE WITH YOUR WHATSAPP');
      console.log('============================================\n');
      qrcode.generate(qr, { small: true });
      console.log('\nOn iPhone: WhatsApp > Settings > Linked Devices > Link a Device\n');
    }
    if (connection === 'open') {
      console.log('Bot is LIVE!');
      setupSchedules();
      setTimeout(async () => {
        const g = GYM_SPLIT[getDOW()] || GYM_SPLIT['Monday'];
        await send('Your AI Health Coach is LIVE!\n\nHey Bhumi! I am your personal health companion, ready 24/7!\n\nQuick commands:\n- "status" - daily dashboard\n- "plan my day" - full schedule\n- "recipe for oats" - PCOD-safe recipe\n- "drank 3 glasses" - log water\n- "gym done" - log workout\n\nSend meal photos for calorie analysis!\nSend gym videos for form check!\n\nToday gym: ' + g.focus + '\n\nHow are you feeling?');
      }, 3000);
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('Disconnected - reconnecting in 5 seconds...');
        setTimeout(startBot, 5000);
      } else {
        console.log('Logged out. Delete /tmp/.baileys_auth and restart to re-scan QR.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'notify') await onMessage(messages);
  });
}

console.log('Starting Bhumi AI Health Coach...');
startBot();
