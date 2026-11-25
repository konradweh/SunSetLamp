/* ────────────────────────────────────────────────────────────
   Sonnenlicht – eigene Oberfläche für die ESPHome-Lampe
   Hier kannst du Name und Begrüßung anpassen.

   Dieselbe Datei läuft an zwei Orten:
   – auf der Lampe selbst (Steuerung im WLAN)
   – auf der Webseite für unterwegs (Steuerung über MQTT),
     dort wird vorher SONNENLICHT_MQTT in der index.html gesetzt.
   ──────────────────────────────────────────────────────────── */
const NAME = "Maxima";
const GRUSS = "Ein bisschen Abendsonne, wann immer du magst.";

(() => {
  // Namen müssen exakt zu den "name:"-Einträgen in der YAML passen
  const ENT = {
    lampe:   ["light",  "Sonnenuntergangslampe"],
    wecker:  ["switch", "Wecklicht"],
    stunde:  ["number", "Weckstunde"],
    minute:  ["number", "Weckminute"],
    dauer:   ["number", "Aufgangsdauer"],
    rest:    ["sensor", "Schlafrest"],
    s15:     ["button", "Schlaf15"],
    s30:     ["button", "Schlaf30"],
    s60:     ["button", "Schlaf60"],
    stopp:   ["button", "Schlafstopp"],
    gruss:   ["button", "Gruss"],
  };

  const MQTT = window.SONNENLICHT_MQTT || null;   // gesetzt = Fernsteuerung über das Internet
  const PW_KEY = "sonnenlicht-passwort";
  let client = null;

  const st = { an: false, hell: 0, effekt: "None", wecker: false, stunde: 7, minute: 0, dauer: 20, rest: 0, online: false, lampeOnline: !MQTT };
  let letzteEingabe = 0;

  /* ---------- Aussehen ---------- */
  const CSS = `
  esp-app{display:none!important}
  :root{
    --nacht:#1b1638; --pflaume:#3b1f45; --erde:#2a1733;
    --koralle:#ff7d6e; --aprikose:#ffb070; --butter:#ffe6a6;
    --text:#fff1ea; --leise:#d9b8c4; --linie:rgba(255,241,234,.14);
    color-scheme:dark;
  }
  html,body{margin:0;background:var(--erde);color:var(--text);
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
  #sl{max-width:480px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}
  .titel{font-family:"Fredoka",ui-rounded,"SF Pro Rounded","Arial Rounded MT Bold",system-ui,sans-serif}

  /* Himmel */
  .himmel{position:relative;height:min(62vh,420px);overflow:hidden;cursor:pointer;
    background:linear-gradient(180deg,#120f2a 0%,var(--nacht) 55%,#2c2150 100%)}
  .abend{position:absolute;inset:0;opacity:var(--h,0);transition:opacity 1.2s ease;
    background:linear-gradient(180deg,#3a2463 0%,#a8487a 42%,#ff8a6e 72%,#ffc27d 100%)}
  .sterne{position:absolute;inset:0;opacity:calc(1 - var(--h,0) * 1.6);transition:opacity 1.2s ease;
    background-image:
      radial-gradient(1.5px 1.5px at 12% 18%,#fff 50%,transparent 51%),
      radial-gradient(1px 1px at 28% 32%,#fff 50%,transparent 51%),
      radial-gradient(1.5px 1.5px at 46% 12%,#fff 50%,transparent 51%),
      radial-gradient(1px 1px at 63% 26%,#fff 50%,transparent 51%),
      radial-gradient(2px 2px at 78% 14%,#ffe6a6 50%,transparent 51%),
      radial-gradient(1px 1px at 88% 36%,#fff 50%,transparent 51%),
      radial-gradient(1px 1px at 36% 48%,#fff 50%,transparent 51%),
      radial-gradient(1.5px 1.5px at 70% 46%,#fff 50%,transparent 51%),
      radial-gradient(1px 1px at 8% 44%,#fff 50%,transparent 51%)}
  .sonne{position:absolute;left:50%;width:150px;height:150px;margin-left:-75px;border-radius:50%;
    top:calc(84% - var(--h,0) * 64%);
    background:radial-gradient(circle at 40% 35%,#fff7dc 0%,var(--butter) 30%,var(--aprikose) 62%,var(--koralle) 100%);
    transition:top 1.2s cubic-bezier(.3,.7,.3,1),filter 1.2s ease}
  .schein{position:absolute;left:50%;width:380px;height:380px;margin-left:-190px;border-radius:50%;
    top:calc(84% - var(--h,0) * 64% - 115px);pointer-events:none;
    background:radial-gradient(circle,rgba(255,196,128,.6) 0%,rgba(255,150,110,.22) 40%,transparent 68%);
    opacity:calc(.25 + var(--h,0) * .75);transform:scale(calc(.75 + var(--h,0) * .45));
    transition:top 1.2s cubic-bezier(.3,.7,.3,1),opacity 1.2s,transform 1.2s}
  .himmel.aus .schein{top:calc(100% - 115px);opacity:0}
  .himmel.aus .sonne{top:100%;filter:saturate(.6) brightness(.8)}
  .huegel{position:absolute;left:0;right:0;bottom:-1px;width:100%;height:90px;display:block}
  .gruss{position:absolute;left:22px;right:22px;top:26px;z-index:2;pointer-events:none}
  .gruss h1{margin:0;font-size:2rem;font-weight:600;line-height:1.1}
  .gruss p{margin:6px 0 0;font-size:.95rem;color:var(--leise);max-width:28ch;line-height:1.4}
  .himmel:not(.aus) .gruss p{color:rgba(255,241,234,.85)}
  .zustand{position:absolute;left:0;right:0;bottom:22px;z-index:2;text-align:center;font-size:.95rem;
    pointer-events:none;color:var(--text);text-shadow:0 1px 6px rgba(0,0,0,.35)}

  /* Steuerung */
  .boden{flex:1;padding:6px 22px 36px;background:var(--erde)}
  .gruppe{padding:20px 0;border-bottom:1px solid var(--linie)}
  .gruppe:last-of-type{border-bottom:0}
  .kopf{display:flex;align-items:center;justify-content:space-between;margin:0 0 14px}
  .kopf h2{margin:0;font-size:1.15rem;font-weight:600}
  .kopf span{color:var(--leise);font-size:.95rem;font-variant-numeric:tabular-nums}
  .knopf-gross{width:100%;border:0;border-radius:18px;padding:15px;font:inherit;font-weight:600;font-size:1.05rem;
    cursor:pointer;color:#3b1f45;background:linear-gradient(90deg,var(--butter),var(--aprikose),var(--koralle))}
  .knopf-gross.ist-an{background:rgba(255,241,234,.1);color:var(--text)}
  .regler{-webkit-appearance:none;appearance:none;width:100%;height:12px;border-radius:999px;margin:6px 0;outline:none;
    background:linear-gradient(90deg,var(--aprikose),var(--koralle)) 0/var(--p,50%) 100% no-repeat,rgba(255,241,234,.12)}
  .regler::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;border-radius:50%;
    background:var(--butter);border:4px solid var(--erde);box-shadow:0 0 0 2px var(--aprikose)}
  .regler::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:var(--butter);
    border:4px solid var(--erde);box-shadow:0 0 0 2px var(--aprikose)}
  .reihe{display:flex;flex-wrap:wrap;gap:8px}
  .wahl{border:1px solid var(--linie);background:transparent;color:var(--text);border-radius:999px;
    padding:9px 15px;font:inherit;font-size:.95rem;cursor:pointer;transition:background .2s,border-color .2s}
  .wahl:active{transform:scale(.96)}
  .wahl.aktiv{background:var(--aprikose);border-color:var(--aprikose);color:#3b1f45;font-weight:600}
  .wahl[hidden]{display:none}
  .hinweis{margin:12px 0 0;font-size:.9rem;color:var(--leise);line-height:1.45}
  .schalter{position:relative;width:54px;height:32px;border-radius:999px;border:0;cursor:pointer;
    background:rgba(255,241,234,.18);transition:background .25s;flex:none}
  .schalter::after{content:"";position:absolute;top:4px;left:4px;width:24px;height:24px;border-radius:50%;
    background:var(--text);transition:transform .25s}
  .schalter.an{background:var(--koralle)}
  .schalter.an::after{transform:translateX(22px)}
  .zeit-zeile{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px}
  .zeit-zeile .hinweis{margin:0}
  .zeit{font:inherit;font-size:2.2rem;font-weight:600;color:var(--text);background:transparent;border:0;padding:0;
    font-variant-numeric:tabular-nums;color-scheme:dark}
  .zeit::-webkit-calendar-picker-indicator{filter:invert(1) opacity(.6)}
  .fuss{text-align:center;font-size:.8rem;color:var(--leise);padding:8px 0 4px}
  .punkt{display:inline-block;width:7px;height:7px;border-radius:50%;background:#9a8090;margin-right:6px;vertical-align:1px}
  .punkt.ok{background:#8fd6a5}
  .toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;pointer-events:none;
    background:var(--text);color:var(--pflaume);padding:10px 18px;border-radius:999px;font-size:.92rem;
    transition:opacity .3s,transform .3s;max-width:85vw;text-align:center}
  .toast.zeigen{opacity:1;transform:translate(-50%,0)}
  .gruppe[hidden],.fuss button[hidden]{display:none}
  .gruss-knopf{width:100%;padding:13px 15px;font-weight:600}
  .fuss button{background:none;border:0;color:var(--leise);font:inherit;text-decoration:underline;cursor:pointer;margin-left:10px;padding:4px}
  .anmeldung{position:fixed;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;padding:24px;
    background:linear-gradient(180deg,#120f2a 0%,var(--nacht) 55%,var(--erde) 100%)}
  .anmeldung[hidden]{display:none}
  .anmeldung form{width:100%;max-width:340px}
  .anmeldung h1{margin:0 0 8px;font-size:2rem;font-weight:600}
  .anmeldung input{width:100%;box-sizing:border-box;margin:18px 0 12px;padding:14px 16px;border-radius:14px;
    border:1px solid var(--linie);background:rgba(255,241,234,.06);color:var(--text);font:inherit;font-size:1rem}
  .anmeldung .fehler{color:#ffb4a8}
  button:focus-visible,input:focus-visible,.himmel:focus-visible{outline:2px solid var(--butter);outline-offset:3px}
  @media (prefers-reduced-motion:reduce){*{transition:none!important}}
  `;

  const HTML = `
  <div class="himmel aus" id="himmel" role="button" aria-label="Lampe ein- oder ausschalten" tabindex="0">
    <div class="abend"></div><div class="sterne"></div>
    <div class="schein"></div><div class="sonne"></div>
    <svg class="huegel" viewBox="0 0 480 90" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 52 C 90 22, 170 30, 250 50 S 400 72, 480 40 L480 90 L0 90 Z" fill="#3b1f45"/>
      <path d="M0 70 C 110 48, 200 58, 300 70 S 430 82, 480 66 L480 90 L0 90 Z" fill="#2a1733"/>
    </svg>
    <div class="gruss"><h1 class="titel" id="hallo"></h1><p id="gruss"></p></div>
    <div class="zustand" id="zustand">Verbinde mit der Lampe …</div>
  </div>

  <div class="boden">
    <section class="gruppe">
      <button class="knopf-gross" id="power">Einschalten</button>
    </section>

    <section class="gruppe" id="gruss-gruppe" hidden>
      <button class="wahl gruss-knopf" id="gruss-knopf">♥ Gruß schicken</button>
      <p class="hinweis">Die Lampe leuchtet dreimal sanft auf und kehrt dann zu ihrem vorherigen Zustand zurück.</p>
    </section>

    <section class="gruppe">
      <div class="kopf"><h2 class="titel">Helligkeit</h2><span id="prozent">–</span></div>
      <input type="range" class="regler" id="regler" min="1" max="100" value="50" aria-label="Helligkeit">
    </section>

    <section class="gruppe">
      <div class="kopf"><h2 class="titel">Stimmung</h2></div>
      <div class="reihe">
        <button class="wahl" data-hell="15">Kuschelig</button>
        <button class="wahl" data-hell="45">Gemütlich</button>
        <button class="wahl" data-hell="100">Ganz hell</button>
        <button class="wahl" data-effekt="Atmen">Atmen</button>
        <button class="wahl" data-effekt="Kerze">Kerzenschein</button>
      </div>
    </section>

    <section class="gruppe">
      <div class="kopf"><h2 class="titel">Einschlafen</h2><span id="rest"></span></div>
      <div class="reihe">
        <button class="wahl" data-schlaf="s15">15 min</button>
        <button class="wahl" data-schlaf="s30">30 min</button>
        <button class="wahl" data-schlaf="s60">60 min</button>
        <button class="wahl" id="stopp" hidden>Timer beenden</button>
      </div>
      <p class="hinweis" id="schlaf-info"></p>
    </section>

    <section class="gruppe">
      <div class="kopf"><h2 class="titel">Wecklicht</h2>
        <button class="schalter" id="wecker" role="switch" aria-checked="false" aria-label="Wecklicht"></button></div>
      <div class="zeit-zeile">
        <span class="hinweis">Ganz hell um</span>
        <input type="time" class="zeit titel" id="zeit" value="07:00" aria-label="Weckzeit">
      </div>
      <div class="reihe">
        <button class="wahl" data-dauer="10">10 min</button>
        <button class="wahl" data-dauer="20">20 min</button>
        <button class="wahl" data-dauer="30">30 min</button>
        <button class="wahl" data-dauer="45">45 min</button>
      </div>
      <p class="hinweis" id="weck-info"></p>
    </section>

    <div class="fuss"><span class="punkt" id="punkt"></span><span id="verbindung">Verbinde …</span><button id="abmelden" hidden>Abmelden</button></div>
  </div>
  <div class="toast" id="toast" role="status"></div>
  <div class="anmeldung" id="anmeldung" hidden>
    <form id="anmelde-form">
      <h1 class="titel">Sonnenlicht</h1>
      <p class="hinweis" id="anmelde-hinweis">Gib das Passwort ein, um die Lampe von unterwegs zu steuern.</p>
      <input type="password" id="pw" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Passwort" aria-label="Passwort">
      <button class="knopf-gross" type="submit">Verbinden</button>
    </form>
  </div>`;

  /* ---------- Verbindung zur Lampe ---------- */
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  async function befehl(key, aktion, params = {}) {
    if (MQTT) return mqttBefehl(key, aktion, params);
    const [dom, name] = ENT[key];
    const q = new URLSearchParams(params).toString();
    const ende = "/" + aktion + (q ? "?" + q : "");
    // Neue ESPHome-Versionen erwarten den Namen, ältere die object_id
    for (const pfad of [`/${dom}/${encodeURIComponent(name)}`, `/${dom}/${slug(name)}`]) {
      try {
        const r = await fetch(pfad + ende, { method: "POST" });
        if (r.ok) return true;
      } catch (_) { /* nächsten Versuch */ }
    }
    toast("Die Lampe antwortet nicht. Ist sie eingesteckt und im WLAN?");
    return false;
  }

  /* ---------- Fernsteuerung über MQTT ---------- */
  // ESPHome-Topics: <praefix>/<domain>/<object_id>/state bzw. /command
  const topicBasis = key => { const [dom, name] = ENT[key]; return `${MQTT.praefix}/${dom}/${slug(name)}`; };

  function mqttBefehl(key, aktion, params) {
    if (!client || !client.connected) { toast("Keine Verbindung. Ist das Internet an?"); return false; }
    if (!st.lampeOnline) { toast("Die Lampe ist gerade nicht online."); return false; }
    const [dom] = ENT[key];
    let nachricht;
    if (dom === "light") {
      const p = { state: aktion === "toggle" ? (st.an ? "OFF" : "ON") : (aktion === "turn_off" ? "OFF" : "ON") };
      if (params.brightness !== undefined) p.brightness = Number(params.brightness);
      if (params.effect !== undefined) p.effect = params.effect;
      if (params.transition !== undefined) p.transition = Number(params.transition);
      nachricht = JSON.stringify(p);
    } else if (dom === "switch") nachricht = aktion === "turn_on" ? "ON" : "OFF";
    else if (dom === "number") nachricht = String(params.value);
    else nachricht = "PRESS";
    client.publish(topicBasis(key) + "/command", nachricht, { qos: 1 });
    return true;
  }

  function mqttNachricht(topic, text) {
    if (topic === `${MQTT.praefix}/status`) { st.lampeOnline = text === "online"; zeichne(); return; }
    for (const [k, [dom, name]] of Object.entries(ENT)) {
      if (topic !== topicBasis(k) + "/state") continue;
      const id = `${dom}/${name}`;
      if (dom === "light") { try { verarbeite({ id, ...JSON.parse(text) }); } catch (_) {} }
      else verarbeite({ id, value: dom === "switch" ? text === "ON" : text, state: text });
      return;
    }
  }

  function speicher(aktion, wert) {
    try {
      if (aktion === "lesen") return localStorage.getItem(PW_KEY);
      if (aktion === "schreiben") localStorage.setItem(PW_KEY, wert);
      if (aktion === "loeschen") localStorage.removeItem(PW_KEY);
    } catch (_) { /* privater Modus o. Ä. */ }
    return null;
  }

  function anmeldungZeigen(zeigen, meldung) {
    $("#anmeldung").hidden = !zeigen;
    const h = $("#anmelde-hinweis");
    h.textContent = meldung || "Gib das Passwort ein, um die Lampe von unterwegs zu steuern.";
    h.classList.toggle("fehler", !!meldung);
    if (zeigen) setTimeout(() => $("#pw").focus(), 50);
  }

  function mqttVerbinden(passwort) {
    if (client) client.end(true);
    let angemeldet = false;
    console.info("Verbinde mit", MQTT.url || MQTT.host, "als", MQTT.benutzer, "– Passwortlänge:", passwort.length);
    client = mqtt.connect(MQTT.url || `wss://${MQTT.host}:8884/mqtt`, {
      username: MQTT.benutzer, password: passwort,
      clientId: "sonnenlicht-" + Math.random().toString(16).slice(2, 10),
      reconnectPeriod: 4000, connectTimeout: 10000,
    });
    client.on("connect", () => {
      angemeldet = true;
      speicher("schreiben", passwort);
      anmeldungZeigen(false);
      st.online = true; zeichne();
      client.subscribe(`${MQTT.praefix}/#`, { qos: 1 });
    });
    client.on("close", () => { st.online = false; zeichne(); });
    client.on("error", fehler => {
      console.error("MQTT-Fehler:", fehler && fehler.code, fehler && fehler.message, fehler);
      const details = fehler ? ` (${fehler.code !== undefined ? "Code " + fehler.code + ": " : ""}${fehler.message || fehler})` : "";
      const falschesPw = fehler && (fehler.code === 4 || fehler.code === 5 || /authori|password|credential/i.test(fehler.message || ""));
      if (falschesPw || !angemeldet && !speicher("lesen")) {
        client.end(true);
        speicher("loeschen");
        anmeldungZeigen(true, (falschesPw ? "Anmeldung abgelehnt" : "Verbindung fehlgeschlagen") + details);
      }
    });
    client.on("message", (topic, inhalt) => mqttNachricht(topic, inhalt.toString()));
  }

  function welcher(d) {
    for (const [k, [dom, name]] of Object.entries(ENT)) {
      if (d.id === `${dom}/${name}` || d.id === `${dom}-${slug(name)}` ||
          d.name_id === `${dom}/${name}`) return k;
    }
    return null;
  }

  function verarbeite(d) {
    const k = welcher(d);
    if (!k) return;
    const zahl = Number(d.value ?? d.state);
    if (k === "lampe") {
      st.an = d.state === "ON";
      if (typeof d.brightness === "number" && Date.now() - letzteEingabe > 1500) st.hell = Math.round(d.brightness / 2.55);
      if (d.effect !== undefined) st.effekt = d.effect;
    } else if (k === "wecker") {
      st.wecker = d.value === true || d.state === "ON";
    } else if (k === "stunde" && !isNaN(zahl)) st.stunde = zahl;
    else if (k === "minute" && !isNaN(zahl)) st.minute = zahl;
    else if (k === "dauer" && !isNaN(zahl)) st.dauer = zahl;
    else if (k === "rest" && !isNaN(zahl)) st.rest = zahl;
    zeichne();
  }

  function verbinden() {
    const es = new EventSource("/events");
    es.addEventListener("state", ev => { try { verarbeite(JSON.parse(ev.data)); } catch (_) {} });
    es.onopen = () => { st.online = true; zeichne(); };
    es.onerror = () => { st.online = false; zeichne(); };
  }

  /* ---------- Darstellung ---------- */
  const $ = s => document.querySelector(s);
  const zwei = n => String(n).padStart(2, "0");
  const EFFEKTNAME = { Atmen: "Atmen", Kerze: "Kerzenschein" };

  function zeichne() {
    const schlaeft = st.rest > 0;
    const leuchtet = st.an || schlaeft;
    const h = leuchtet ? Math.max(0.12, st.hell / 100) : 0;
    const himmel = $("#himmel");
    himmel.style.setProperty("--h", h);
    himmel.classList.toggle("aus", !leuchtet);

    let zustand;
    if (!st.online) zustand = MQTT ? "Keine Verbindung über das Internet" : "Keine Verbindung zur Lampe";
    else if (!st.lampeOnline) zustand = "Die Lampe ist gerade nicht online";
    else if (schlaeft) zustand = `Wird langsam dunkler, noch ${st.rest} min`;
    else if (st.an) zustand = st.effekt !== "None" ? (EFFEKTNAME[st.effekt] || st.effekt) : `${st.hell} % hell`;
    else zustand = "Aus. Tippe auf den Himmel.";
    $("#zustand").textContent = zustand;

    const power = $("#power");
    power.textContent = leuchtet ? "Ausschalten" : "Einschalten";
    power.classList.toggle("ist-an", leuchtet);

    const regler = $("#regler");
    if (Date.now() - letzteEingabe > 1500) regler.value = st.hell || 1;
    regler.style.setProperty("--p", regler.value + "%");
    $("#prozent").textContent = st.an ? regler.value + " %" : "aus";

    document.querySelectorAll("[data-hell]").forEach(b =>
      b.classList.toggle("aktiv", st.an && st.effekt === "None" && Math.abs(st.hell - b.dataset.hell) <= 2));
    document.querySelectorAll("[data-effekt]").forEach(b =>
      b.classList.toggle("aktiv", st.an && st.effekt === b.dataset.effekt));

    $("#stopp").hidden = !schlaeft;
    $("#rest").textContent = schlaeft ? `noch ${st.rest} min` : "";
    $("#schlaf-info").textContent = schlaeft
      ? "Schlaf gut. Die Lampe geht von selbst aus."
      : "Die Lampe wird langsam dunkler und geht dann von selbst aus.";

    const w = $("#wecker");
    w.classList.toggle("an", st.wecker);
    w.setAttribute("aria-checked", String(st.wecker));
    const zeit = $("#zeit");
    if (document.activeElement !== zeit) zeit.value = `${zwei(st.stunde)}:${zwei(st.minute)}`;
    document.querySelectorAll("[data-dauer]").forEach(b => b.classList.toggle("aktiv", +b.dataset.dauer === st.dauer));
    const startMin = (st.stunde * 60 + st.minute - st.dauer + 1440) % 1440;
    $("#weck-info").textContent = st.wecker
      ? `Ab ${zwei(Math.floor(startMin / 60))}:${zwei(startMin % 60)} geht langsam die Sonne auf. Um ${zwei(st.stunde)}:${zwei(st.minute)} ist sie ganz hell.`
      : "Aus. Schalte es ein, dann weckt dich morgens ein langsamer Sonnenaufgang.";

    const verbunden = st.online && st.lampeOnline;
    $("#punkt").classList.toggle("ok", verbunden);
    $("#verbindung").textContent = verbunden
      ? (MQTT ? "Über das Internet verbunden" : "Mit der Lampe verbunden")
      : (st.online ? "Lampe nicht erreichbar" : "Verbinde …");
  }

  let toastTimer;
  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("zeigen");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("zeigen"), 2600);
  }

  /* ---------- Bedienung ---------- */
  function einAus() {
    if (st.rest > 0) {
      befehl("lampe", "turn_off", { transition: 1 });
      st.rest = 0; st.an = false;
    } else {
      befehl("lampe", "toggle");
      st.an = !st.an;
    }
    zeichne();
  }

  function verdrahten() {
    $("#hallo").textContent = `Heey ${NAME}`;
    $("#gruss").textContent = GRUSS;

    $("#himmel").addEventListener("click", einAus);
    $("#himmel").addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); einAus(); }
    });
    $("#power").addEventListener("click", einAus);

    const regler = $("#regler");
    let sperre = null;
    const senden = () => befehl("lampe", "turn_on",
      { brightness: Math.max(1, Math.round(regler.value * 2.55)), effect: "None", transition: 0 });
    regler.addEventListener("input", () => {
      letzteEingabe = Date.now();
      st.hell = +regler.value; st.an = true; st.effekt = "None";
      zeichne();
      if (!sperre) sperre = setTimeout(() => { sperre = null; senden(); }, 250);
    });
    regler.addEventListener("change", () => { letzteEingabe = Date.now(); senden(); });

    document.querySelectorAll("[data-hell]").forEach(b => b.addEventListener("click", () => {
      letzteEingabe = Date.now();
      st.hell = +b.dataset.hell; st.an = true; st.effekt = "None"; zeichne();
      befehl("lampe", "turn_on", { brightness: Math.round(b.dataset.hell * 2.55), effect: "None", transition: 1 });
    }));
    document.querySelectorAll("[data-effekt]").forEach(b => b.addEventListener("click", () => {
      const neu = st.effekt === b.dataset.effekt ? "None" : b.dataset.effekt;
      st.effekt = neu; st.an = true; zeichne();
      befehl("lampe", "turn_on", { effect: neu });
    }));

    document.querySelectorAll("[data-schlaf]").forEach(b => b.addEventListener("click", async () => {
      if (await befehl(b.dataset.schlaf, "press")) toast("Schlaf gut. Die Lampe wird jetzt langsam dunkler.");
    }));
    $("#stopp").addEventListener("click", async () => {
      if (await befehl("stopp", "press")) toast("Timer beendet. Die Helligkeit bleibt so.");
    });

    $("#wecker").addEventListener("click", () => {
      st.wecker = !st.wecker; zeichne();
      befehl("wecker", st.wecker ? "turn_on" : "turn_off");
    });
    $("#zeit").addEventListener("change", async e => {
      const [h, m] = e.target.value.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) return;
      st.stunde = h; st.minute = m; zeichne();
      const ok = await befehl("stunde", "set", { value: h }) && await befehl("minute", "set", { value: m });
      if (ok) toast(`Wecklicht gestellt: ganz hell um ${zwei(h)}:${zwei(m)}`);
    });
    document.querySelectorAll("[data-dauer]").forEach(b => b.addEventListener("click", () => {
      st.dauer = +b.dataset.dauer; zeichne();
      befehl("dauer", "set", { value: b.dataset.dauer });
    }));

    $("#gruss-knopf").addEventListener("click", async () => {
      if (await befehl("gruss", "press")) toast("Gruß ist unterwegs ♥");
    });
    $("#anmelde-form").addEventListener("submit", e => {
      e.preventDefault();
      const pw = $("#pw").value.trim();
      if (pw) mqttVerbinden(pw);
    });
    $("#abmelden").addEventListener("click", () => {
      if (client) client.end(true);
      speicher("loeschen");
      st.online = false; zeichne();
      anmeldungZeigen(true);
    });
  }

  /* ---------- Start ---------- */
  function start() {
    document.title = `Sonnenlicht für ${NAME}`;
    if (!document.querySelector('meta[name="viewport"]')) {
      const m = document.createElement("meta");
      m.name = "viewport"; m.content = "width=device-width, initial-scale=1";
      document.head.appendChild(m);
    }
    const farbe = document.createElement("meta");
    farbe.name = "theme-color"; farbe.content = "#1b1638";
    document.head.appendChild(farbe);

    // Rundliche Schrift laden (klappt nur mit Internet, sonst Systemschrift)
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&display=swap";
    document.head.appendChild(font);

    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    // Standard-Oberfläche von ESPHome entfernen
    document.querySelectorAll("esp-app").forEach(n => n.remove());
    new MutationObserver(() => document.querySelectorAll("esp-app").forEach(n => n.remove()))
      .observe(document.body, { childList: true });

    const root = document.createElement("div");
    root.id = "sl";
    root.innerHTML = HTML;
    document.body.appendChild(root);

    verdrahten();
    zeichne();
    if (MQTT) {
      $("#gruss-gruppe").hidden = false;
      $("#abmelden").hidden = false;
      const pw = speicher("lesen");
      if (pw) mqttVerbinden(pw); else anmeldungZeigen(true);
    } else {
      verbinden();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
