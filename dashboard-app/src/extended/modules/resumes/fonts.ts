// The résumé typefaces are only needed on the résumé pages, so they are not part
// of the page's first load (index.html fetches the interface font alone). The
// first résumé page to open adds this stylesheet once; later calls do nothing.
const HREF =
  "https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=Crimson+Pro:ital,wght@0,400;0,700;1,400;1,700&family=EB+Garamond:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@400;700&family=Lato:ital,wght@0,400;0,700;1,400;1,700&family=Merriweather:ital,wght@0,400;0,700;1,400;1,700&family=Open+Sans:ital,wght@0,400;0,700;1,400;1,700&family=Lora:ital,wght@0,400;0,700;1,400;1,700&family=Source+Serif+4:ital,wght@0,400;0,700;1,400;1,700&family=Vollkorn:ital,wght@0,400;0,700;1,400;1,700&display=swap";

export function loadResumeFonts(): void {
  if (typeof document === "undefined" || document.getElementById("resume-fonts")) return;
  const link = document.createElement("link");
  link.id = "resume-fonts";
  link.rel = "stylesheet";
  link.href = HREF;
  document.head.appendChild(link);
}
