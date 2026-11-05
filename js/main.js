(function () {
  "use strict";

  // The `.js` class is set by an inline script in <head>, before first paint.

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Element references ---------- */
  var photo = document.getElementById("profile-photo");
  var header = document.getElementById("top");
  var navToggle = document.getElementById("nav-toggle");
  var navLinks = document.getElementById("nav-links");
  var backToTop = document.getElementById("back-to-top");
  var sections = Array.prototype.slice.call(document.querySelectorAll("main .section[id]"));
  var revealEls = document.querySelectorAll(".reveal");
  var progressBar = document.querySelector(".scroll-progress");

  /* ---------- Number list items so CSS can stagger them (--i) ---------- */
  document.querySelectorAll(".stagger, .nav-links, .repo-grid").forEach(function (list) {
    Array.prototype.forEach.call(list.children, function (child, i) {
      child.style.setProperty("--i", i);
    });
  });

  /* ---------- Fallback avatar if profile.jpg hasn't been uploaded yet ---------- */
  function initialsAvatarDataUri(initials, bg) {
    var svg =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'>" +
      "<rect width='160' height='160' fill='" + bg + "'/>" +
      "<text x='80' y='100' font-size='58' font-family='Georgia,serif' fill='#ffffff' text-anchor='middle'>" + initials + "</text>" +
      "</svg>";
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  if (photo) {
    var wrap = photo.parentElement;
    var photoDone = function () { wrap.classList.remove("loading"); };
    if (photo.complete) photoDone();
    else {
      photo.addEventListener("load", photoDone, { once: true });
      photo.addEventListener("error", photoDone, { once: true });
    }
    photo.addEventListener("error", function onErr() {
      photo.removeEventListener("error", onErr);
      photo.src = initialsAvatarDataUri("AV", "#1d3557");
      photo.classList.add("is-fallback");
    });
  }

  /* ---------- Mobile nav toggle ---------- */
  function closeNav() {
    navLinks.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  }
  function openNav() {
    navLinks.classList.add("open");
    navToggle.setAttribute("aria-expanded", "true");
  }

  navToggle.addEventListener("click", function () {
    var expanded = navToggle.getAttribute("aria-expanded") === "true";
    if (expanded) closeNav(); else openNav();
  });

  navLinks.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", closeNav);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeNav();
  });

  document.addEventListener("click", function (e) {
    var withinNav = e.target.closest(".site-nav");
    if (!withinNav) closeNav();
  });

  /* ---------- Scrollspy: highlight active nav link ---------- */
  var navLinkByHref = {};
  navLinks.querySelectorAll("a").forEach(function (a) {
    navLinkByHref[a.getAttribute("href")] = a;
  });

  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var link = navLinkByHref["#" + entry.target.id];
          if (!link) return;
          if (entry.isIntersecting) {
            Object.keys(navLinkByHref).forEach(function (href) {
              navLinkByHref[href].classList.remove("active");
            });
            link.classList.add("active");
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------- Scroll-reveal for sections ---------- */
  if ("IntersectionObserver" in window && !reduceMotion) {
    var reveal = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var section = entry.target;
            section.classList.add("in-view");
            obs.unobserve(section);
            // After the staggered entrance, drop the delays so hovers react at once.
            setTimeout(function () {
              section.querySelectorAll(".stagger").forEach(function (l) { l.classList.add("settled"); });
            }, 1400);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el) { reveal.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in-view"); });
    document.querySelectorAll(".stagger").forEach(function (l) { l.classList.add("settled"); });
  }

  /* ---------- Back to top ---------- */
  function toggleBackToTop() {
    if (window.scrollY > window.innerHeight * 0.6) {
      backToTop.classList.add("visible");
    } else {
      backToTop.classList.remove("visible");
    }
  }
  backToTop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });

  /* ---------- Reading progress bar under the header ---------- */
  function updateProgress() {
    if (!progressBar) return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.setProperty("--progress", max > 0 ? Math.min(1, window.scrollY / max) : 0);
  }

  /* ---------- Header scroll state ---------- */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      applyScroll();
    });
  }
  function applyScroll() {
    if (window.scrollY > 12) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
    toggleBackToTop();
    updateProgress();
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  applyScroll();
})();
