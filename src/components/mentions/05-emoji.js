/* Lightweight built-in emoji set (≈300) with names/keywords, search, and a picker panel.
 *   Orion.mentions.emoji.search('party', 8)   -> [{ char, name, keywords, category }]
 *   Orion.mentions.emoji.picker(anchor, { onSelect(char) })   -> popover handle
 *   Orion.mentions.emoji.source                               -> source for the ':' trigger
 */

i18n.add('en', {
  emoji: {
    search: 'Search emoji', recent: 'Recently used', smileys: 'Smileys', people: 'People & gestures', symbols: 'Hearts & symbols',
    objects: 'Objects & activity', nature: 'Nature & travel', food: 'Food & drink', none: 'No emoji found', picker: 'Emoji picker',
  },
});

const EMOJI_RAW = {
  smileys: '😀 grinning smile happy|😃 smiley happy|😄 smile happy joy|😁 grin|😆 laughing lol|😅 sweat_smile phew|🤣 rofl lol|😂 joy tears laugh|🙂 slightly_smiling|🙃 upside_down|😉 wink|😊 blush happy|😇 innocent angel|🥰 smiling_hearts love|😍 heart_eyes love|🤩 star_struck wow|😘 kissing_heart|😋 yum|😛 tongue|😜 winking_tongue|🤪 zany crazy|🤑 money_mouth|🤗 hugging hug|🤭 hand_over_mouth oops|🤫 shush quiet|🤔 thinking hmm|🤐 zipper_mouth|🤨 raised_eyebrow|😐 neutral meh|😑 expressionless|😶 no_mouth|😏 smirk|😒 unamused|🙄 eye_roll|😬 grimacing awkward|😌 relieved|😔 pensive|😪 sleepy|😴 sleeping zzz|😷 mask sick|🤒 thermometer_face sick|🤕 head_bandage hurt|🤢 nauseated|🤧 sneezing|🥵 hot|🥶 cold freezing|😵 dizzy|🤯 exploding_head mind_blown|🤠 cowboy|🥳 partying party celebrate|😎 sunglasses cool|🤓 nerd geek|🧐 monocle|😕 confused|😟 worried|🙁 slightly_frowning|😮 open_mouth surprise|😯 hushed|😲 astonished shocked|😳 flushed|🥺 pleading please|😦 frowning|😨 fearful|😰 anxious|😢 cry sad|😭 sob crying|😱 scream|😖 confounded|😞 disappointed|😓 sweat|😩 weary|😫 tired|🥱 yawning bored|😤 triumph huff|😡 rage angry|😠 angry mad|🤬 cursing|😈 smiling_imp devil|💀 skull dead|💩 poop|🤡 clown|👻 ghost|👽 alien|🤖 robot bot|😺 smiley_cat',
  people: '👋 wave hello hi bye|🤚 raised_back_of_hand|✋ raised_hand stop high_five|🖖 vulcan|👌 ok_hand perfect|🤌 pinched|✌️ v peace victory|🤞 crossed_fingers luck|🤟 love_you|🤘 metal rock|🤙 call_me|👈 point_left|👉 point_right|👆 point_up|👇 point_down|☝️ index_up|👍 thumbsup +1 like yes approve|👎 thumbsdown -1 dislike no|✊ fist|👊 punch|👏 clap applause bravo|🙌 raised_hands hooray|👐 open_hands|🤲 palms_up|🤝 handshake deal agree|🙏 pray thanks please|✍️ writing|💅 nail_care|🤳 selfie|💪 muscle strong flex|🧠 brain smart|👀 eyes look see|👁️ eye|👶 baby|🧒 child|🧑 person|👩 woman|👨 man|🧑‍💻 technologist developer|👩‍💻 woman_technologist|👨‍💻 man_technologist|🧑‍🎨 artist designer|🧑‍🏫 teacher|🧑‍⚕️ health_worker doctor|🙋 raising_hand question|🤷 shrug dunno|🤦 facepalm|🙇 bow sorry|💁 tipping_hand|🙆 ok_gesture|🙅 no_gesture|🏃 runner running|🚶 walking|💃 dancer dance|🕺 man_dancing|👯 dancers',
  symbols: '❤️ heart love red|🧡 orange_heart|💛 yellow_heart|💚 green_heart|💙 blue_heart|💜 purple_heart|🖤 black_heart|🤍 white_heart|🤎 brown_heart|💔 broken_heart|💕 two_hearts|💖 sparkling_heart|💯 100 hundred perfect|💢 anger|💥 boom collision|💫 dizzy_star|💬 speech comment chat|💭 thought|🔥 fire hot lit|✨ sparkles magic new|⭐ star favorite|🌟 glowing_star|⚡ zap lightning fast|✅ white_check_mark done yes ok|☑️ ballot_box_check|✔️ check_mark|❌ x cross no wrong|❎ negative_cross|➕ plus add|➖ minus|❓ question|❗ exclamation important|‼️ bangbang|⚠️ warning caution|🚫 no_entry forbidden|⛔ no_entry_sign stop|🔴 red_circle|🟠 orange_circle|🟡 yellow_circle|🟢 green_circle|🔵 blue_circle|🟣 purple_circle|⚪ white_circle|⚫ black_circle|🔺 red_triangle up|🔻 red_triangle_down|🔷 blue_diamond|🔶 orange_diamond|🆗 ok_button|🆕 new_button|🆓 free_button|🆒 cool_button|🔝 top|🔜 soon|🔙 back|♻️ recycle|💲 dollar_sign|™️ trademark|©️ copyright|®️ registered|🔣 symbols|#️⃣ hash|🔢 numbers|▶️ play|⏸️ pause|⏹️ stop_button|⏩ fast_forward|🔁 repeat|🔀 shuffle|➡️ arrow_right|⬅️ arrow_left|⬆️ arrow_up|⬇️ arrow_down|↩️ leftwards_arrow return|🔄 arrows_counterclockwise refresh',
  objects: '🎉 tada party celebrate hooray congrats|🎊 confetti|🎈 balloon|🎁 gift present|🏆 trophy win champion|🥇 first_place gold|🥈 second_place silver|🥉 third_place bronze|🏅 medal|🎯 dart target goal|🚀 rocket launch ship|💡 bulb idea|📌 pushpin pin|📍 round_pushpin location|📎 paperclip attachment|🔗 link|🔒 lock secure|🔓 unlock|🔑 key|🛠️ tools|🔧 wrench fix|🔨 hammer|⚙️ gear settings|🧪 test_tube experiment|🐛 bug|🧩 puzzle|📦 package box ship|📁 folder|📂 open_folder|📄 page document|📝 memo note write|📋 clipboard|📅 calendar date|📆 tear_off_calendar|🗓️ spiral_calendar|⏰ alarm_clock|⏳ hourglass waiting|⌛ hourglass_done|⏱️ stopwatch timer|📊 bar_chart stats|📈 chart_increasing growth up|📉 chart_decreasing down|💰 money_bag|💵 dollar money|💳 credit_card payment|🧾 receipt invoice|🛒 shopping_cart|📧 email mail|✉️ envelope letter|📨 incoming_envelope|📬 mailbox|📣 megaphone announce|📢 loudspeaker|🔔 bell notification|🔕 no_bell mute|📱 phone mobile|💻 laptop computer|🖥️ desktop|⌨️ keyboard|🖱️ mouse|🖨️ printer|💾 floppy save|📷 camera photo|🎥 movie_camera video|🎬 clapper film|🎧 headphones|🎤 microphone|🎵 music note|🎨 art palette|🎮 video_game|🧸 teddy_bear|📚 books library|📖 book open|✏️ pencil|🖊️ pen|🔍 mag search zoom|🧭 compass|🛡️ shield security|⚖️ balance legal|🏷️ label tag|🗑️ wastebasket trash',
  food: '☕ coffee|🍵 tea|🧃 juice|🥤 cup_straw|🍺 beer|🍻 beers cheers|🍷 wine|🥂 champagne toast|🍕 pizza|🍔 burger|🍟 fries|🌮 taco|🌯 burrito|🍣 sushi|🍜 ramen noodles|🍝 spaghetti|🥗 salad|🍩 doughnut|🍪 cookie|🍰 cake|🎂 birthday cake|🍫 chocolate|🍿 popcorn|🍎 apple|🍌 banana|🍉 watermelon|🍓 strawberry|🥑 avocado|🌶️ hot_pepper spicy|🥐 croissant|🍞 bread|🧀 cheese|🥚 egg|🍳 cooking',
  nature: '☀️ sunny sun|🌤️ sun_small_cloud|⛅ partly_sunny|☁️ cloud|🌧️ rain|⛈️ storm thunder|❄️ snowflake|☃️ snowman|🌈 rainbow|🌊 ocean wave|💧 droplet|🌍 earth globe world|🌙 moon night|🌱 seedling growth|🌳 tree|🌴 palm_tree|🌵 cactus|🌸 cherry_blossom flower|🌻 sunflower|🌹 rose|🍀 four_leaf_clover luck|🍁 maple_leaf|🐶 dog|🐱 cat|🦊 fox|🐻 bear|🐼 panda|🐨 koala|🦁 lion|🐯 tiger|🦄 unicorn|🐝 bee|🦋 butterfly|🐢 turtle slow|🐙 octopus|🐳 whale|🐧 penguin|🦉 owl|🚗 car|🚕 taxi|🚌 bus|🚲 bicycle bike|🛵 scooter|✈️ airplane travel|🚆 train|🚢 ship|🏠 house home|🏢 office building|🏥 hospital|🏫 school|🏖️ beach vacation|⛰️ mountain|🗺️ map|🏁 checkered_flag finish|🚩 red_flag|🏳️ white_flag',
};
const EMOJI_CATS = Object.keys(EMOJI_RAW);
const EMOJI = [];
for (const cat of EMOJI_CATS) {
  for (const entry of EMOJI_RAW[cat].split('|')) {
    const [char, name, ...kw] = entry.split(' ');
    EMOJI.push({ char, name, keywords: kw, category: cat, search: (name + ' ' + kw.join(' ')).replace(/_/g, ' ') });
  }
}
const RECENT_KEY = 'orion:emoji:recent';
const recentEmoji = () => toArr(ls.get(RECENT_KEY, [])).filter(c => EMOJI.some(e => e.char === c)).slice(0, 16);
function rememberEmoji(char) { ls.set(RECENT_KEY, [char, ...recentEmoji().filter(c => c !== char)].slice(0, 16)); }

/** search(query, limit) — emoji by name/keyword (prefix matches first) */
function searchEmoji(q, limit = 50) {
  const s = String(q || '').toLowerCase().replace(/^:/, '').replace(/_/g, ' ').trim();
  if (!s) return EMOJI.slice(0, limit);
  const starts = [], contains = [];
  for (const e of EMOJI) {
    if (e.name.replace(/_/g, ' ').startsWith(s) || e.keywords.some(k => k.startsWith(s))) starts.push(e);
    else if (e.search.includes(s)) contains.push(e);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** picker(anchor, { onSelect(char, emoji), placement, owner, recent: true }) -> popover handle */
function emojiPicker(anchor, o = {}) {
  const T = k => t('emoji.' + k);
  const input = h('input', { class: 'o-input o-input-sm o-ek-emoji-search', type: 'search', placeholder: T('search'), 'aria-label': T('search'), autocomplete: 'off' });
  const tabs = h('div', { class: 'o-ek-emoji-tabs', role: 'tablist', 'aria-label': T('picker') });
  const grid = h('div', { class: 'o-ek-emoji-grid o-scroll', role: 'grid', 'aria-label': T('picker') });
  const cats = [...(o.recent !== false && recentEmoji().length ? ['recent'] : []), ...EMOJI_CATS];
  cats.forEach(c => {
    const first = c === 'recent' ? '🕘' : EMOJI.find(e => e.category === c).char;
    tabs.append(h('button', { type: 'button', class: 'o-ek-emoji-tab', role: 'tab', 'data-cat': c, title: T(c), 'aria-label': T(c) }, first));
  });
  const btn = e => h('button', { type: 'button', class: 'o-ek-emoji', role: 'gridcell', tabindex: '-1', title: ':' + e.name + ':', 'aria-label': e.name.replace(/_/g, ' '), 'data-char': e.char }, e.char);
  const render = () => {
    const q = input.value.trim();
    grid.replaceChildren();
    if (q) {
      const res = searchEmoji(q, 120);
      if (!res.length) grid.append(h('div', { class: 'o-ek-emoji-none' }, T('none')));
      else grid.append(h('div', { class: 'o-ek-emoji-set', role: 'row' }, res.map(btn)));
    } else {
      cats.forEach(c => {
        const list = c === 'recent' ? recentEmoji().map(ch => EMOJI.find(e => e.char === ch)) : EMOJI.filter(e => e.category === c);
        grid.append(h('div', { class: 'o-ek-emoji-cat', id: null, 'data-cat': c }, T(c)), h('div', { class: 'o-ek-emoji-set', role: 'row' }, list.map(btn)));
      });
    }
    tabs.hidden = !!q;
  };
  render();
  const panel = h('div', { class: 'o-ek-emoji-panel' }, input, tabs, grid);
  const nav = new ListNav(grid, { items: '.o-ek-emoji', orientation: 'grid', columns: () => Math.max(1, Math.round(grid.clientWidth / 36)), typeahead: false, onSelect: b => choose(b) });
  let pop = null;
  const choose = b => { const ch = b.dataset.char; rememberEmoji(ch); pop.close('select'); o.onSelect && o.onSelect(ch, EMOJI.find(e => e.char === ch)); };
  on(grid, 'click', '.o-ek-emoji', (e, b) => choose(b));
  on(grid, 'keydown', e => nav.handle(e));
  on(input, 'input', () => { render(); nav.reset(); });
  on(input, 'keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); nav.set(0); }
    else if (e.key === 'Enter') { e.preventDefault(); const b = grid.querySelector('.o-ek-emoji'); if (b) choose(b); }
  });
  on(tabs, 'click', '[data-cat]', (e, b) => { const hd = grid.querySelector(`.o-ek-emoji-cat[data-cat="${b.dataset.cat}"]`); if (hd) grid.scrollTop = hd.offsetTop - grid.offsetTop; });
  pop = popover(anchor, panel, { label: T('picker'), placement: o.placement || 'bottom-start', owner: o.owner, className: 'o-ek-emoji-pop', focus: input, onClose: o.onClose });
  return pop;
}

const emoji = {
  list: EMOJI, categories: EMOJI_CATS, search: searchEmoji, picker: emojiPicker, recent: recentEmoji, remember: rememberEmoji,
  /** source for Orion.mentions({ triggers: { ':': Orion.mentions.emoji.source } }) */
  source: q => searchEmoji(q, 8).map(e => ({ id: e.char, label: e.name, char: e.char, emoji: e.char, value: e.char })),
};
