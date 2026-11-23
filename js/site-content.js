// Fills the profile page with the content published from the dashboard
// (Workspace → Website). The text in index.html is the fallback: it shows until
// the published content arrives, and stays if it cannot be fetched.
(function () {
  "use strict";

  var CACHE_KEY = "site-content:v1";
  // Unpublished edits, written by the dashboard editor in this same browser. Only ever
  // read on the preview address (?preview=1), so visitors always get the published page.
  var PREVIEW_KEY = "site-content:preview";
  var config = window.SITE_CONFIG || {};

  var LINKS = [
    ["orcid", "orcid", "ORCID profile"],
    ["scholar", "scholar", "Google Scholar profile"],
    ["researchgate", "researchgate", "ResearchGate profile"],
    ["github", "github", "GitHub profile"],
    ["linkedin", "linkedin", "LinkedIn profile"]
  ];

  /* ---------- Small DOM helpers (text only: nothing published is treated as HTML) ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function str(v) { return typeof v === "string" ? v.trim() : ""; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function safeUrl(v) {
    var s = str(v);
    return /^(https?:\/\/|mailto:)/i.test(s) ? s : "";
  }
  function link(href, text, className) {
    var a = el("a", className, text);
    a.href = href;
    if (!/^mailto:/i.test(href)) { a.target = "_blank"; a.rel = "noopener"; }
    return a;
  }
  /** "Smith J, **Viswanathan A**, Lee K" → text with the starred part in bold. */
  function appendRich(parent, text) {
    str(text).split(/\*\*(.+?)\*\*/).forEach(function (part, i) {
      if (!part) return;
      parent.appendChild(i % 2 ? el("strong", "", part) : document.createTextNode(part));
    });
  }
  function icon(name) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS(ns, "use");
    use.setAttribute("href", "assets/img/icons.svg#" + name);
    svg.appendChild(use);
    return svg;
  }
  function each(name, fn) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-site="' + name + '"]'), fn);
  }
  function setText(name, value) {
    var v = str(value);
    if (v) each(name, function (node) { node.textContent = v; });
  }
  /** Replace a list's items, number them for the staggered entrance, and hide the
   *  list with its heading when there is nothing to show. */
  function setList(name, items) {
    each(name, function (list) {
      list.textContent = "";
      items.forEach(function (item, i) {
        item.style.setProperty("--i", i);
        list.appendChild(item);
      });
      list.hidden = !items.length;
    });
    each(name + "-head", function (head) { head.hidden = !items.length; });
  }

  /* ---------- Builders, one per kind of entry ---------- */
  function span(className, text) { return str(text) ? el("span", className, str(text)) : null; }
  function add(parent, child) { if (child) { parent.appendChild(child); parent.appendChild(document.createTextNode(" ")); } }
  function titleNode(item) {
    var title = el("span", "pub-title");
    var url = safeUrl(item.url);
    if (url) title.appendChild(link(url, str(item.title)));
    else title.textContent = str(item.title);
    return title;
  }
  function publication(item) {
    var li = el("li", "pub-item");
    li.appendChild(el("span", "pub-year", str(item.year)));
    var p = el("p", "pub-text");
    if (str(item.authors)) { var authors = el("span", "pub-authors"); appendRich(authors, item.authors); add(p, authors); }
    add(p, titleNode(item));
    add(p, span("pub-venue", item.venue));
    add(p, span("pub-badge", item.badge));
    li.appendChild(p);
    return li;
  }
  function presentation(item) {
    var li = el("li", "pub-item");
    li.appendChild(el("span", "pub-year", str(item.year)));
    var box = el("div", "pub-text");
    var p = el("p", "pub-text");
    add(p, titleNode(item));
    add(p, span("pub-venue", item.venue));
    box.appendChild(p);
    if (str(item.note)) box.appendChild(el("p", "pub-note", str(item.note)));
    li.appendChild(box);
    return li;
  }
  function timelineEntry(item) {
    var li = el("li");
    add(li, span("tl-role", item.role));
    add(li, span("tl-org", item.org));
    add(li, span("tl-date", item.date));
    return li;
  }
  function has(key) { return function (item) { return item && str(item[key]); }; }

  /* ---------- Apply one published document to the page ---------- */
  function apply(c) {
    if (!c || typeof c !== "object") return;

    setText("tagline", c.tagline);
    setText("location", c.location);
    setText("bio", c.bio);
    if (str(c.bio)) each("bio", function (node) { node.style.whiteSpace = "pre-line"; }); // keep paragraph breaks
    setText("address", c.address);

    var emails = arr(c.emails).map(str).filter(function (e) { return /^[^@\s]+@[^@\s]+$/.test(e); });
    if (emails.length) {
      each("emails", function (box) {
        box.textContent = "";
        emails.forEach(function (email, i) {
          if (i) { box.appendChild(document.createTextNode(" ")); box.appendChild(el("span", "sep", "·")); box.appendChild(document.createTextNode(" ")); }
          box.appendChild(link("mailto:" + email, email));
        });
      });
    }

    if (c.links && typeof c.links === "object") {
      each("links", function (list) {
        list.textContent = "";
        var entries = emails.length ? [["mailto:" + emails[0], "envelope", "Email"]] : [];
        LINKS.forEach(function (def) {
          var url = safeUrl(c.links[def[0]]);
          if (url) entries.push([url, def[1], def[2]]);
        });
        entries.forEach(function (entry) {
          var li = el("li");
          var a = link(entry[0], "");
          a.setAttribute("aria-label", entry[2]);
          a.appendChild(icon(entry[1]));
          li.appendChild(a);
          list.appendChild(li);
        });
      });
      var scholar = safeUrl(c.links.scholar);
      each("scholar-more", function (p) {
        p.hidden = !scholar;
        var a = p.querySelector("a");
        if (a && scholar) a.href = scholar;
      });
    }

    if (Array.isArray(c.interests)) {
      setList("interests", c.interests.map(str).filter(Boolean).map(function (t) { return el("li", "tag", t); }));
    }
    if (Array.isArray(c.publications)) setList("publications", c.publications.filter(has("title")).map(publication));
    if (Array.isArray(c.presentations)) setList("presentations", c.presentations.filter(has("title")).map(presentation));
    if (Array.isArray(c.awards)) {
      setList("awards", c.awards.map(str).filter(Boolean).map(function (t) { return el("li", "", t); }));
    }
    if (Array.isArray(c.experience)) setList("experience", c.experience.filter(has("role")).map(timelineEntry));
    if (Array.isArray(c.education)) setList("education", c.education.filter(has("role")).map(timelineEntry));

    var cv = safeUrl(c.cv_url);
    var cvButton = document.getElementById("cv-button");
    if (cv && cvButton) cvButton.href = cv;
    var photoUrl = safeUrl(c.photo_url);
    var photo = document.getElementById("profile-photo");
    if (photoUrl && photo && photo.src !== photoUrl) photo.src = photoUrl;
  }

  /* ---------- Preview: show the editor's draft, and follow it as it changes ---------- */
  if (/[?&]preview=1(&|$)/.test(window.location.search)) {
    var draft = "";
    try { draft = window.localStorage.getItem(PREVIEW_KEY) || ""; } catch (e) { /* storage blocked */ }
    if (draft) {
      try { apply(JSON.parse(draft)); } catch (e) { /* unreadable draft: show the page as it is */ }
      var note = el("div", "", "Preview: these changes are not published yet");
      note.setAttribute("role", "status");
      note.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:1000;padding:8px 16px;border-radius:999px;background:#1d3557;color:#fff;font:500 14px/1.3 Inter,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);max-width:calc(100vw - 32px);text-align:center";
      document.body.appendChild(note);
      window.addEventListener("storage", function (e) {
        if (e.key !== PREVIEW_KEY || !e.newValue) return;
        try { apply(JSON.parse(e.newValue)); } catch (err) { /* ignore a half-written draft */ }
      });
      return;
    }
  }

  /* ---------- Last published copy first (no flicker on a return visit), then the newest ---------- */
  var cached = "";
  try { cached = window.localStorage.getItem(CACHE_KEY) || ""; } catch (e) { /* storage blocked */ }
  if (cached) {
    try { apply(JSON.parse(cached)); } catch (e) { cached = ""; }
  }

  if (!config.url || !config.key || !window.fetch) return;
  fetch(config.url.replace(/\/+$/, "") + "/rest/v1/ws_site?select=content&limit=1", {
    headers: { apikey: config.key, Accept: "application/json" }
  })
    .then(function (res) { return res.ok ? res.json() : []; })
    .then(function (rows) {
      var content = rows && rows[0] && rows[0].content;
      if (!content || !Object.keys(content).length) return;
      var fresh = JSON.stringify(content);
      if (fresh === cached) return;
      apply(content);
      try { window.localStorage.setItem(CACHE_KEY, fresh); } catch (e) { /* storage blocked */ }
    })
    .catch(function () { /* offline or not set up: the page keeps what it has */ });
})();
