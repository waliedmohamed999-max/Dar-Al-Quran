import sanitizeHtml from "sanitize-html";

/** CMS bodies pass through this on save and before render. */
export const sanitizeBody = (html: string) =>
  sanitizeHtml(html, {
    allowedTags: ["p", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "blockquote", "a", "br", "hr", "img"],
    allowedAttributes: { a: ["href", "title", "rel"], img: ["src", "alt"] },
    allowedSchemes: ["https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }) },
  });

/** Provider tafsir HTML reduced to plain text. */
export const toPlainText = (html: string) => sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
