import { isIP } from "node:net";
import { domainToASCII } from "node:url";

import { DecodingMode, decodeHTML } from "entities";

const credentialMarker =
  /(?:sk_live_[A-Za-z0-9_-]{8,}|sk-(?:proj|svcacct)-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const asciiAtext = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]$/;
const whitespace = /^[\t\n\r ]$/;
const domainCodePoint = /^[\p{L}\p{M}\p{N}.-]$/u;
const domainBoundaryContinuation = /^[\p{L}\p{M}\p{N}_.-]$/u;
const textEncoder = new TextEncoder();
const maximumDecodedCodePoints = 65_536;

function decodePercentRuns(value: string): string {
  return value.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run.replace(/%([0-9a-f]{2})/gi, (_match, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
    }
  });
}

function collapseSensitiveEncodingNesting(input: string): string {
  return input
    .replace(/%(?:25)+/gi, "%")
    .replace(/&(?:(?:amp(?:;|(?=#))|#0*38;?|#[xX]0*26;?))+(?=(?:#|[A-Za-z]))/gi, "&");
}

export function decodeSensitiveMarkers(input: string): string {
  let current = input;
  for (let pass = 0; pass < 4; pass += 1) {
    const decoded = decodeHTML(
      decodePercentRuns(collapseSensitiveEncodingNesting(current))
        .replace(/%u([0-9A-Fa-f]{4})/g, (encoded, hexadecimal: string) => {
          const codePoint = Number.parseInt(hexadecimal, 16);
          return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : encoded;
        })
        .replace(/%U([0-9A-Fa-f]{8})/g, (encoded, hexadecimal: string) => {
          const codePoint = Number.parseInt(hexadecimal, 16);
          return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : encoded;
        }),
      DecodingMode.Legacy,
    );
    if (decoded === current) break;
    current = decoded;
  }
  return current;
}

function previousCodePointStart(value: string, end: number): number {
  const previous = end - 1;
  const low = value.charCodeAt(previous);
  if (low >= 0xdc00 && low <= 0xdfff && previous > 0) {
    const high = value.charCodeAt(previous - 1);
    if (high >= 0xd800 && high <= 0xdbff) return previous - 1;
  }
  return previous;
}

function nextCodePointEnd(value: string, start: number): number {
  const codePoint = value.codePointAt(start);
  return start + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
}

function codePointSlice(value: string, start: number, end: number): string {
  return value.slice(start, end);
}

function isWhitespaceAt(value: string, start: number, end: number): boolean {
  return whitespace.test(codePointSlice(value, start, end));
}

function isAtextAt(value: string, start: number, end: number): boolean {
  const character = codePointSlice(value, start, end);
  const codePoint = value.codePointAt(start);
  return asciiAtext.test(character) || (codePoint !== undefined && codePoint >= 0x80);
}

function removeEmailComments(value: string): string {
  const output: string[] = [];
  let commentDepth = 0;
  let quoted = false;
  let escaped = false;
  for (let cursor = 0; cursor < value.length; ) {
    const end = nextCodePointEnd(value, cursor);
    const character = value.slice(cursor, end);
    if (commentDepth > 0) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "(") commentDepth += 1;
      else if (character === ")") commentDepth -= 1;
      cursor = end;
      continue;
    }
    if (quoted) {
      output.push(character);
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      cursor = end;
      continue;
    }
    if (character === "(") commentDepth = 1;
    else {
      output.push(character);
      if (character === '"') quoted = true;
    }
    cursor = end;
  }
  return output.join("");
}

function skipWhitespaceBackward(value: string, end: number): number {
  let cursor = end;
  while (cursor > 0) {
    const start = previousCodePointStart(value, cursor);
    if (!isWhitespaceAt(value, start, cursor)) break;
    cursor = start;
  }
  return cursor;
}

function skipWhitespaceForward(value: string, start: number): number {
  let cursor = start;
  while (cursor < value.length) {
    const end = nextCodePointEnd(value, cursor);
    if (!isWhitespaceAt(value, cursor, end)) break;
    cursor = end;
  }
  return cursor;
}

function hasValidLocalBoundary(value: string, start: number): boolean {
  if (start === 0) return true;
  const previous = previousCodePointStart(value, start);
  const character = value.slice(previous, start);
  if (isWhitespaceAt(value, previous, start) || "(<[{".includes(character)) return true;
  return character === ":" && value.slice(0, previous).toLowerCase().endsWith("mailto");
}

function hasValidDotAtomLocal(value: string, end: number): boolean {
  let start = end;
  while (start > 0) {
    const previous = previousCodePointStart(value, start);
    const character = value.slice(previous, start);
    if (!(character === "." || isAtextAt(value, previous, start))) break;
    start = previous;
  }
  if (start === end || !hasValidLocalBoundary(value, start)) return false;
  const candidate = value.slice(start, end);
  if (
    candidate.startsWith(".") ||
    candidate.endsWith(".") ||
    candidate.includes("..") ||
    textEncoder.encode(candidate).byteLength > 64
  )
    return false;
  return true;
}

function isUnescapedQuote(value: string, index: number): boolean {
  if (value.charCodeAt(index) !== 0x22) return false;
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value.charCodeAt(cursor) === 0x5c; cursor -= 1)
    backslashCount += 1;
  return backslashCount % 2 === 0;
}

function isAllowedQuotedCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0d ||
    codePoint === 0x20 ||
    codePoint === 0x21 ||
    (codePoint >= 0x23 && codePoint <= 0x5b) ||
    (codePoint >= 0x5d && codePoint <= 0x7e) ||
    codePoint >= 0x80
  );
}

function hasValidQuotedLocal(value: string, end: number): boolean {
  const closingQuote = end - 1;
  if (!isUnescapedQuote(value, closingQuote)) return false;
  for (let openingQuote = closingQuote - 1; openingQuote >= 0; openingQuote -= 1) {
    if (!isUnescapedQuote(value, openingQuote)) continue;
    if (!hasValidLocalBoundary(value, openingQuote)) return false;
    for (let cursor = openingQuote + 1; cursor < closingQuote; ) {
      let codePoint = value.codePointAt(cursor);
      if (codePoint === undefined) return false;
      cursor = nextCodePointEnd(value, cursor);
      if (codePoint === 0x5c) {
        if (cursor >= closingQuote) return false;
        codePoint = value.codePointAt(cursor);
        if (codePoint === undefined) return false;
        cursor = nextCodePointEnd(value, cursor);
        if (!(codePoint === 0x09 || (codePoint >= 0x20 && codePoint <= 0x7e) || codePoint >= 0x80))
          return false;
      } else if (!isAllowedQuotedCodePoint(codePoint)) return false;
    }
    return textEncoder.encode(value.slice(openingQuote, end)).byteLength <= 64;
  }
  return false;
}

function isDomainDot(character: string): boolean {
  return character === "." || character === "。" || character === "．" || character === "｡";
}

function skipTrailingDomainDots(value: string, start: number): number {
  let cursor = start;
  while (cursor < value.length) {
    const end = nextCodePointEnd(value, cursor);
    if (!isDomainDot(value.slice(cursor, end))) break;
    cursor = end;
  }
  return cursor;
}

function hasValidDomainBoundary(value: string, end: number): boolean {
  if (end >= value.length) return true;
  const next = nextCodePointEnd(value, end);
  return !domainBoundaryContinuation.test(value.slice(end, next));
}

function hasValidDomainLiteral(value: string, start: number): boolean {
  const closing = value.indexOf("]", start + 1);
  const boundary = closing < 0 ? closing : skipTrailingDomainDots(value, closing + 1);
  if (closing < 0 || closing - start > 72 || !hasValidDomainBoundary(value, boundary)) return false;
  const literal = value.slice(start + 1, closing);
  if (literal.startsWith("IPv6:")) return isIP(literal.slice(5)) === 6;
  return isIP(literal) === 4;
}

function hasValidDnsDomain(value: string, start: number): boolean {
  let end = start;
  while (end < value.length) {
    const next = nextCodePointEnd(value, end);
    const character = value.slice(end, next);
    if (!(domainCodePoint.test(character) || isDomainDot(character))) break;
    end = next;
  }
  if (end === start || !hasValidDomainBoundary(value, end)) return false;
  while (end > start) {
    const previous = previousCodePointStart(value, end);
    if (!isDomainDot(value.slice(previous, end))) break;
    end = previous;
  }
  if (end === start) return false;
  const ascii = domainToASCII(value.slice(start, end));
  if (ascii.length === 0 || ascii.length > 253) return false;
  const labels = ascii.toLowerCase().split(".");
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (label.length === 0 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
      return false;
  }
  const topLevel = labels.at(-1) ?? "";
  return /^[a-z]{2,63}$/.test(topLevel) || /^xn--[a-z0-9-]{2,59}$/.test(topLevel);
}

function hasValidDomain(value: string, start: number): boolean {
  return value[start] === "["
    ? hasValidDomainLiteral(value, start)
    : hasValidDnsDomain(value, start);
}

function containsEmailIdentifierWithoutComments(value: string): boolean {
  for (let at = value.indexOf("@"); at >= 0; at = value.indexOf("@", at + 1)) {
    const localEnd = skipWhitespaceBackward(value, at);
    const domainStart = skipWhitespaceForward(value, at + 1);
    if (!hasValidDomain(value, domainStart)) continue;
    if (hasValidDotAtomLocal(value, localEnd) || hasValidQuotedLocal(value, localEnd)) return true;
  }
  return false;
}

export function containsEmailIdentifier(input: string): boolean {
  if (containsEmailIdentifierWithoutComments(input)) return true;
  const withoutComments = removeEmailComments(input);
  return withoutComments !== input && containsEmailIdentifierWithoutComments(withoutComments);
}

function exceedsDecodedCodePointLimit(value: string): boolean {
  let count = 0;
  for (const _codePoint of value) {
    count += 1;
    if (count > maximumDecodedCodePoints) return true;
  }
  return false;
}

function normalizePreservingNonAsciiCfws(value: string): string {
  let normalized = "";
  for (const character of value) {
    const replacement = character.normalize("NFKC");
    normalized +=
      (character.codePointAt(0) ?? 0) >= 0x80 && /^[\t\n\r ]+$/.test(replacement)
        ? character
        : replacement;
  }
  return normalized;
}

function containsUrlUserinfo(value: string): boolean {
  for (const match of value.matchAll(/(?:https?|ftp):\/\//giu)) {
    const start = match.index + match[0].length;
    let end = start;
    while (end < value.length) {
      const next = nextCodePointEnd(value, end);
      if (/^[\t\n\r /?#]$/.test(value.slice(end, next))) break;
      end = next;
    }
    const authority = value.slice(start, end);
    const at = authority.lastIndexOf("@");
    if (at > 0 && at < authority.length - 1) return true;
  }
  return false;
}

export function containsSensitivePublicMarker(value: string): boolean {
  const decoded = decodeSensitiveMarkers(value);
  const normalized = normalizePreservingNonAsciiCfws(decoded);
  if (exceedsDecodedCodePointLimit(decoded) || exceedsDecodedCodePointLimit(normalized))
    return true;
  const variants = new Set([
    decoded,
    normalized,
    decoded.replace(/\p{Default_Ignorable_Code_Point}/gu, ""),
    normalized.replace(/\p{Default_Ignorable_Code_Point}/gu, ""),
  ]);
  for (const variant of variants) {
    if (
      credentialMarker.test(variant) ||
      containsEmailIdentifier(variant) ||
      containsUrlUserinfo(variant)
    )
      return true;
  }
  return false;
}

export const publicSourceScannerSelfTests: ReadonlyArray<
  readonly [label: string, value: string, expectedSensitive: boolean]
> = [
  ["direct email", "alice@example.org", true],
  ["trailing sentence-dot email", "alice@example.org.", true],
  ["trailing Unicode-dot email", "alice@example.org。", true],
  ["trailing ellipsis email", "alice@example.org...", true],
  ["encoded trailing-dot email", "alice&commat;example&period;org&period;", true],
  ["domain-literal trailing-dot email", "alice@[127.0.0.1].", true],
  ["parenthesized email", "Contact (alice@example.org).", true],
  ["encoded parenthesized email", "%28alice%40example.org%29", true],
  ["HTML parenthesized email", "&lpar;alice&commat;example&period;org&rpar;", true],
  ["mailto email", "mailto:alice@example.org", true],
  ["URL userinfo identifier", "https://user:secret@example.org/feed.xml", true],
  ["percent email", "alice%40example.org", true],
  ["double-percent email", "alice%2540example.org", true],
  ["JavaScript escape email", "alice%u0040example.org", true],
  ["numeric HTML email", "alice&#64;example&period;org", true],
  ["semicolonless HTML email", "alice&#64example.org", true],
  ["nested HTML email", "alice&amp;#64;example.org", true],
  ["named HTML email", "alice&commat;example&period;org", true],
  ["nested named HTML email", "alice&ampcommat;example&ampperiod;org", true],
  ["mixed nested HTML email", "alice&amp;&#38;&#64example.org", true],
  ["HTML5 Unicode local email", "&alpha;&commat;example&period;org", true],
  ["uppercase HTML5 quote alias", "&QUOT;alice&QUOT;&commat;example&period;org", true],
  ["mixed-case unknown HTML alias", "alice&CommaT;example&period;org", false],
  ["Unicode at-sign email", "alice＠example.org", true],
  ["Unicode at-sign with ASCII CFWS", "alice ＠ example.org", true],
  ["default-ignorable email", "ali\u200bce@example.org", true],
  ["Unicode local email", "élise@example.org", true],
  ["EAI symbol local email", "😀@example.org", true],
  ["percent EAI local email", "%F0%9F%98%80%40example.org", true],
  ["numeric EAI local email", "&#128512;&#64;example.org", true],
  ["private-use EAI local email", "\uE000@example.org", true],
  ["C1 EAI local email", "\u0080@example.org", true],
  ["non-ASCII space EAI local email", "\u00A0@example.org", true],
  ["unassigned EAI local email", "\u0378@example.org", true],
  ["noncharacter EAI local email", "\uFFFF@example.org", true],
  ["default-ignorable EAI local email", "\u200B@example.org", true],
  ["HTML5 default-ignorable EAI local email", "&ZeroWidthSpace;&commat;example&period;org", true],
  ["quoted local email", '"alice"@example.org', true],
  ["quoted escaped local email", '"ali\\\\ce"@example.org', true],
  ["quoted Unicode local email", '"álîçé"@example.org', true],
  ["encoded quoted local email", "&quot;alice&quot;&commat;example&period;org", true],
  ["commented local email", "alice(comment)@example.org", true],
  ["commented domain email", "alice@(comment)example.org", true],
  ["CFWS email", "alice (comment) @ example.org", true],
  ["quoted CFWS email", '"alice" (comment) @ example.org', true],
  ["encoded CFWS email", "%22alice%22%28comment%29%40example.org", true],
  ["Unicode domain email", "alice@example.орг", true],
  ["combining-mark IDN email", "alice@e\u0301xample.org", true],
  ["punycode email", "alice@example.xn--p1ai", true],
  ["IPv4 domain literal", "alice@[127.0.0.1]", true],
  ["IPv6 domain literal", "alice@[IPv6:2001:db8::1]", true],
  [
    "encoded IPv6 domain literal",
    "alice&commat;&lbrack;IPv6&colon;2001&colon;db8&colon;&colon;1&rsqb;",
    true,
  ],
  ["credential", "sk_live_example_secret", true],
  ["default-ignorable credential", "sk_li\u200bve_example_secret", true],
  ["machine handle", "release@2", false],
  ["quoted machine handle", '"release"@2', false],
  ["legitimate ampersand", "R&D", false],
  ["legitimate amp prefix", "R&amplitude", false],
  ["literal unresolved markers", "policy &#fragment, &CommaT;, &unknown; and %not-encoding", false],
  ["legitimate percentage", "50%", false],
  ["legitimate encoded URL", "https://example.org/a%2Fb", false],
  ["inert traversal", "../../secrets.txt", false],
  ["inert file URI", "file:///etc/passwd", false],
  ["legitimate Unicode", "Café démonstration", false],
  ["non-ASCII domain separator", "alice@\u00A0example.org", false],
  ["figure-space domain separator", "alice@\u2007example.org", false],
  ["narrow-no-break domain separator", "alice@\u202Fexample.org", false],
  ["ideographic-space domain separator", "alice@\u3000example.org", false],
  ["C0-separated local token", "ali\u0000ce@example.org", false],
  ["colon-separated local token", "ali:ce@example.org", false],
  ["comma-separated local token", "ali,ce@example.org", false],
  ["RFC slash atext email", "ali/ce@example.org", true],
  ["leading-dot local", ".alice@example.org", false],
  ["trailing-dot local", "alice.@example.org", false],
  ["double-dot local", "alice..ops@example.org", false],
  ["overlong local", `${"a".repeat(65)}@example.org`, false],
  ["prefixed quoted local", `x"alice"@example.org`, false],
  ["suffixed quoted local", `"alice"x@example.org`, false],
  ["leading-hyphen domain", "alice@-example.org", false],
  ["trailing-hyphen domain", "alice@example-.org", false],
  ["empty domain label", "alice@example..org", false],
  ["empty domain label with punctuation", "alice@example..org.", false],
  ["overlong domain label", `alice@${"a".repeat(64)}.org`, false],
  ["single-letter TLD", "alice@example.c", false],
  ["maximum public non-email", "a".repeat(65_536), false],
  ["normalization expansion overflow", "ﷺ".repeat(4_000), true],
  ["maximum malformed quoted local", `${"a".repeat(65_520)}"@example.org`, false],
];

export function publicSourceScannerSelfTestFailures(): string[] {
  const failures: string[] = [];
  for (const [label, value, expectedSensitive] of publicSourceScannerSelfTests) {
    if (containsSensitivePublicMarker(value) !== expectedSensitive) failures.push(label);
  }
  return failures;
}
